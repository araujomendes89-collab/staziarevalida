import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../core/Icon.jsx';
// Imagem de um impresso. Clicar amplia em tela cheia (role="dialog" aria-modal); Esc, "Fechar" e clique no fundo fecham e o foco volta ao botão.
export function PrintImage({src,alt}){
  const [open,setOpen]=useState(false);
  const openRef=useRef(null); const closeRef=useRef(null);
  useEffect(()=>{
    if(!open) return undefined;
    const opener=openRef.current;
    if(closeRef.current) closeRef.current.focus();
    const onKey=e=>{
      if(e.key==='Escape'){ e.stopPropagation(); setOpen(false); }
      else if(e.key==='Tab'){ e.preventDefault(); if(closeRef.current) closeRef.current.focus(); } // o único focável é o "Fechar"
    };
    document.addEventListener('keydown',onKey);
    return ()=>{
      document.removeEventListener('keydown',onKey);
      if(opener&&document.contains(opener)) opener.focus();
    };
  },[open]);
  return <>
    <button ref={openRef} type="button" className="osce-printimg" onClick={()=>setOpen(true)} aria-label="Ampliar impresso">
      <img src={src} alt={alt} className="osce-printimg__img"/>
      <span className="osce-printimg__hint"><Icon name="maximize-2" size={13}/>Ampliar</span>
    </button>
    {open&&<div role="dialog" aria-modal="true" aria-label={alt} className="osce-printimg__overlay" onClick={()=>setOpen(false)}>
      <img src={src} alt={alt} className="osce-printimg__big" onClick={e=>e.stopPropagation()}/>
      <button ref={closeRef} type="button" className="osce-printimg__close" aria-label="Fechar" onClick={()=>setOpen(false)}><Icon name="x" size={20}/></button>
    </div>}
  </>;
}
