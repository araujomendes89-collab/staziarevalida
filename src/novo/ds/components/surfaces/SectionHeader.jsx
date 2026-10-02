import React from 'react';
import { IconTile } from '../core/IconTile.jsx';
export function SectionHeader({icon,title,subtitle,action,level=2}){
  const H='h'+level;
  return <div style={{display:'flex',alignItems:'flex-start',gap:12,justifyContent:'space-between',flexWrap:'wrap'}}>
    <div style={{display:'flex',gap:12,alignItems:'flex-start',minWidth:0}}>
      {icon&&<IconTile name={icon} tone="brand" size={40}/>}
      <div style={{minWidth:0}}>
        <H style={{margin:0,font:'var(--type-h4)',color:'var(--text-primary)'}}>{title}</H>
        {subtitle&&<p style={{margin:'2px 0 0',font:'var(--type-body-sm)',color:'var(--text-secondary)'}}>{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>;
}