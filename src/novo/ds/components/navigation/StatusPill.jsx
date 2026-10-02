import React from 'react';
import { Icon } from '../core/Icon.jsx';
export function StatusPill({icon,iconColor,label,value,onClick}){
  return <button type="button" className="sm-pill" onClick={onClick} aria-label={label+': '+value}>
    <Icon name={icon} size={16} style={{color:iconColor}}/>
    <span style={{color:'var(--text-secondary)',fontWeight:500}}>{label}</span><span>{value}</span>
  </button>;
}