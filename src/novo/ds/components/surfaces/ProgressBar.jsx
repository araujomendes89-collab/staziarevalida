import React from 'react';
export function ProgressBar({value=0,max=100,label,valueLabel,height=8,color='var(--chart-1)'}){
  const pct=Math.max(0,Math.min(100,(value/max)*100));
  return <div style={{display:'flex',flexDirection:'column',gap:8,minWidth:0}}>
    {(label||valueLabel)&&<div style={{display:'flex',justifyContent:'space-between',gap:12,font:'var(--type-body-sm)'}}>
      <span style={{color:'var(--text-primary)',fontWeight:500}}>{label}</span>
      <span style={{color:'var(--text-secondary)',fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{valueLabel}</span>
    </div>}
    <div className="sm-progress" style={{height}} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className="sm-progress__fill" style={{width:pct+'%',background:color}}/>
    </div>
  </div>;
}