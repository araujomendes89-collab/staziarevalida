import React from 'react';
import { Icon } from '../core/Icon.jsx';
export function AnswerOption({letter,children,state='idle',onClick,multi=false}){
  const cls={selected:'sm-answer--selected',correct:'sm-answer--correct',incorrect:'sm-answer--incorrect',dimmed:'sm-answer--dimmed'}[state]||'';
  const locked=state==='correct'||state==='incorrect'||state==='dimmed';
  return <button type="button" className={'sm-answer '+cls} onClick={onClick} disabled={locked} role={multi?'checkbox':'radio'} aria-checked={state==='selected'}>
    <span className="sm-answer__letter">{letter}</span>
    <span className="sm-answer__text">{children}</span>
    <span className="sm-answer__mark">
      {state==='correct'&&<Icon name="circle-check" size={22} label="Correta"/>}
      {state==='incorrect'&&<Icon name="circle-x" size={22} label="Incorreta"/>}
    </span>
  </button>;
}