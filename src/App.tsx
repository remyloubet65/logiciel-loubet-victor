import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import Auth from './auth'
import { printHtml } from './print'

// ---------- Types ----------
type Entreprise = {
  id?: number
  user_id: string
  nom: string
  adresse: string
  telephone: string
  email: string
  siret: string
  signature_data_url?: string | null
}

type Prestation = { id?: number; user_id: string; nom: string; prix: number }
type Ligne = { id: string; nom: string; qte: number; pu: number }
type Dossier = {
  id?: number
  user_id: string
  reference: string
  defunt_nom: string
  defunt_prenom: string
  famille_contact: string
  ceremonie_date?: string | null
  ceremonie_lieu?: string | null
  prestations: string[]
  marbrerie: Ligne[]
  autres: Ligne[]
  cree_le: string
  modifie_le: string
  archive?: boolean
}

// ---------- Helpers ----------
const currency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0)
const uid = () => Math.random().toString(36).slice(2, 9)

const defaultPrestations: Omit<Prestation, 'id' | 'user_id'>[] = [
  { nom: 'Mise en bière et fermeture du cercueil', prix: 290 },
  { nom: 'Cercueil chêne – gamme classique', prix: 780 },
  { nom: 'Capitonnage tissu écru', prix: 180 },
  { nom: 'Transport (forfait 50 km)', prix: 220 },
  { nom: 'Maître de cérémonie', prix: 200 },
  { nom: 'Démarches administratives', prix: 95 },
  { nom: 'Ouverture/fermeture de caveau', prix: 350 },
  { nom: 'Urne funéraire – standard', prix: 120 },
]

// ---------- Root ----------
export default function App() {
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!session) return <Auth />
  return <Dashboard userId={session.user.id} email={session.user.email} />
}

