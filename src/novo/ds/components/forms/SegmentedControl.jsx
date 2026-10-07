import React from 'react';
import { Icon } from '../core/Icon.jsx';
export function SegmentedControl({options=[],value,onChange,fullWidth=false,label}){
  return <div className={'sm-seg'+(fullWidth?' sm-seg--full':'')} role="radiogroup" aria-label={label}>
    {options.map(o=>{const v=typeof o==='string'?o:o.value;const l=typeof o==='string'?o:o.label;
      return <button key={v} type="button" role="radio" aria-checked={v===value} disabled={o.disabled} aria-disabled={o.disabled?'true':undefined} className="sm-seg__opt" onClick={()=>onChange&&onChange(v)}>
        {o.icon&&<Icon name={o.icon} size={16}/>}{l}{o.badge}
      </button>;})}
  </div>;
}