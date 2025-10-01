import React, { useEffect, useMemo, useRef, useState } from 'react'
import Auth from './auth'
import { supabase } from './supabase'
import { printHtml } from './print'
import type { Dossier, Prestation, Entreprise, Ligne } from './types'

const currency=(n:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n||0)
const uid=()=>Math.random().toString(36).slice(2,9)

const defaults=[
  { nom:'Mise en bière et fermeture du cercueil', prix:290 },
  { nom:'Cercueil chêne – gamme classique', prix:780 },
  { nom:'Capitonnage tissu écru', prix:180 },
  { nom:'Transport (forfait 50 km)', prix:220 },
  { nom:'Maître de cérémonie', prix:200 },
  { nom:'Démarches administratives', prix:95 },
  { nom:'Ouverture/fermeture de caveau', prix:350 },
  { nom:'Urne funéraire – standard', prix:120 },
]

export default function App(){
  const [session,setSession]=useState<any>(null)
  useEffect(()=>{ supabase.auth.getSession().then(({data})=>setSession(data.session)); const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return ()=>data.subscription.unsubscribe() },[])
  if(!session) return <Auth/>
  return <Dashboard userId={session.user.id} email={session.user.email}/>
}

function Dashboard({userId,email}:{userId:string;email:string}){
  const [entreprise,setEntreprise]=useState<Entreprise|null>(null)
  const [prestations,setPrestations]=useState<Prestation[]>([])
  const [dossiers,setDossiers]=useState<Dossier[]>([])
  const [tab,setTab]=useState<'dossiers'|'tarifs'|'param'>('dossiers')
  const [q,setQ]=useState('')
  const [currentId,setCurrentId]=useState<string|null>(null)
  const fileRef=useRef<HTMLInputElement|null>(null)

  useEffect(()=>{(async()=>{
    const {data:e}=await supabase.from('entreprise').select('*').eq('user_id',userId).maybeSingle()
    if(!e){
      const empty={user_id:userId,nom:'Pompes Funèbres Loubet-Victor',adresse:'',telephone:'',email:email||'',siret:'',signature_data_url:null}
      const {data:ins}=await supabase.from('entreprise').insert(empty).select().single(); setEntreprise(ins as any)
    }else setEntreprise(e as any)
    let {data:pr}=await supabase.from('prestations').select('*').eq('user_id',userId)
    if(!pr||pr.length===0){
      const ins=defaults.map(p=>({...p,user_id:userId})); const {data:seed}=await supabase.from('prestations').insert(ins).select(); pr=seed||[]
    }
    setPrestations(pr as any)
    const {data:ds}=await supabase.from('dossiers').select('*').eq('user_id',userId).order('modifie_le',{ascending:false})
    setDossiers((ds||[]) as any)
  })()},[userId,email])

  const current=useMemo(()=>dossiers.find(d=>String(d.id)===String(currentId))||null,[dossiers,currentId])
  const filtered=useMemo(()=>{const x=q.trim().toLowerCase(); if(!x) return dossiers.filter(d=>!d.archive); return dossiers.filter(d=>!d.archive && ((d.reference||'').toLowerCase().includes(x)||(d.defunt_nom+' '+d.defunt_prenom).toLowerCase().includes(x)||(d.famille_contact||'').toLowerCase().includes(x)||(d.ceremonie_lieu||'').toLowerCase().includes(x)))},[q,dossiers])

  async function newDossier(){
    const now=new Date().toISOString()
    const d={user_id:userId,reference:`PFV-${new Date().getFullYear()}-${String(dossiers.length+1).padStart(4,'0')}`,defunt_nom:'',defunt_prenom:'',famille_contact:'',prestations:[],marbrerie:[],autres:[],cree_le:now,modifie_le:now}
    const {data:ins,error}=await supabase.from('dossiers').insert(d).select().single(); if(error){alert(error.message);return}
    setDossiers(prev=>[ins as any,*prev]); setCurrentId(String((ins as any).id))
  }

  async function updateCurrent(patch:Partial<Dossier>){ if(!current) return; const upd={...current,...patch,modifie_le:new Date().toISOString()}; const {data:saved,error}=await supabase.from('dossiers').update(upd).eq('id',current.id).select().single(); if(error){alert(error.message);return} setDossiers(prev=>prev.map(d=>d.id===current.id?(saved as any):d)) }
  async function removeDossier(){ if(!current) return; if(!confirm('Archiver ce dossier ?')) return; await updateCurrent({archive:true} as any); setCurrentId(null) }

  const map=new Map(prestations.map(p=>[String(p.id),p] as const))
  const totalPrest=(d:Dossier)=>d.prestations.reduce((s,id)=>s+(map.get(String(id))?.prix||0),0)
  const totLines=(l:Ligne[])=>l.reduce((s,x)=>s+x.qte*(x.pu||0),0)
  const total=(d:Dossier)=>totalPrest(d)+totLines(d.marbrerie)+totLines(d.autres)

  function devis(d:Dossier){
    const lignesPrest=d.prestations.map(id=>map.get(String(id))).filter(Boolean).map(p=>({nom:(p as any).nom,prix:(p as any).prix}))
    const rows=[...lignesPrest.map(p=>`<tr><td>${p.nom}</td><td style='text-align:right'>${currency(p.prix)}</td></tr>`),...d.marbrerie.map(l=>`<tr><td>${l.nom} × ${l.qte}</td><td style='text-align:right'>${currency(l.qte*l.pu)}</td></tr>`),...d.autres.map(l=>`<tr><td>${l.nom} × ${l.qte}</td><td style='text-align:right'>${currency(l.qte*l.pu)}</td></tr>`)].join('')
    printHtml(`<h2>Devis ${d.reference}</h2><div>Défunt : ${d.defunt_prenom} ${d.defunt_nom}</div><table style='width:100%;border-collapse:collapse;margin-top:12px'><thead><tr><th style='text-align:left'>Libellé</th><th style='text-align:right'>Prix</th></tr></thead><tbody>${rows}</tbody></table><div style='text-align:right;font-weight:700;margin-top:8'>Total TTC : ${currency(total(d))}</div>`)
  }

  function onImport(file:File){ const r=new FileReader(); r.onload=async()=>{ try{ const data=JSON.parse(String(r.result)); if(Array.isArray(data.prestations)){ for(const p of data.prestations){ await supabase.from('prestations').upsert({user_id:userId,nom:p.nom,prix:p.prix}) } } if(Array.isArray(data.dossiers)){ for(const d of data.dossiers){ await supabase.from('dossiers').insert({...d,id:undefined,user_id:userId}) } } alert('Import terminé'); location.reload() }catch{ alert('Fichier invalide') } }; r.readAsText(file) }

  function onExport(){ const blob=new Blob([JSON.stringify({dossiers,prestations,entreprise},null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='pfv_export.json'; a.click(); URL.revokeObjectURL(url) }

  return (<div style={{display:'grid',gridTemplateColumns:'280px 1fr',minHeight:'100vh'}}>
    <aside style={{borderRight:'1px solid #eee',padding:16}}>
      <h3>{entreprise?.nom||'...'}</h3>
      <button onClick={newDossier}>➕ Nouveau dossier</button>
      <div style={{marginTop:8}}>
        <button onClick={onExport}>⬇️ Exporter</button>
        <input type="file" accept="application/json" onChange={e=>{const f=e.target.files?.[0]; if(f) onImport(f)}}/>
      </div>
      <div style={{marginTop:12}}>
        <button onClick={()=>setTab('dossiers')}>📁 Dossiers</button>
        <button onClick={()=>setTab('tarifs')}>💶 Tarifs</button>
        <button onClick={()=>setTab('param')}>⚙️ Paramètres</button>
      </div>
      <div style={{marginTop:12}}>
        <button onClick={()=>supabase.auth.signOut()}>🚪 Se déconnecter</button>
      </div>
    </aside>
    <main style={{padding:20}}>
      {tab==='dossiers' && (<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div>
          <input placeholder="Recherche" value={q} onChange={e=>setQ(e.target.value)} style={{width:'100%',padding:8}}/>
          <div style={{marginTop:8,maxHeight:'60vh',overflow:'auto',display:'grid',gap:8}}>
            {filtered.map(d=>(<button key={String(d.id)} style={{textAlign:'left',padding:8,border:'1px solid #eee'}} onClick={()=>setCurrentId(String(d.id))}>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <strong>{d.defunt_prenom||'?'} {d.defunt_nom||'?'}</strong><span>{currency(total(d))}</span>
              </div><small>{d.reference}</small>
            </button>))}
          </div>
        </div>
        <div>
          {current? (<div style={{display:'grid',gap:8}}>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><button onClick={()=>devis(current)}>🧾 Devis (PDF)</button><button onClick={removeDossier}>🗑️ Archiver</button></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <input placeholder="Nom défunt" value={current.defunt_nom} onChange={e=>updateCurrent({defunt_nom:e.target.value} as any)}/>
              <input placeholder="Prénom défunt" value={current.defunt_prenom} onChange={e=>updateCurrent({defunt_prenom:e.target.value} as any)}/>
              <input placeholder="Lieu cérémonie" value={current.ceremonie_lieu||''} onChange={e=>updateCurrent({ceremonie_lieu:e.target.value} as any)}/>
              <input type="datetime-local" value={current.ceremonie_date||''} onChange={e=>updateCurrent({ceremonie_date:e.target.value} as any)}/>
              <input placeholder="Famille contact" value={current.famille_contact} onChange={e=>updateCurrent({famille_contact:e.target.value} as any)}/>
            </div>
            <div><strong>Prestations</strong><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
              {prestations.map(p=>{const checked=current.prestations.includes(String(p.id)); return (<label key={String(p.id)} style={{border:'1px solid #eee',padding:8,display:'flex',justifyContent:'space-between'}}>
                <span>{p.nom}</span><span><strong>{currency(p.prix)}</strong> <input type="checkbox" checked={checked} onChange={e=>{const s=new Set(current.prestations.map(String)); e.target.checked?s.add(String(p.id)):s.delete(String(p.id)); updateCurrent({prestations:Array.from(s)} as any)}}/></span>
              </label>)} )}
            </div></div>
          </div>) : (<div>Sélectionnez un dossier</div>)}
        </div>
      </div>)}
      {tab==='tarifs' && (<div>
        <div style={{display:'grid',gap:8}}>
          {prestations.map(p=>(<div key={String(p.id)} style={{display:'grid',gridTemplateColumns:'1fr 120px auto',gap:8}}>
            <input value={p.nom} onChange={async e=>{const {data}=await supabase.from('prestations').update({nom:e.target.value}).eq('id',p.id).select().single(); if(data) setPrestations(prev=>prev.map(x=>x.id===p.id?data as any:x))}}/>
            <input type="number" value={p.prix} onChange={async e=>{const {data}=await supabase.from('prestations').update({prix:Number(e.target.value)}).eq('id',p.id).select().single(); if(data) setPrestations(prev=>prev.map(x=>x.id===p.id?data as any:x))}}/>
            <button onClick={async()=>{await supabase.from('prestations').delete().eq('id',p.id); setPrestations(prev=>prev.filter(x=>x.id!==p.id))}}>Supprimer</button>
          </div>))}
          <button onClick={async()=>{const {data}=await supabase.from('prestations').insert({user_id:userId,nom:'',prix:0}).select().single(); if(data) setPrestations(prev=>[data as any,*prev])}}>➕ Ajouter</button>
        </div>
      </div>)}
      {tab==='param' && entreprise && (<div style={{display:'grid',gap:8}}>
        <input placeholder="Nom" value={entreprise.nom} onChange={e=>save({nom:e.target.value})}/>
        <input placeholder="SIRET" value={entreprise.siret} onChange={e=>save({siret:e.target.value})}/>
        <input placeholder="Adresse" value={entreprise.adresse} onChange={e=>save({adresse:e.target.value})}/>
        <input placeholder="Téléphone" value={entreprise.telephone} onChange={e=>save({telephone:e.target.value})}/>
        <input placeholder="Email" value={entreprise.email} onChange={e=>save({email:e.target.value})}/>
      </div>)}
    </main>
  </div>)

  async function save(patch:Partial<Entreprise>){ if(!entreprise) return; const {data}=await supabase.from('entreprise').update({...entreprise,...patch}).eq('id',entreprise.id).select().single(); if(data) setEntreprise(data as any) }
}
