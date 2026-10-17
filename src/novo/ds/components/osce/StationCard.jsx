import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { areaByCode, areaVars } from '../../areas.js';
import { formatDecimal } from '../../format.js';
// Cartão do Banco de estações (pedido do dono de 17/10): área, nome da estação, grau de dificuldade e origem; embaixo,
// "Sua última nota" e "Média geral". Sem número e sem as queixas/temas pequenos.
// Dificuldade: 'facil' | 'medio' | 'dificil', definida pela revisão médica; sem grau gravado, nenhum selo (nada inventado).
// Notas em % de 0 a 100; sem nota fica "—", nunca zero inventado.
const LEVELS={facil:['Fácil',1],medio:['Médio',2],dificil:['Difícil',3]};
export function StationLevel({level}){
  const l=LEVELS[level]; if(!l) return null;
  return <span className="osce-level" data-level={level} title={'Dificuldade: '+l[0]}>
    <span className="osce-level__bars" aria-hidden="true">{[1,2,3].map(i=><span key={i} data-on={i<=l[1]}/>)}</span>{l[0]}
  </span>;
}
export function StationCard({areaCode,title,difficulty,source,myScorePct,averagePct,onClick}){
  const area=areaByCode(areaCode); const v=areaVars(areaCode);
  const mine=typeof myScorePct==='number'&&Number.isFinite(myScorePct)?myScorePct:null;
  const avg=typeof averagePct==='number'&&Number.isFinite(averagePct)?averagePct:null;
  const style={'--osce-base':v.base,'--osce-soft':v.soft,'--osce-ink':v.ink,'--osce-solid':v.solid};
  const level=LEVELS[difficulty]?difficulty:null;
  return <button type="button" className="osce-station" style={style} onClick={onClick}>
    <div className="osce-station__top">
      <div className="osce-station__head">
        <div className="osce-station__area"><span className="osce-station__dot" aria-hidden="true"/>{area?area.card:''}</div>
        {mine!=null&&<span className="osce-station__done" title="Já realizada"><Icon name="check" size={16}/></span>}
      </div>
      <h3 className="osce-station__title">{title}</h3>
      {(level||source)&&<div className="osce-station__meta">
        {level&&<StationLevel level={level}/>}
        {source&&<span className="osce-station__source">{source}</span>}
      </div>}
    </div>
    <div className="osce-station__scores">
      <div className="osce-station__score"><div className="osce-station__k">Sua última nota</div><div className="osce-station__v osce-station__v--mine" data-empty={mine==null}>{mine==null?'—':<>{formatDecimal(mine,0)}<span>%</span></>}</div></div>
      <div className="osce-station__score osce-station__score--avg"><div className="osce-station__k">Média geral</div><div className="osce-station__v">{avg==null?'—':<>{formatDecimal(avg,1)}<span>%</span></>}</div></div>
    </div>
    {mine!=null&&<div className="osce-station__bar"><span style={{width:Math.min(100,Math.max(0,mine))+'%'}}/></div>}
  </button>;
}
