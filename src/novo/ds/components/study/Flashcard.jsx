import React, { useState } from 'react';
export function Flashcard({front,back,area,height=280,flipped,onFlip}){
  const [f,setF]=useState(false); const isF=flipped??f;
  const flip=()=>{onFlip?onFlip(!isF):setF(!isF);};
  const meta=(t)=><div style={{display:'flex',justifyContent:'space-between',font:'var(--type-caption)',color:'var(--text-tertiary)'}}><span className="sm-overline" style={{color:'var(--text-brand)'}}>{area}</span><span>{t}</span></div>;
  return <div className={'sm-flash'+(isF?' sm-flash--flipped':'')} style={{height}} role="button" tabIndex={0} aria-pressed={isF} aria-label={isF?'Mostrar pergunta':'Mostrar resposta'} onClick={flip} onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();flip();}}}>
    <div className="sm-flash__inner">
      <div className="sm-flash__face">{meta('Pergunta')}<div style={{flex:1,display:'flex',alignItems:'center',font:'600 21px/1.4 var(--font-sans)',color:'var(--text-primary)',textWrap:'pretty'}}>{front}</div><div style={{font:'var(--type-caption)',color:'var(--text-tertiary)',textAlign:'center'}}>Toque ou pressione espaço para virar</div></div>
      <div className="sm-flash__face sm-flash__face--back">{meta('Resposta')}<div style={{flex:1,display:'flex',alignItems:'center',font:'var(--type-body-lg)',color:'var(--text-primary)',textWrap:'pretty'}}>{back}</div></div>
    </div>
  </div>;
}