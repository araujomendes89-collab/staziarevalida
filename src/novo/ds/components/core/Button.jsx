import React from 'react';
import { Icon } from './Icon.jsx';
export function Button({variant='primary',size='md',icon,iconRight,loading=false,fullWidth=false,disabled,children,className='',type='button',...rest}){
  const cls=['sm-btn','sm-btn--'+variant,size!=='md'&&'sm-btn--'+size,fullWidth&&'sm-btn--full',className].filter(Boolean).join(' ');
  const s=size==='sm'?16:18;
  return <button type={type} className={cls} disabled={disabled||loading} aria-busy={loading||undefined} {...rest}>
    {loading?<span className="sm-spin" aria-hidden="true"/>:icon&&<Icon name={icon} size={s}/>}
    {children}
    {iconRight&&!loading&&<Icon name={iconRight} size={s}/>}
  </button>;
}