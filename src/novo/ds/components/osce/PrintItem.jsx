import React, { useState } from 'react';
import { Icon } from '../core/Icon.jsx';
import { Button } from '../core/Button.jsx';
// Linha de um impresso da estação (exame, imagem) que o avaliador libera ao candidato.
// Candidato: sem canRelease; impresso não liberado mostra só o título trancado.
export function PrintItem({index,title,released,canRelease,onToggleRelease,children}){
  const [open,setOpen]=useState(false);
  const canSee=!!children&&(released||canRelease);
  return <div className="osce-print" data-released={!!released}>
    <div className="osce-print__row">
      <span className="osce-print__lock"><Icon name={released?'lock-open':'lock'} size={15}/></span>
      <span className="osce-print__title">Impresso {index} · {title}</span>
      {canRelease&&<Button size="sm" variant={released?'ghost':'secondary'} onClick={onToggleRelease}>{released?'Ocultar':'Liberar'}</Button>}
      {canSee&&<button type="button" className="osce-print__toggle" aria-label="Ver conteúdo" aria-expanded={open} onClick={()=>setOpen(!open)}><Icon name={open?'chevron-up':'chevron-down'} size={18}/></button>}
    </div>
    {open&&canSee&&<div className="osce-print__body">{children}</div>}
  </div>;
}
