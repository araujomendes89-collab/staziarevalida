import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Badge } from '../core/Badge.jsx';
const ST={pendente:['warning','Pendente'],iniciado:['info','Iniciado'],concluido:['success','Concluído']};
export function TopicRow({status='pendente',area,title,questions,cards,mastery=0,onClick}){
  const [tone,lab]=ST[status]||ST.pendente;
  return <button type="button" className="sm-row" onClick={onClick}>
    <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:6}}>
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><Badge tone={tone} caps size="sm">{lab}</Badge><span style={{font:'var(--type-caption)',color:'var(--text-secondary)'}}>{area}</span></div>
      <div style={{font:'600 16px/1.35 var(--font-sans)',color:'var(--text-primary)'}}>{title}</div>
    </div>
    <div style={{flex:'none',textAlign:'right',display:'flex',flexDirection:'column',gap:4}}>
      <span style={{font:'var(--type-data)',fontSize:12,color:'var(--text-tertiary)'}}>{questions}q · {cards}f</span>
      <span style={{font:'600 13px/1 var(--font-sans)',color:'var(--text-brand)'}}>{mastery}% domínio</span>
    </div>
    <Icon name="chevron-right" size={18} style={{color:'var(--text-tertiary)'}}/>
  </button>;
}