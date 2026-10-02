import React from 'react';
export function Topbar({title,subtitle,children,leading}){
  return <header className="sm-topbar">
    {leading}
    <div style={{flex:1,minWidth:0}}>
      <h1 style={{margin:0,font:'var(--type-h3)',color:'var(--text-primary)'}}>{title}</h1>
      {subtitle&&<p style={{margin:'2px 0 0',font:'var(--type-body-sm)',color:'var(--text-secondary)'}}>{subtitle}</p>}
    </div>
    <div style={{display:'flex',alignItems:'center',gap:8}}>{children}</div>
  </header>;
}