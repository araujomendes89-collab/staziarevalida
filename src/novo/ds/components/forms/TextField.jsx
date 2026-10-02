import React, { useId, useState } from 'react';
import { Icon } from '../core/Icon.jsx';
export function TextField({label,hint,error,icon,type='text',size='md',id,...rest}){
  const auto=useId(); const fid=id||auto; const [show,setShow]=useState(false);
  const isPw=type==='password';
  return <div className="sm-field">
    {label&&<label className="sm-field__label" htmlFor={fid}>{label}</label>}
    <div className={['sm-input',error&&'sm-input--error',size==='lg'&&'sm-input--lg'].filter(Boolean).join(' ')}>
      {icon&&<Icon name={icon} size={18}/>}
      <input id={fid} type={isPw&&show?'text':type} aria-invalid={!!error||undefined} aria-describedby={(error||hint)?fid+'-d':undefined} {...rest}/>
      {isPw&&<button type="button" className="sm-input__toggle" onClick={()=>setShow(s=>!s)} aria-label={show?'Ocultar senha':'Mostrar senha'}><Icon name={show?'eye-off':'eye'} size={18}/></button>}
    </div>
    {error?<span id={fid+'-d'} className="sm-field__error"><Icon name="circle-alert" size={14}/>{error}</span>:hint&&<span id={fid+'-d'} className="sm-field__hint">{hint}</span>}
  </div>;
}