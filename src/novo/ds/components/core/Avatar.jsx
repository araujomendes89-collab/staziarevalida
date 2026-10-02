import React from 'react';
export function Avatar({name='',src,size=36,style}){
  const ini=name.trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  return <span className="sm-avatar" style={{width:size,height:size,fontSize:Math.round(size*.4),...style}} aria-label={name} role="img">
    {src?<img src={src} alt=""/>:ini}
  </span>;
}