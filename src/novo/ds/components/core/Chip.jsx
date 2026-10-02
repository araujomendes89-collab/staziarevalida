import React from 'react';
import { Icon } from './Icon.jsx';
export function Chip({selected=false,icon,count,children,onClick,...rest}){
  return <button type="button" className="sm-chip" aria-pressed={selected} onClick={onClick} {...rest}>
    {icon&&<Icon name={icon} size={16}/>}{children}{count!=null&&<span className="sm-chip__count">{count}</span>}
  </button>;
}