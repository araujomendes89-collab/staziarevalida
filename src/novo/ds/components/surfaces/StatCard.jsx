import React from 'react';
import { IconTile } from '../core/IconTile.jsx';
export function StatCard({label,value,caption,icon,tone='brand'}){
  const c={brand:'var(--text-brand)',success:'var(--success-text)',warning:'var(--warning-text)',danger:'var(--danger-text)',info:'var(--info-text)',neutral:'var(--text-secondary)'}[tone];
  return <div className="sm-card" style={{padding:20,display:'flex',flexDirection:'column',gap:6,minWidth:0}}>
    <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'space-between'}}>
      <span className="sm-overline" style={{color:'var(--text-secondary)'}}>{label}</span>
      {icon&&<IconTile name={icon} tone={tone==='neutral'?'neutral':tone} size={32}/>}
    </div>
    <span style={{font:'700 30px/1.1 var(--font-sans)',letterSpacing:'-0.02em',color:'var(--text-primary)',fontVariantNumeric:'tabular-nums'}}>{value}</span>
    {caption&&<span style={{font:'var(--type-body-sm)',fontSize:13,color:'var(--text-tertiary)'}}>{caption}</span>}
  </div>;
}