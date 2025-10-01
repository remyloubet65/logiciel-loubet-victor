import React, { useState } from 'react'
import { supabase } from './supabase'
export default function Auth(){
  const [email,setEmail]=useState('')
  const [sent,setSent]=useState(false)
  async function send(){ const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin}}); if(error){alert(error.message);return} setSent(true) }
  return (<div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24}}>
    <div style={{border:'1px solid #e5e5e5',borderRadius:14,padding:18,background:'white',width:360}}>
      <h2>Connexion</h2><p>Entrez votre email pour recevoir un lien.</p>
      <input placeholder="email" style={{width:'100%',padding:8,border:'1px solid #ddd',borderRadius:10}} value={email} onChange={e=>setEmail(e.target.value)}/>
      <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button onClick={send} disabled={!email||sent}>{sent?'Lien envoyé':'Recevoir le lien'}</button></div>
    </div></div>)
}