// ---------- Dashboard ----------
function Dashboard({ userId, email }: { userId: string; email: string }) {
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null)
  const [prestations, setPrestations] = useState<Prestation[]>([])
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [tab, setTab] = useState<'dossiers' | 'tarifs' | 'param'>('dossiers')
  const [q, setQ] = useState('')
  const [currentId, setCurrentId] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Chargement initial
  useEffect(() => {
    ;(async () => {
      // Entreprise
      const { data: e } = await supabase
        .from('entreprise')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (!e) {
        const empty: Entreprise = {
          user_id: userId,
          nom: 'Pompes Funèbres Loubet-Victor',
          adresse: '',
          telephone: '',
          email: email || '',
          siret: '',
          signature_data_url: null,
        }
        const { data: ins } = await supabase
          .from('entreprise')
          .insert(empty)
          .select()
          .single()
        setEntreprise(ins as Entreprise)
      } else {
        setEntreprise(e as Entreprise)
      }

      // Prestations
      let { data: pr } = await supabase
        .from('prestations')
        .select('*')
        .eq('user_id', userId)
        .order('id', { ascending: false })
      if (!pr || pr.length === 0) {
        const toIns = defaultPrestations.map((p) => ({ ...p, user_id: userId }))
        const { data: seeded } = await supabase.from('prestations').insert(toIns).select()
        pr = seeded || []
      }
      setPrestations(pr as Prestation[])

      // Dossiers
      const { data: ds } = await supabase
        .from('dossiers')
        .select('*')
        .eq('user_id', userId)
        .order('modifie_le', { ascending: false })
      setDossiers((ds || []) as Dossier[])
    })()
  }, [userId, email])

  const current = useMemo(
    () => dossiers.find((d) => d.id === currentId) || null,
    [dossiers, currentId],
  )

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return dossiers.filter((d) => !d.archive)
    return dossiers.filter(
      (d) =>
        !d.archive &&
        (d.reference.toLowerCase().includes(query) ||
          `${d.defunt_nom} ${d.defunt_prenom}`.toLowerCase().includes(query) ||
          (d.famille_contact || '').toLowerCase().includes(query) ||
          (d.ceremonie_lieu || '').toLowerCase().includes(query)),
    )
  }, [q, dossiers])

  // CRUD dossiers
  async function newDossier() {
    const now = new Date().toISOString()
    const d: Dossier = {
      user_id: userId,
      reference: `PFV-${new Date().getFullYear()}-${String(dossiers.length + 1).padStart(4, '0')}`,
      defunt_nom: '',
      defunt_prenom: '',
      famille_contact: '',
      prestations: [],
      marbrerie: [],
      autres: [],
      cree_le: now,
      modifie_le: now,
    }
    const { data: ins, error } = await supabase.from('dossiers').insert(d).select().single()
    if (error) {
      alert(error.message)
      return
    }
    setDossiers((prev) => [ins as Dossier, ...prev]) // ✅ pas de "*prev"
    setCurrentId((ins as any).id as number)
  }

  async function updateCurrent(patch: Partial<Dossier>) {
    if (!current) return
    const upd = { ...current, ...patch, modifie_le: new Date().toISOString() }
    const { data: saved, error } = await supabase
      .from('dossiers')
      .update(upd)
      .eq('id', current.id)
      .select()
      .single()
    if (error) {
      alert(error.message)
      return
    }
    setDossiers((prev) => prev.map((d) => (d.id === current.id ? (saved as Dossier) : d)))
  }

  async function removeDossier() {
    if (!current) return
    if (!confirm('Archiver ce dossier ?')) return
    await updateCurrent({ archive: true } as any)
    setCurrentId(null)
  }

  // Totaux
  const prixPrest = (d: Dossier) => {
    const map = new Map(prestations.map((p) => [String(p.id), p] as const))
    return d.prestations.reduce((s, id) => s + (map.get(String(id))?.prix || 0), 0)
  }
  const totalLignes = (lst: Ligne[]) => lst.reduce((s, l) => s + l.qte * (l.pu || 0), 0)
  const totalDossier = (d: Dossier) => prixPrest(d) + totalLignes(d.marbrerie) + totalLignes(d.autres)

  // Export / Import
  function exportJSON() {
    const blob = new Blob(
      [JSON.stringify({ dossiers, prestations, entreprise }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pfv_export_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function importJSON(file: File) {
    const r = new FileReader()
    r.onload = async () => {
      try {
        const data = JSON.parse(String(r.result))
        if (Array.isArray(data.prestations)) {
          for (const p of data.prestations) {
            await supabase.from('prestations').upsert({ user_id: userId, nom: p.nom, prix: p.prix })
          }
        }
        if (Array.isArray(data.dossiers)) {
          for (const d of data.dossiers) {
            await supabase.from('dossiers').insert({ ...d, id: undefined, user_id: userId })
          }
        }
        alert('Import terminé')
        location.reload()
      } catch {
        alert('Fichier invalide')
      }
    }
    r.readAsText(file)
  }

  async function saveEntreprisePatch(patch: Partial<Entreprise>) {
    if (!entreprise) return
    const { data, error } = await supabase
      .from('entreprise')
      .update({ ...entreprise, ...patch })
      .eq('id', entreprise.id)
      .select()
      .single()
    if (error) {
      alert(error.message)
      return
    }
    setEntreprise(data as Entreprise)
  }

  function openDevisAndPrint(d: Dossier) {
    const map = new Map(prestations.map((p) => [String(p.id), p] as const))
    const lignesPrest = d.prestations
      .map((id) => map.get(String(id)))
      .filter(Boolean)
      .map((p) => ({ nom: (p as any).nom, prix: (p as any).prix }))

    const rowsPrest = lignesPrest
      .map((p) => `<tr><td>${escapeHtml(p.nom)}</td><td style="text-align:right">${currency(p.prix)}</td></tr>`)
      .join('')
    const rowsMarb = d.marbrerie
      .map((l) => `<tr><td>${escapeHtml(l.nom)} × ${l.qte}</td><td style="text-align:right">${currency(l.qte * l.pu)}</td></tr>`)
      .join('')
    const rowsAutres = d.autres
      .map((l) => `<tr><td>${escapeHtml(l.nom)} × ${l.qte}</td><td style="text-align:right">${currency(l.qte * l.pu)}</td></tr>`)
      .join('')

    const sig = entreprise?.signature_data_url
      ? `<div><div style="color:#666;font-size:12px">Signature</div><img src="${entreprise.signature_data_url}" alt="signature" style="height:60px"/></div>`
      : ''

    const html = `
      <h2>Devis n° ${escapeHtml(d.reference)}</h2>
      <div style="color:#666">Établi le ${new Date().toLocaleDateString('fr-FR')}</div>
      <div style="margin-top:8px"><strong>Défunt :</strong> ${escapeHtml(d.defunt_prenom)} ${escapeHtml(d.defunt_nom)}</div>
      ${d.ceremonie_date ? `<div style="color:#666">Cérémonie : ${new Date(d.ceremonie_date).toLocaleString('fr-FR')}${d.ceremonie_lieu ? ' • ' + escapeHtml(d.ceremonie_lieu) : ''}</div>` : ''}
      <table style="width:100%;border-collapse:collapse;margin-top:12px">
        <thead><tr><th style="text-align:left">Libellé</th><th style="text-align:right">Prix</th></tr></thead>
        <tbody>${rowsPrest}${rowsMarb}${rowsAutres}</tbody>
      </table>
      <div style="text-align:right;font-weight:700;margin-top:8">Total TTC : ${currency(totalDossier(d))}</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:16px">
        <div style="color:#666">Devis valable 30 jours. Prix TTC indicatifs.</div>
        ${sig}
      </div>
    `
    printHtml(html)
  }

  function escapeHtml(s: string) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // ---------- UI ----------
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', minHeight: '100vh' }}>
      <aside style={{ borderRight: '1px solid #eee', padding: 16, background: 'white' }}>
        <h3 style={{ margin: 0 }}>{entreprise?.nom || '...'}</h3>
        <div style={{ color: '#666', fontSize: 12 }}>{entreprise?.adresse}</div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={newDossier}>➕ Nouveau dossier</button>
          <button onClick={exportJSON}>⬇️ Exporter</button>
          <button onClick={() => fileRef.current?.click()}>⬆️ Importer</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importJSON(f)
              ;(e.target as HTMLInputElement).value = ''
            }}
          />
        </div>

        <div style={{ display: 'grid', gap: 6, marginTop: 16 }}>
          <button onClick={() => setTab('dossiers')} style={{ textAlign: 'left', background: tab === 'dossiers' ? '#eef7ee' : 'white' }}>
            📁 Dossiers
          </button>
          <button onClick={() => setTab('tarifs')} style={{ textAlign: 'left', background: tab === 'tarifs' ? '#eef7ee' : 'white' }}>
            💶 Tarifs
          </button>
          <button onClick={() => setTab('param')} style={{ textAlign: 'left', background: tab === 'param' ? '#eef7ee' : 'white' }}>
            ⚙️ Paramètres
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <button onClick={() => supabase.auth.signOut()}>🚪 Se déconnecter</button>
        </div>
      </aside>

      <main style={{ padding: 20 }}>
        {tab === 'dossiers' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <input
                placeholder="Recherche (nom, famille, référence, lieu…)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ width: '100%', padding: 8 }}
              />
              <div style={{ marginTop: 8, maxHeight: '60vh', overflow: 'auto', display: 'grid', gap: 8 }}>
                {filtered.map((d) => (
                  <button
                    key={String(d.id)}
                    style={{ textAlign: 'left', padding: 8, border: '1px solid #eee', borderRadius: 8, background: 'white' }}
                    onClick={() => setCurrentId(d.id!)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>
                        {d.defunt_prenom || '?'} {d.defunt_nom || '?'}
                      </strong>
                      <span style={{ color: '#333' }}>{currency(totalDossier(d))}</span>
                    </div>
                    <small style={{ color: '#666' }}>
                      {d.reference}
                      {d.ceremonie_lieu ? ' • ' + d.ceremonie_lieu : ''}
                    </small>
                  </button>
                ))}
              </div>
            </div>

            <div>
              {current ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => openDevisAndPrint(current)}>🧾 Devis (PDF)</button>
                    <button onClick={removeDossier}>🗑️ Archiver</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input placeholder="Nom défunt" value={current.defunt_nom} onChange={(e) => updateCurrent({ defunt_nom: e.target.value } as any)} />
                    <input placeholder="Prénom défunt" value={current.defunt_prenom} onChange={(e) => updateCurrent({ defunt_prenom: e.target.value } as any)} />
                    <input
                      placeholder="Lieu cérémonie"
                      value={current.ceremonie_lieu || ''}
                      onChange={(e) => updateCurrent({ ceremonie_lieu: e.target.value } as any)}
                    />
                    <input
                      type="datetime-local"
                      value={current.ceremonie_date || ''}
                      onChange={(e) => updateCurrent({ ceremonie_date: e.target.value } as any)}
                    />
                    <input
                      placeholder="Famille contact"
                      value={current.famille_contact}
                      onChange={(e) => updateCurrent({ famille_contact: e.target.value } as any)}
                    />
                  </div>

                  <div>
                    <div style={{ fontWeight: 600, margin: '8px 0' }}>Prestations</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {prestations.map((p) => {
                        const checked = current.prestations.includes(String(p.id))
                        return (
                          <label
                            key={String(p.id)}
                            style={{
                              border: '1px solid #eee',
                              padding: 8,
                              borderRadius: 8,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              background: 'white',
                            }}
                          >
                            <span>{p.nom}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <strong>{currency(p.prix)}</strong>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const set = new Set(current.prestations.map(String))
                                  if (e.target.checked) set.add(String(p.id))
                                  else set.delete(String(p.id))
                                  updateCurrent({ prestations: Array.from(set) } as any)
                                }}
                              />
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    <div style={{ textAlign: 'right', marginTop: 6 }}>
                      <strong>Sous-total prestations : {currency(prixPrest(current))}</strong>
                    </div>
                  </div>

                  <EditableLines
                    title="Marbrerie"
                    lines={current.marbrerie}
                    onChange={(lines) => updateCurrent({ marbrerie: lines } as any)}
                  />
                  <EditableLines
                    title="Autres lignes"
                    lines={current.autres}
                    onChange={(lines) => updateCurrent({ autres: lines } as any)}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #eee', paddingTop: 8 }}>
                    <div style={{ color: '#666' }}>Prix TTC indicatif (sans ventilation TVA)</div>
                    <div style={{ fontWeight: 700, fontSize: 22 }}>{currency(totalDossier(current))}</div>
                  </div>
                </div>
              ) : (
                <div style={{ border: '1px dashed #bbb', borderRadius: 8, padding: 24, textAlign: 'center', color: '#666' }}>
                  Sélectionnez un dossier
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'tarifs' && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 600 }}>Catalogue prestations</div>
            {prestations.map((p) => (
              <div key={String(p.id)} style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: 8 }}>
                <input
                  value={p.nom}
                  onChange={async (e) => {
                    const { data } = await supabase.from('prestations').update({ nom: e.target.value }).eq('id', p.id).select().single()
                    if (data) setPrestations((prev) => prev.map((x) => (x.id === p.id ? (data as any) : x)))
                  }}
                />
                <input
                  type="number"
                  value={p.prix}
                  onChange={async (e) => {
                    const { data } = await supabase.from('prestations').update({ prix: Number(e.target.value) }).eq('id', p.id).select().single()
                    if (data) setPrestations((prev) => prev.map((x) => (x.id === p.id ? (data as any) : x)))
                  }}
                />
                <button
                  onClick={async () => {
                    await supabase.from('prestations').delete().eq('id', p.id)
                    setPrestations((prev) => prev.filter((x) => x.id !== p.id))
                  }}
                >
                  Supprimer
                </button>
              </div>
            ))}
            <button
              onClick={async () => {
                const { data } = await supabase.from('prestations').insert({ user_id: userId, nom: '', prix: 0 }).select().single()
                if (data) setPrestations((prev) => [data as any, ...prev])
              }}
            >
              ➕ Ajouter
            </button>
          </div>
        )}

        {tab === 'param' && entreprise && (
          <div style={{ display: 'grid', gap: 8 }}>
            <input placeholder="Nom" value={entreprise.nom} onChange={(e) => saveEntreprisePatch({ nom: e.target.value })} />
            <input placeholder="SIRET" value={entreprise.siret} onChange={(e) => saveEntreprisePatch({ siret: e.target.value })} />
            <input placeholder="Adresse" value={entreprise.adresse} onChange={(e) => saveEntreprisePatch({ adresse: e.target.value })} />
            <input placeholder="Téléphone" value={entreprise.telephone} onChange={(e) => saveEntreprisePatch({ telephone: e.target.value })} />
            <input placeholder="Email" value={entreprise.email} onChange={(e) => saveEntreprisePatch({ email: e.target.value })} />
            <div>
              <div style={{ fontSize: 12, color: '#666' }}>Signature (PNG/JPEG)</div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const r = new FileReader()
                  r.onload = () => {
                    saveEntreprisePatch({ signature_data_url: String(r.result) })
                  }
                  r.readAsDataURL(f)
                }}
              />
              {entreprise.signature_data_url && <img src={entreprise.signature_data_url} alt="signature" style={{ height: 48, marginTop: 8 }} />}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ---------- Sous-composant ----------
