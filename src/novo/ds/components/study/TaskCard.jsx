import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { IconTile } from '../core/IconTile.jsx';
export function TaskCard({kind,title,description,icon,cta,onClick,tone='brand',done=false}){
  const c={brand:'var(--text-brand)',info:'var(--info-text)',warning:'var(--warning-text)',ai:'var(--ai-text)'}[tone];
  const bg={brand:'var(--surface-brand-soft)',info:'var(--info-bg)',warning:'var(--warning-bg)',ai:'var(--ai-bg)'}[tone];
  return <div className="sm-card sm-card--interactive" style={{padding:20,display:'flex',flexDirection:'column',gap:14,minWidth:0}} onClick={onClick} tabIndex={0} role="button" onKeyDown={e=>{if(e.key==='Enter')onClick&&onClick();}}>
    <div style={{display:'flex',gap:12,justifyContent:'space-between',alignItems:'flex-start'}}>
      <div style={{minWidth:0}}>
        <div className="sm-overline" style={{color:c}}>{kind}</div>
        <div style={{font:'var(--type-h4)',fontSize:17,color:'var(--text-primary)',marginTop:6}}>{title}</div>
        <div style={{font:'var(--type-body-sm)',color:'var(--text-secondary)',marginTop:2}}>{description}</div>
      </div>
      <IconTile name={done?'circle-check':icon} tone={done?'success':(tone==='warning'?'warning':tone)} size={40}/>
    </div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:12,borderTop:'1px solid var(--border-subtle)',font:'var(--type-label)',color:done?'var(--success-text)':c}}>
      <span>{done?'Concluído':cta}</span><Icon name="arrow-right" size={18}/>
    </div>
  </div>;
}