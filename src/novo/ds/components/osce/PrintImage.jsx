import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../core/Icon.jsx';
// Imagem de um impresso. Clicar amplia em tela cheia (role="dialog" aria-modal) com − e + (de 60% a 200%, de 20 em 20,
// largura-base 900 px, volta a 100% ao abrir); Esc, "Fechar" e clique no fundo fecham e o foco volta ao botão.
// Com `canHide`, "Ocultar" esconde a imagem só nesta tela (não muda quem pode ver o impresso).
const ZOOM_MIN=0.6, ZOOM_MAX=2, ZOOM_STEP=0.2, BASE_WIDTH=900;
export function PrintImage({src,alt,canHide=false}){
  const [open,setOpen]=useState(false);
  const [hidden,setHidden]=useState(false);
  const [zoom,setZoom]=useState(1);
  const openRef=useRef(null); const closeRef=useRef(null); const overlayRef=useRef(null);
  useEffect(()=>{
    if(!open) return undefined;
    const opener=openRef.current;
    if(closeRef.current) closeRef.current.focus();
    const onKey=e=>{
      if(e.key==='Escape'){ e.stopPropagation(); setOpen(false); }
      else if(e.key==='Tab'){ // foco preso na tela cheia: − , + e Fechar
        const list=overlayRef.current?Array.from(overlayRef.current.querySelectorAll('button:not([disabled])')):[];
        if(!list.length) return;
        const i=list.indexOf(document.activeElement);
        if(e.shiftKey&&i<=0){ e.preventDefault(); list[list.length-1].focus(); }
        else if(!e.shiftKey&&(i===-1||i===list.length-1)){ e.preventDefault(); list[0].focus(); }
      }
    };
    document.addEventListener('keydown',onKey);
    return ()=>{
      document.removeEventListener('keydown',onKey);
      if(opener&&document.contains(opener)) opener.focus();
    };
  },[open]);
  const openBig=()=>{ setZoom(1); setOpen(true); };
  const less=()=>setZoom(z=>Math.max(ZOOM_MIN,+(z-ZOOM_STEP).toFixed(1)));
  const more=()=>setZoom(z=>Math.min(ZOOM_MAX,+(z+ZOOM_STEP).toFixed(1)));
  return <>
    {hidden
      ? <button type="button" className="osce-printimg__show" aria-label="Mostrar imagem do impresso" onClick={()=>setHidden(false)}><Icon name="eye" size={15}/>Mostrar imagem</button>
      : <>
        <button ref={openRef} type="button" className="osce-printimg" onClick={openBig} aria-label="Ampliar impresso">
          <img src={src} alt={alt} className="osce-printimg__img"/>
          <span className="osce-printimg__hint"><Icon name="maximize-2" size={13}/>Ampliar</span>
        </button>
        {canHide&&<button type="button" className="osce-printimg__hide" aria-label="Ocultar imagem do impresso" onClick={()=>setHidden(true)}><Icon name="eye-off" size={15}/>Ocultar</button>}
      </>}
    {open&&<div ref={overlayRef} role="dialog" aria-modal="true" aria-label={alt} className="osce-printimg__overlay" onClick={()=>setOpen(false)}>
      <div className="osce-printimg__zoom" onClick={e=>e.stopPropagation()}>
        <button type="button" className="osce-printimg__zbtn" aria-label="Diminuir imagem" disabled={zoom<=ZOOM_MIN} onClick={less}>−</button>
        <span className="osce-printimg__zval">{Math.round(zoom*100)}%</span>
        <button type="button" className="osce-printimg__zbtn" aria-label="Ampliar imagem" disabled={zoom>=ZOOM_MAX} onClick={more}>+</button>
      </div>
      <img src={src} alt={alt} className="osce-printimg__big" style={{width:`${Math.round(BASE_WIDTH*zoom)}px`}} onClick={e=>e.stopPropagation()}/>
      <button ref={closeRef} type="button" className="osce-printimg__close" aria-label="Fechar" onClick={()=>setOpen(false)}><Icon name="x" size={20}/></button>
    </div>}
  </>;
}
