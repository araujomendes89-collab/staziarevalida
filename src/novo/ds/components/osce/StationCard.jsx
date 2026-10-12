import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { areaByCode, areaVars } from '../../areas.js';
import { formatDecimal } from '../../format.js';
// Cartão do Banco de estações: área, número, título, queixas, origem, "Sua última nota" e "Média geral".
// Sem dificuldade (decisão do dono). Notas em % de 0 a 100; sem nota fica "—", nunca zero inventado.
export function StationCard({areaCode,number,title,tags=[],source,myScorePct,averagePct,onClick}){
  const area=areaByCode(areaCode); const v=areaVars(areaCode);
  const mine=typeof myScorePct==='number'&&Number.isFinite(myScorePct)?myScorePct:null;
  const avg=typeof averagePct==='number'&&Number.isFinite(averagePct)?averagePct:null;
  const style={'--osce-base':v.base,'--osce-soft':v.soft,'--osce-ink':v.ink,'--osce-solid':v.solid};
  return <button type="button" className="osce-station" style={style} onClick={onClick}>
    <div className="osce-station__top">
      <div className="osce-station__head">
        {number!=null&&<span className="osce-station__num">{number}</span>}
        <div className="osce-station__area">{area?area.card:''}</div>
        {mine!=null&&<span className="osce-station__done" title="Já realizada"><Icon name="check" size={16}/></span>}
      </div>
      <h3 className="osce-station__title">{title}</h3>
      {tags.length>0&&<div className="osce-station__tags">{tags.map(t=><span key={t} className="osce-station__tag">{t}</span>)}</div>}
      {source&&<div className="osce-station__source">{source}</div>}
    </div>
    <div className="osce-station__scores">
      <div className="osce-station__score"><div className="osce-station__k">Sua última nota</div><div className="osce-station__v osce-station__v--mine" data-empty={mine==null}>{mine==null?'—':<>{formatDecimal(mine,0)}<span>%</span></>}</div></div>
      <div className="osce-station__score osce-station__score--avg"><div className="osce-station__k">Média geral</div><div className="osce-station__v">{avg==null?'—':<>{formatDecimal(avg,1)}<span>%</span></>}</div></div>
    </div>
    {mine!=null&&<div className="osce-station__bar"><span style={{width:Math.min(100,Math.max(0,mine))+'%'}}/></div>}
  </button>;
}
