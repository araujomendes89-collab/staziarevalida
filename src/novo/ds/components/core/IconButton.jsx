import React from 'react';
import { Icon } from './Icon.jsx';
export function IconButton({icon,label,variant='ghost',size='md',badge,className='',...rest}){
  const cls=['sm-iconbtn',variant!=='ghost'&&'sm-iconbtn--'+variant,size==='sm'&&'sm-iconbtn--sm',className].filter(Boolean).join(' ');
  return <button type="button" className={cls} aria-label={label} title={label} {...rest}>
    <Icon name={icon} size={size==='sm'?18:20}/>
    {badge!=null&&<span className="sm-iconbtn__badge" aria-hidden="true">{badge}</span>}
  </button>;
}