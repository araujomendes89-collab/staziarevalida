import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../core/Icon.jsx';
const IC={info:'info',success:'circle-check',warning:'triangle-alert',danger:'circle-x'};
export function Toast({tone='info',title,message,onClose}){
  return <div role="status" className="sm-toast" data-tone={tone}>
    <span className="sm-toast__icon"><Icon name={IC[tone]||IC.info} size={18}/></span>
    <div className="sm-toast__text"><div className="sm-toast__title">{title}</div>{message&&<div className="sm-toast__msg">{message}</div>}</div>
    {onClose&&<button type="button" className="sm-toast__close" aria-label="Fechar" onClick={onClose}><Icon name="x" size={16}/></button>}
  </div>;
}
// Um aviso por vez; some em 2600 ms. Devolve [no, mostrar]: o `no` vai uma vez em qualquer lugar da tela.
export function useToast(){
  const [item,setItem]=useState(null); const timer=useRef(null);
  const show=useCallback((title,tone='success')=>{
    if(timer.current) clearTimeout(timer.current);
    setItem({title,tone,k:Date.now()+Math.random()});
    timer.current=setTimeout(()=>{ timer.current=null; setItem(null); },2600);
  },[]);
  useEffect(()=>()=>{ if(timer.current) clearTimeout(timer.current); },[]);
  const node=<div className="sm-toast-host" aria-live="polite">{item&&<Toast key={item.k} tone={item.tone} title={item.title}/>}</div>;
  return [node,show];
}
