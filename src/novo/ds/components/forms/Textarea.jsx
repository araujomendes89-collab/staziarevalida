import React, { useId, useState } from 'react';
export function Textarea({label,hint,showCount=false,id,rows=4,className,onChange,value,defaultValue,maxLength,...rest}){
  const auto=useId(); const fid=id||auto;
  const [inner,setInner]=useState(()=>String(defaultValue??''));
  const text=value!==undefined?String(value):inner;
  const describedBy=[hint&&fid+'-h',showCount&&fid+'-c'].filter(Boolean).join(' ')||undefined;
  const change=e=>{ if(value===undefined) setInner(e.target.value); onChange&&onChange(e); };
  return <div className="sm-field">
    {label&&<label className="sm-field__label" htmlFor={fid}>{label}</label>}
    <textarea id={fid} rows={rows} maxLength={maxLength} className={['sm-textarea',className].filter(Boolean).join(' ')} aria-describedby={describedBy} {...(value!==undefined?{value}:{defaultValue})} onChange={change} {...rest}/>
    {(hint||showCount)&&<div className="sm-textarea__foot">
      {hint?<span id={fid+'-h'} className="sm-field__hint">{hint}</span>:<span/>}
      {showCount&&<span id={fid+'-c'} className="sm-textarea__count">{maxLength!=null?text.length+'/'+maxLength:text.length}</span>}
    </div>}
  </div>;
}
