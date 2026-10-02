import React from 'react';
export function StepProgress({current=1,total=5,variant='segments'}){
  return <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,width:'100%'}}>
    {variant==='segments'?<div style={{display:'flex',gap:6,width:'100%'}} aria-hidden="true">
      {Array.from({length:total},(_,i)=><span key={i} style={{flex:1,height:6,borderRadius:999,background:i<current?'var(--action-primary)':'var(--chart-track)',transition:'background var(--dur-base)'}}/>)}
    </div>:<div style={{display:'flex',gap:6}} aria-hidden="true">
      {Array.from({length:total},(_,i)=><span key={i} style={{width:i===current-1?20:8,height:8,borderRadius:999,background:i<current?'var(--action-primary)':'var(--border-strong)',transition:'all var(--dur-base)'}}/>)}
    </div>}
    <span style={{font:'var(--type-data)',fontSize:12,color:'var(--text-secondary)'}} aria-live="polite">Etapa {current} de {total}</span>
  </div>;
}