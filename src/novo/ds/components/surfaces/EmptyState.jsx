import React from 'react';
import { IconTile } from '../core/IconTile.jsx';
export function EmptyState({icon='inbox',title,description,action}){
  return <div style={{display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center',gap:10,padding:'40px 24px',border:'1px dashed var(--border-strong)',borderRadius:'var(--radius-lg)',background:'var(--surface-subtle)'}}>
    <IconTile name={icon} tone="neutral" size={52}/>
    <div style={{font:'var(--type-h4)',fontSize:17,color:'var(--text-primary)'}}>{title}</div>
    {description&&<p style={{margin:0,font:'var(--type-body-sm)',color:'var(--text-secondary)',maxWidth:420,textWrap:'pretty'}}>{description}</p>}
    {action&&<div style={{marginTop:6}}>{action}</div>}
  </div>;
}