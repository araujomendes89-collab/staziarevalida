import React from 'react';
// Ícones servidos pelo próprio site (scripts/design-system/sync-icons.mjs), mesma versão lucide-static@0.468.0.
const CDN='/ds-icons/';
export function Icon({name,size=20,label,style,className=''}){
  return <span className={'sm-icon '+className} role={label?'img':undefined} aria-label={label} aria-hidden={label?undefined:true}
    style={{width:size,height:size,'--icon':'url('+CDN+name+'.svg)',...style}}/>;
}