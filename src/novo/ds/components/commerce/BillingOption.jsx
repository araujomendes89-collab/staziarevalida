import React from 'react';
import { Badge } from '../core/Badge.jsx';
export function BillingOption({title,price,period='/mês',note,badge,selected=false,onClick}){
  return <button type="button" role="radio" aria-checked={selected} onClick={onClick} style={{position:'relative',textAlign:'left',padding:'16px 18px',borderRadius:'var(--radius-lg)',border:(selected?2:1)+'px solid '+(selected?'var(--selected-border)':'var(--border-default)'),background:selected?'var(--selected-bg)':'var(--surface-card)',cursor:'pointer',display:'flex',flexDirection:'column',gap:4,font:'inherit',color:'inherit',minWidth:0}}>
    {badge&&<span style={{position:'absolute',top:-11,right:12}}><Badge tone="solid" size="sm" caps>{badge}</Badge></span>}
    <span style={{display:'flex',alignItems:'center',gap:8,font:'var(--type-label)',color:'var(--text-primary)'}}>
      <span aria-hidden="true" style={{width:18,height:18,borderRadius:'50%',border:'2px solid '+(selected?'var(--action-primary)':'var(--border-strong)'),display:'inline-flex',alignItems:'center',justifyContent:'center'}}>{selected&&<span style={{width:8,height:8,borderRadius:'50%',background:'var(--action-primary)'}}/>}</span>{title}</span>
    <span style={{font:'700 18px/1.2 var(--font-sans)',color:'var(--text-primary)'}}>{price}<span style={{fontWeight:400,fontSize:13,color:'var(--text-secondary)'}}>{period}</span></span>
    {note&&<span style={{font:'var(--type-caption)',color:'var(--text-secondary)'}}>{note}</span>}
  </button>;
}