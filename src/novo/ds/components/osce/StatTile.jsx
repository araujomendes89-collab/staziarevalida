import React from 'react';
import { Icon } from '../core/Icon.jsx';
// Bloco de número do painel de disponibilidade e do histórico. Só dado real: sem dado, passar "—".
export function StatTile({label,value,hint,icon}){
  return <div className="osce-stat">
    <span className="osce-stat__label">{icon&&<Icon name={icon} size={14}/>}{label}</span>
    <span className="osce-stat__value">{value}</span>
    {hint&&<span className="osce-stat__hint">{hint}</span>}
  </div>;
}
