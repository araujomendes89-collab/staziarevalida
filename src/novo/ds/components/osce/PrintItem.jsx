import React, { useState } from 'react';
import { Icon } from '../core/Icon.jsx';
import { Button } from '../core/Button.jsx';
// Linha de um impresso da estação (exame, imagem) que o avaliador libera ao candidato.
// `index` é o número que a pessoa vê na tela (display_number). Só o avaliador (canRelease) recebe `sourceNumber`,
// o número do impresso no documento oficial; quando ele é diferente de `index`, aparece em linha pequena.
// Candidato: impresso não liberado mostra só "Impresso {index} · Aguardando liberação" (o título pode revelar o tema).
export function PrintItem({index,sourceNumber,title,released,canRelease,onToggleRelease,children}){
  const [open,setOpen]=useState(false);
  const canSee=!!children&&(released||canRelease);
  const locked=!released&&!canRelease;
  const showSource=!!canRelease&&sourceNumber!=null&&sourceNumber!==index;
  return <div className="osce-print" data-released={!!released}>
    <div className="osce-print__row">
      <span className="osce-print__lock"><Icon name={released?'lock-open':'lock'} size={15}/></span>
      <span className="osce-print__title">
        <span className="osce-print__name">Impresso {index} · {locked?'Aguardando liberação':title}</span>
        {showSource&&<small className="osce-print__source">no documento oficial: Impresso {sourceNumber}</small>}
      </span>
      {canRelease&&<Button size="sm" variant={released?'ghost':'secondary'} onClick={onToggleRelease}>{released?'Ocultar':'Liberar'}</Button>}
      {canSee&&<button type="button" className="osce-print__toggle" aria-label="Ver conteúdo" aria-expanded={open} onClick={()=>setOpen(!open)}><Icon name={open?'chevron-up':'chevron-down'} size={18}/></button>}
    </div>
    {open&&canSee&&<div className="osce-print__body">{children}</div>}
  </div>;
}
