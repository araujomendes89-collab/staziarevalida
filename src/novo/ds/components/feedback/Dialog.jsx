import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
const FOCUSABLE='a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
// Janela de confirmação. Portal em document.body, foco preso dentro, Esc e clique no fundo fecham, o foco volta a quem abriu.
export function Dialog({open=true,title,description,children,actions,onClose,className,label}){
  const uid=useId(); const boxRef=useRef(null); const closeRef=useRef(onClose);
  closeRef.current=onClose;
  useEffect(()=>{
    if(!open) return undefined;
    const opener=document.activeElement;
    const box=boxRef.current;
    const list=()=>Array.from(box?box.querySelectorAll(FOCUSABLE):[]);
    const first=list()[0];
    if(first) first.focus(); else if(box) box.focus();
    const onKey=e=>{
      if(e.key==='Escape'){ e.stopPropagation(); closeRef.current&&closeRef.current(); return; }
      if(e.key!=='Tab'||!box) return;
      const items=list();
      if(!items.length){ e.preventDefault(); box.focus(); return; }
      const a=items[0], z=items[items.length-1], cur=document.activeElement;
      if(!box.contains(cur)){ e.preventDefault(); (e.shiftKey?z:a).focus(); }
      else if(e.shiftKey&&(cur===a||cur===box)){ e.preventDefault(); z.focus(); }
      else if(!e.shiftKey&&cur===z){ e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown',onKey);
    return ()=>{
      document.removeEventListener('keydown',onKey);
      if(opener&&typeof opener.focus==='function'&&document.contains(opener)) opener.focus();
    };
  },[open]);
  if(!open) return null;
  const titleId=title?uid+'-t':undefined, descId=description?uid+'-d':undefined;
  return createPortal(
    <div className="sm-dialog-overlay" onClick={e=>{ if(e.target===e.currentTarget&&onClose) onClose(); }}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-label={title?undefined:label} aria-describedby={descId} tabIndex={-1} className={className?'sm-dialog '+className:'sm-dialog'}>
        <div className="sm-dialog__body">
          {title&&<h2 id={titleId} className="sm-dialog__title">{title}</h2>}
          {description&&<p id={descId} className="sm-dialog__desc">{description}</p>}
          {children}
        </div>
        {actions&&<div className="sm-dialog__actions">{actions}</div>}
      </div>
    </div>,
    document.body);
}
