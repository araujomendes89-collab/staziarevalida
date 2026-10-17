import React, { useId, useState } from 'react';
import { Icon } from '../core/Icon.jsx';
export function Accordion({title,icon,meta,open:openProp,defaultOpen=false,onToggle,children}){
  const uid=useId(); const [inner,setInner]=useState(defaultOpen);
  const open=openProp!==undefined?openProp:inner;
  const toggle=()=>{ if(openProp===undefined) setInner(!open); onToggle&&onToggle(!open); };
  return <div className={['sm-acc',icon&&'sm-acc--icon'].filter(Boolean).join(' ')} data-open={open}>
    <button type="button" id={uid+'-h'} className="sm-acc__head" aria-expanded={open} aria-controls={uid+'-b'} onClick={toggle}>
      {icon&&<span className="sm-acc__icon"><Icon name={icon} size={17}/></span>}
      <span>{title}</span>{meta}
      <Icon name="chevron-down" size={18} className="sm-acc__chev"/>
    </button>
    <div id={uid+'-b'} role="region" aria-labelledby={uid+'-h'} className="sm-acc__body" hidden={!open}>{children}</div>
  </div>;
}