function EditableLines({
  title,
  lines,
  onChange,
}: {
  title: string
  lines: Ligne[]
  onChange: (l: Ligne[]) => void
}) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 10, marginTop: 10, background: 'white' }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Libellé</th>
            <th>Qté</th>
            <th>PU</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td>
                <input
                  value={l.nom}
                  onChange={(e) => onChange(lines.map((x) => (x.id === l.id ? { ...x, nom: e.target.value } : x)))}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={l.qte}
                  onChange={(e) => onChange(lines.map((x) => (x.id === l.id ? { ...x, qte: Number(e.target.value) } : x)))}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={l.pu}
                  onChange={(e) => onChange(lines.map((x) => (x.id === l.id ? { ...x, pu: Number(e.target.value) } : x)))}
                />
              </td>
              <td style={{ textAlign: 'right' }}>
                <strong>{currency(l.qte * (l.pu || 0))}</strong>
              </td>
              <td style={{ textAlign: 'right' }}>
                <button onClick={() => onChange(lines.filter((x) => x.id !== l.id))}>Supprimer</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: 'left', marginTop: 8 }}>
        <button onClick={() => onChange([{ id: uid(), nom: '', qte: 1, pu: 0 }, ...lines])}>➕ Ajouter une ligne</button>
      </div>
    </div>
  )
}
