import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { IconTile } from '../core/IconTile.jsx';
import { Badge } from '../core/Badge.jsx';
import { Button } from '../core/Button.jsx';
export function PlanCard({name,tagline,icon,price,period='/mês',note,tag,features=[],cta,ctaVariant='secondary',footnote,featured=false,onSelect}){
  return <div className="sm-card" style={{position:'relative',padding:28,display:'flex',flexDirection:'column',gap:20,borderWidth:featured?2:1,borderColor:featured?'var(--action-primary)':undefined,boxShadow:featured?'var(--shadow-lg)':undefined,minWidth:0}}>
    {featured&&<span style={{position:'absolute',top:-13,left:'50%',transform:'translateX(-50%)'}}><Badge tone="solid" caps icon="crown">Mais escolhido</Badge></span>}
    <div style={{display:'flex',alignItems:'center',gap:12}}>
      <IconTile name={icon} tone={featured?'brand':'navy'} size={44}/>
      <div style={{minWidth:0}}><div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{font:'var(--type-h3)',color:'var(--text-primary)'}}>{name}</span>{tag&&<Badge tone="brand" size="sm">{tag}</Badge>}</div>
      <div style={{font:'var(--type-caption)',color:'var(--text-secondary)'}}>{tagline}</div></div>
    </div>
    <div><div style={{display:'flex',alignItems:'baseline',gap:4}}><span style={{font:'800 40px/1 var(--font-sans)',letterSpacing:'-0.02em',color:'var(--text-primary)'}}>{price}</span>{period&&<span style={{font:'var(--type-body-sm)',color:'var(--text-secondary)'}}>{period}</span>}</div>
      {note&&<div style={{font:'var(--type-body-sm)',color:'var(--text-secondary)',marginTop:6}}>{note}</div>}</div>
    <ul style={{listStyle:'none',margin:0,padding:'20px 0 0',borderTop:'1px solid var(--border-subtle)',display:'flex',flexDirection:'column',gap:10,flex:1}}>
      {features.map(f=><li key={f} style={{display:'flex',gap:10,font:'var(--type-body-sm)',color:'var(--text-primary)'}}><Icon name="circle-check" size={18} style={{color:'var(--success-solid)',flex:'none'}}/>{f}</li>)}
    </ul>
    <div style={{display:'flex',flexDirection:'column',gap:8,alignItems:'stretch'}}>
      <Button variant={ctaVariant} size="lg" fullWidth iconRight="arrow-right" onClick={onSelect}>{cta}</Button>
      {footnote&&<span style={{font:'var(--type-caption)',color:'var(--text-tertiary)',textAlign:'center'}}>{footnote}</span>}
    </div>
  </div>;
}