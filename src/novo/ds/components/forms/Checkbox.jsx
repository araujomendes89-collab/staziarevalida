import React from 'react';
import { Icon } from '../core/Icon.jsx';
export function Checkbox({label,checked,defaultChecked,onChange,disabled,...rest}){
  return <label className={'sm-check'+(disabled?' sm-check--disabled':'')}>
    <input type="checkbox" checked={checked} defaultChecked={defaultChecked} onChange={onChange} disabled={disabled} {...rest}/>
    <span className="sm-check__box"><Icon name="check" size={14}/></span>
    {label&&<span>{label}</span>}
  </label>;
}