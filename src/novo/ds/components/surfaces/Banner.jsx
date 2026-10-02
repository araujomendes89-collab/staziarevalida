import React from 'react';
import { IconTile } from '../core/IconTile.jsx';
const T={info:['var(--info-bg)','var(--info-border)','var(--info-text)','info'],brand:['var(--surface-brand-soft)','color-mix(in oklab,var(--border-brand) 35%,transparent)','var(--text-brand)','clock'],warning:['var(--warning-bg)','var(--warning-border)','var(--warning-text)','triangle-alert'],danger:['var(--danger-bg)','var(--danger-border)','var(--danger-text)','circle-alert'],success:['var(--success-bg)','var(--success-border)','var(--success-text)','circle-check']};
export function Banner({tone='brand',icon,title,children,action}){
  const [bg,bd,fg,ic]=T[tone]||T.brand;
  return <div role={tone==='danger'?'alert':'status'} style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap',padding:'16px 20px',borderRadius:'var(--radius-lg)',background:bg,border:'1px solid '+bd}}>
    <IconTile name={icon||ic} tone={tone} size={40}/>
    <div style={{flex:'1 1 240px',minWidth:0}}>
      {title&&<div style={{font:'var(--type-label)',fontSize:15,color:'var(--text-primary)'}}>{title}</div>}
      {children&&<div style={{font:'var(--type-body-sm)',color:'var(--text-secondary)',marginTop:2}}>{children}</div>}
    </div>
    {action}
  </div>;
}