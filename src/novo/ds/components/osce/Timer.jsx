import React from 'react';
const pad=n=>String(n).padStart(2,'0');
// Contagem regressiva em "mm:ss". Só mostra o valor que recebe: o tempo certo vem do servidor (ends_at), nunca de um contador local.
// Tom warn a partir de warnAt (120 s) e danger a partir de dangerAt (30 s) e no zero. role="timer" aria-live="off": leitor de tela não repete a cada segundo.
export function Timer({seconds,state='idle',warnAt=120,dangerAt=30,size=26}){
  const s=Number.isFinite(seconds)?Math.max(0,Math.floor(seconds)):0;
  const tone=s===0||s<=dangerAt?'danger':s<=warnAt?'warn':undefined;
  return <span className="osce-timer" data-state={state} data-tone={state==='idle'?undefined:tone} role="timer" aria-live="off" style={{fontSize:size}}>
    <span className="osce-timer__dot" aria-hidden="true"/>{pad(Math.floor(s/60))}:{pad(s%60)}
  </span>;
}
