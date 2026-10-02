import React, { useState } from 'react';
import { Icon } from '../core/Icon.jsx';
export function Sidebar({items=[],activeId,onSelect,brand,footer}){
  const parentOf=id=>items.find(i=>i.children&&i.children.some(c=>c.id===id));
  const [open,setOpen]=useState(()=>{const p=parentOf(activeId);return p?{[p.id]:true}:{};});
  return <nav className="sm-nav" aria-label="Navegação principal">
    <div className="sm-nav__brand">{brand}</div>
    <div className="sm-nav__list">
      {items.map(it=>{
        const hasKids=it.children&&it.children.length; const isOpen=!!open[it.id];
        const childActive=hasKids&&it.children.some(c=>c.id===activeId);
        return <div key={it.id}>
          <button type="button" className={'sm-nav__item'+(childActive?' sm-nav__item--parent-active':'')} aria-current={it.id===activeId?'page':undefined} aria-expanded={hasKids?isOpen:undefined}
            onClick={()=>hasKids?setOpen(o=>({...o,[it.id]:!o[it.id]})):onSelect&&onSelect(it.id)}>
            <Icon name={it.icon} size={20}/><span className="sm-nav__label">{it.label}</span>
            {hasKids&&<Icon name="chevron-right" size={16} className={'sm-nav__chev'+(isOpen?' sm-nav__chev--open':'')}/>}
          </button>
          {hasKids&&isOpen&&<div className="sm-nav__sub">
            {it.children.map(c=><button key={c.id} type="button" className="sm-nav__item" aria-current={c.id===activeId?'page':undefined} onClick={()=>onSelect&&onSelect(c.id)}>
              <span className="sm-nav__label">{c.label}</span>{c.pro&&<span className="sm-badge sm-badge--sm" style={{background:'var(--pro-bg)',color:'var(--pro-text)',borderColor:'var(--pro-border)'}}>PRO</span>}
            </button>)}
          </div>}
        </div>;})}
    </div>
    {footer&&<div className="sm-nav__foot">{footer}</div>}
  </nav>;
}