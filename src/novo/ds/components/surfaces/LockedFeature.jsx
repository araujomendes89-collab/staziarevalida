import React from 'react';
import { IconTile } from '../core/IconTile.jsx';
import { Badge } from '../core/Badge.jsx';
import { Button } from '../core/Button.jsx';
export function LockedFeature({title,description,plan='PRO',cta='Fazer upgrade',onUpgrade}){
  return <div className="sm-card" style={{padding:'40px 32px',display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center',gap:12,maxWidth:560,margin:'0 auto'}}>
    <IconTile name="lock" tone="pro" size={56}/>
    <Badge tone="pro" caps size="sm">Recurso Stazia {plan}</Badge>
    <h3 style={{margin:'4px 0 0',font:'var(--type-h3)',color:'var(--text-primary)'}}>{title}</h3>
    <p style={{margin:0,font:'var(--type-body)',color:'var(--text-secondary)',maxWidth:440,textWrap:'pretty'}}>{description}</p>
    <div style={{marginTop:8}}><Button icon="sparkles" iconRight="arrow-right" onClick={onUpgrade}>{cta}</Button></div>
  </div>;
}