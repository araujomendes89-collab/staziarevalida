import React from 'react';
export function Switch({label,description,checked,defaultChecked,onChange,...rest}){
  return <label className="sm-switch">
    <span style={{display:'flex',flexDirection:'column',gap:2}}>
      <span style={{font:'var(--type-label)',color:'var(--text-primary)'}}>{label}</span>
      {description&&<span style={{font:'var(--type-body-sm)',fontSize:13,color:'var(--text-tertiary)'}}>{description}</span>}
    </span>
    <input type="checkbox" role="switch" checked={checked} defaultChecked={defaultChecked} onChange={onChange} {...rest}/>
    <span className="sm-switch__track"/>
  </label>;
}