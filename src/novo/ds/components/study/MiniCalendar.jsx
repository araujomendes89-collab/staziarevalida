import React, { useState } from 'react';
import { IconButton } from '../core/IconButton.jsx';
import { Icon } from '../core/Icon.jsx';
const M=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export function MiniCalendar({year=2026,month=9,today=2,marked=[],selected,onSelect}){
  const [ym,setYm]=useState([year,month]); const [sel,setSel]=useState(selected??today);
  const [y,m]=ym; const first=new Date(y,m,1).getDay(); const n=new Date(y,m+1,0).getDate();
  const cells=[...Array(first).fill(null),...Array.from({length:n},(_,i)=>i+1)];
  const isCur=y===year&&m===month;
  const mv=d=>{let nm=m+d,ny=y;if(nm<0){nm=11;ny--;}if(nm>11){nm=0;ny++;}setYm([ny,nm]);};
  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <Icon name="calendar" size={18} style={{color:'var(--text-brand)'}}/>
      <span style={{flex:1,font:'var(--type-label)',fontSize:15,color:'var(--text-primary)'}} aria-live="polite">{M[m]} {y}</span>
      <IconButton icon="chevron-left" label="Mês anterior" size="sm" onClick={()=>mv(-1)}/>
      <IconButton icon="chevron-right" label="Próximo mês" size="sm" onClick={()=>mv(1)}/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,textAlign:'center'}}>
      {['D','S','T','Q','Q','S','S'].map((d,i)=><span key={i} style={{font:'var(--type-caption)',color:'var(--text-tertiary)',padding:'4px 0'}}>{d}</span>)}
      {cells.map((d,i)=>d==null?<span key={i}/>:<button key={i} type="button" className={'sm-cal__day'+(isCur&&d===today?' sm-cal__day--today':'')} aria-pressed={isCur&&d===sel} onClick={()=>{setSel(d);onSelect&&onSelect(d);}} aria-label={d+' de '+M[m]+(isCur&&marked.includes(d)?', com atividade':'')}>{d}{isCur&&marked.includes(d)&&d!==sel&&<span className="sm-cal__dot"/>}</button>)}
    </div>
  </div>;
}