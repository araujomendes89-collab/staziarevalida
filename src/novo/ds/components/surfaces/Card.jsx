import React from 'react';
export function Card({variant='default',padding=24,interactive=false,as:Tag='div',children,style,className='',...rest}){
  const cls=['sm-card',variant!=='default'&&'sm-card--'+variant,interactive&&'sm-card--interactive',className].filter(Boolean).join(' ');
  return <Tag className={cls} style={{padding,...style}} tabIndex={interactive?0:undefined} {...rest}>{children}</Tag>;
}