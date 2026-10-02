import React, { useId } from 'react';
import { Icon } from '../core/Icon.jsx';
export function SelectField({label,hint,options=[],id,...rest}){
  const auto=useId(); const fid=id||auto;
  return <div className="sm-field">
    {label&&<label className="sm-field__label" htmlFor={fid}>{label}</label>}
    <div className="sm-input">
      <select id={fid} {...rest}>{options.map(o=>typeof o==='string'?<option key={o}>{o}</option>:<option key={o.value} value={o.value}>{o.label}</option>)}</select>
      <Icon name="chevron-down" size={18} className="sm-input__trail"/>
    </div>
    {hint&&<span className="sm-field__hint">{hint}</span>}
  </div>;
}