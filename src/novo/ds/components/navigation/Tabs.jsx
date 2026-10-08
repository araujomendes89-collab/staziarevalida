import React from 'react';
import { Icon } from '../core/Icon.jsx';
export function Tabs({tabs=[],value,onChange,label,wrap=false}){
  return <div className={wrap?"sm-tabs sm-tabs--wrap":"sm-tabs"} role="tablist" aria-label={label}>
    {tabs.map(t=><button key={t.value} type="button" role="tab" aria-selected={t.value===value} className="sm-tab" onClick={()=>onChange&&onChange(t.value)}>
      {t.icon&&<Icon name={t.icon} size={16}/>}{t.label}{t.count!=null&&<span className="sm-tab__count">{t.count}</span>}{t.pro&&<span className="sm-badge sm-badge--sm" style={{background:'var(--pro-bg)',color:'var(--pro-text)'}}>PRO</span>}
    </button>)}
  </div>;
}