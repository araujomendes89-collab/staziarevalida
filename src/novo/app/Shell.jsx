// Estrutura do app novo (menu lateral, cabeçalho, barra de atalhos, navegação mobile).
// Derivado de src/novo/prototype/AppShell.jsx: mesma marcação e estilos; os dados de
// demonstração (nome, contadores) foram trocados pelos dados reais recebidos em `info`.
import { aulasParaAluno } from "./features.js";
import React from "react";
import { Icon, Avatar, IconButton } from "../ds";
import { RI_CSS } from "../prototype/RealIcons.jsx";
import { AppRealIcon } from "./AppIcons.jsx";
function useMQ(q){const [m,setM]=React.useState(()=>matchMedia(q).matches);React.useEffect(()=>{const mq=matchMedia(q);const f=()=>setM(mq.matches);mq.addEventListener('change',f);return ()=>mq.removeEventListener('change',f);},[q]);return m;}
function useMobile(){const q='(max-width: 860px)';const [m,setM]=React.useState(()=>matchMedia(q).matches);React.useEffect(()=>{const mq=matchMedia(q);const f=()=>setM(mq.matches);mq.addEventListener('change',f);return ()=>mq.removeEventListener('change',f);},[]);return m;}
const RAILS={1:[['home','house','Visão Geral'],['trilha','route','Minha Trilha'],['questoes','file-question','Banco de Questões'],['simulados','timer','Simulados'],['flash','layers','Revisar'],['classificacao','trophy','Ranking'],['desempenho','chart-column','Dados'],['tutor','sparkles','Nexus']],2:[['home2','house','Início'],['teoria2','book-open','Teoria'],['estacoes','clipboard-list','Estações'],['dupla','users','Praticar'],['peps','list-checks','PEPs'],['paciente','message-circle-heart','Paciente IA'],['desempenho2','chart-column','Dados']]};
const GROUP={erros:'flash',missoes:'trilha',conquistas:'perfil',classificacao:'classificacao'};
const FULL=['sessao','estacao'];
const GROUPS={1:[['Minha Jornada',[['home','house','Visão Geral'],['hoje','list-checks','Plano de Hoje'],['trilha','route','Minha Trilha']]],['Aprender',[['aulas','tv','Aulas'],['temas','book-open','Temas Essenciais'],['atualizacoes','newspaper','Diretrizes e Atualizações']]],['Praticar',[['questoes','file-question','Banco de Questões'],['simulados','timer','Simulados']]],['Revisar',[['flash','layers','Flashcards'],['erros','notebook-pen','Caderno de Erros']]],['Stazia Arena',[['missoes','target','Missões'],['classificacao','trophy','Ranking'],['conquistas','award','Conquistas']]],['Minha Evolução',[['desempenho','chart-column','Desempenho'],['analise','chart-pie','Análise Inteligente'],['plano','calendar-days','Planejamento']]],['Nexus',[['tutor','sparkles','Tutor com IA']]]],
2:[['Menu',[['home2','house','Início'],['teoria2','book-open','Teoria'],['estacoes','clipboard-list','Estações'],['dupla','users','Praticar'],['peps','list-checks','Meus PEPs']]],['Treino com IA',[['paciente','message-circle-heart','Paciente simulado']]],['Análise',[['desempenho2','chart-column','Desempenho']]]]};
// Aulas fechadas ao aluno por enquanto (features.js): o item só aparece quando o interruptor está ligado. Lido na hora de desenhar.
const groupsOf=n=>GROUPS[n].map(([t,items])=>[t,items.filter(([id])=>id!=='aulas'||aulasParaAluno())]);
function Rail({route,go,phase,collapsed,setCollapsed,info,theme}){
  const badgeOf={flash:info.flashcardsDue||null};
  const G=groupsOf(phase);const W=collapsed?76:264;
  const [txt,setTxt]=React.useState(!collapsed);const [hov,setHov]=React.useState(false);
  React.useEffect(()=>{if(collapsed){setTxt(false);return;}const t=setTimeout(()=>setTxt(true),170);return ()=>clearTimeout(t);},[collapsed]);
  const sub=['aulas','temas','atualizacoes'];const [openSub,setOpenSub]=React.useState(sub.includes(route));
  React.useEffect(()=>{if(sub.includes(route))setOpenSub(true);},[route]);
  const listRef=React.useRef(null);const [ind,setInd]=React.useState(null);
  const activeKey=route; // sem submenu: Aulas, Grandes Temas e Atualizações são itens do grupo Estudar
  React.useLayoutEffect(()=>{const el=listRef.current&&listRef.current.querySelector('[data-key="'+activeKey+'"]');if(!el){setInd(null);return;}const m=()=>{const L=listRef.current;if(!L)return;setInd({top:el.getBoundingClientRect().top-L.getBoundingClientRect().top+L.scrollTop,h:el.offsetHeight});};m();const t=setTimeout(m,340);return ()=>clearTimeout(t);},[activeKey,collapsed,openSub,txt,phase]);
  const fade={opacity:txt?1:0,transition:'opacity 180ms ease',whiteSpace:'nowrap'};
  const row=(key,ic,l,{badge,onClick,small,chev,open}={})=>{const on=key===activeKey;return <button key={key} data-key={key} type="button" onClick={onClick||(()=>go(key))} aria-current={on?'page':undefined} title={collapsed?l:undefined} aria-label={collapsed?l:undefined}
    className="smr-row" style={{position:'relative',zIndex:1,display:'flex',alignItems:'center',gap:12,width:'100%',height:small?36:40,flex:'none',padding:collapsed?0:(small?'0 16px 0 48px':'0 20px'),justifyContent:collapsed?'center':'flex-start',border:0,background:'transparent',color:on?'var(--action-on-primary)':'var(--text-secondary)',font:(on?'700':'500')+' '+(small?13.5:14)+'px var(--font-sans)',cursor:'pointer',transition:'color 250ms'}}>
    {!small&&<span className="smr-ic"><span className="o" style={{display:'inline-flex'}}><Icon name={ic} size={19}/></span><span className="c">{AppRealIcon({name:ic})||<Icon name={ic} size={19}/>}</span></span>}
    {!collapsed&&<span style={{...fade,flex:1,textAlign:'left',overflow:'hidden'}}>{l}</span>}
    {chev&&!collapsed&&<Icon name="chevron-down" size={16} style={{...fade,transform:open?'rotate(180deg)':'none',transition:'transform 250ms,opacity 180ms'}}/>}
    {badge!=null&&(collapsed?<span style={{position:'absolute',top:8,right:18,width:8,height:8,borderRadius:'50%',background:on?'#fff':'var(--danger-solid)'}}/>:<span style={{...fade,minWidth:20,height:20,padding:'0 6px',borderRadius:999,background:on?'rgba(255,255,255,.25)':'var(--danger-solid)',color:'#fff',font:'700 11px/20px var(--font-sans)',textAlign:'center'}}>{badge}</span>)}
  </button>;};
  const SHORT={'Stazia Arena':'Arena','Minha Jornada':'Jornada','Minha Evolução':'Evolução','Configurações':'Ajustes'};const label=t=><div style={{padding:collapsed?'14px 0 6px':'14px 20px 6px',textAlign:collapsed?'center':'left',fontWeight:700,fontSize:collapsed?8.5:10.5,fontFamily:'var(--font-sans)',lineHeight:1.2,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--text-tertiary)',whiteSpace:'nowrap',overflow:'hidden',transition:'font-size 250ms'}}>{collapsed?(SHORT[t]??t):t}</div>;
  return <nav aria-label="Navegação principal" onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{position:'fixed',left:16,top:16,bottom:16,width:W,zIndex:20,display:'flex',flexDirection:'column',borderRadius:24,background:'color-mix(in oklab,var(--surface-card) 88%,transparent)',backdropFilter:'blur(20px) saturate(1.4)',border:'1px solid var(--border-default)',boxShadow:'var(--shadow-lg)',transition:'width 380ms cubic-bezier(.4,0,.2,1)'}}>
    <style>{'.smr-row:hover:not([aria-current]){color:var(--text-primary)!important;background:var(--action-ghost-hover)!important}.smr-row:active .smr-ic{transform:scale(.9)}'+RI_CSS+'.smr-ic .o{opacity:0!important}.smr-ic .c{opacity:1!important;transform:none!important}.smr-row:hover .smr-ic .c{transform:scale(1.12)!important}'}</style>
    <div style={{display:'flex',alignItems:'center',gap:8,padding:collapsed?'18px 0 10px':'18px 16px 10px 20px',justifyContent:collapsed?'center':'space-between',minHeight:64}}>
      <button type="button" onClick={()=>go(phase===2?'home2':'home')} aria-label="StaziaMed, início" style={{border:0,background:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',minWidth:0,flex:collapsed?'0 0 auto':'1 1 auto'}}>{collapsed?<img src={theme==='dark'?'/brand/simbolo-escuro-64w.png':'/brand/simbolo-64w.png'} alt="" style={{height:30,width:'auto'}}/>:<img src={theme==='dark'?'/brand/horizontal-escuro-480w.png':'/brand/horizontal-480w.png'} alt="StaziaMed Revalida" style={{display:'block',width:'100%',height:'auto',maxWidth:196,...fade}}/>}</button>
    </div>
    <div style={{position:'absolute',top:30,left:'calc(100% - 14px)',display:'flex',alignItems:'center',gap:6,zIndex:2}}>
      <button type="button" onClick={()=>setCollapsed(!collapsed)} aria-label={collapsed?'Expandir menu':'Recolher menu'} aria-expanded={!collapsed} style={{width:28,height:28,display:'inline-flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',border:'1px solid var(--border-default)',background:'var(--surface-card)',boxShadow:'var(--shadow-md)',color:'var(--text-primary)',cursor:'pointer'}}><Icon name={collapsed?'chevron-right':'chevron-left'} size={14}/></button>
      <span aria-hidden="true" style={{height:22,padding:'0 10px',borderRadius:999,background:'var(--action-primary)',color:'var(--action-on-primary)',font:'700 11px/22px var(--font-sans)',boxShadow:'var(--shadow-md)',opacity:hov?1:0,transform:hov?'translateX(0)':'translateX(-6px)',transition:'opacity 200ms,transform 200ms',pointerEvents:'none',whiteSpace:'nowrap'}}>{collapsed?'Expandir':'Recolher'}</span>
    </div>
    <button type="button" onClick={()=>go('perfil')} className="smr-row" style={{display:'flex',alignItems:'center',gap:10,margin:collapsed?'4px auto':'4px 12px',padding:collapsed?4:'8px 10px',borderRadius:16,border:'1px solid '+(collapsed?'transparent':'var(--border-subtle)'),background:collapsed?'transparent':'var(--surface-subtle)',cursor:'pointer',font:'inherit',color:'inherit',textAlign:'left',overflow:'hidden'}} aria-label={'Conta de '+info.name}>
      <Avatar name={info.name} size={36}/>{!collapsed&&<><span style={{...fade,flex:1,minWidth:0}}><span style={{display:'block',font:'600 14px var(--font-sans)'}}>{info.name}</span><span style={{display:'flex',alignItems:'center',gap:4,font:'500 11px var(--font-sans)',color:'var(--text-tertiary)'}}><Icon name="repeat" size={11}/>{phase===1?'1ª fase · objetiva':'2ª fase · prática'}</span></span><Icon name="chevron-right" size={16} style={{...fade,color:'var(--text-tertiary)'}}/></>}
    </button>
    <div ref={listRef} style={{position:'relative',flex:1,minHeight:0,overflowY:'auto',overflowX:'hidden',scrollbarWidth:'none',display:'flex',flexDirection:'column',paddingBottom:12}}>
      {ind&&<span aria-hidden="true" style={{position:'absolute',left:0,right:0,top:ind.top,height:ind.h,background:'var(--action-primary)',boxShadow:'0 6px 18px -6px color-mix(in oklab,var(--action-primary) 70%,transparent)',transition:'top 420ms cubic-bezier(.3,1.25,.5,1),height 300ms',zIndex:0}}/>}
      {G.map(([t,its])=><div key={t}>{label(t)}{its.map(([id,ic,l,bd,kids])=>kids?<div key={id}>{row(id,ic,l,{chev:true,open:openSub,onClick:()=>collapsed?go(kids[0][0]):setOpenSub(o=>!o)})}{openSub&&!collapsed&&<div style={{position:'relative'}}><span style={{position:'absolute',left:29,top:2,bottom:2,width:1,background:'var(--border-default)',zIndex:2}}/>{kids.map(([k,kl])=>row(k,null,kl,{small:true}))}</div>}</div>:row(id,ic,l,{badge:badgeOf[id]??null}))}</div>)}
      <div style={{flex:1}}/>
      <div>{label('Configurações')}{info.isStaff?row('admin','users','Administração',{badge:info.radarGraves||null}):info.isReviewer&&row('admin','stamp','Revisão médica')}{row('planos','crown','Meu Plano')}{row('perfil','settings','Preferências')}{row('sair','log-out','Sair',{onClick:info.onSignOut})}</div>
    </div>
  </nav>;
}
function useNarrowRail(){const q='(max-width: 1200px)';const [m,setM]=React.useState(()=>matchMedia(q).matches);React.useEffect(()=>{const mq=matchMedia(q);const f=()=>setM(mq.matches);mq.addEventListener('change',f);return ()=>mq.removeEventListener('change',f);},[]);return m;}
function useNarrow(){const q='(max-width: 1180px)';const [m,setM]=React.useState(()=>matchMedia(q).matches);React.useEffect(()=>{const mq=matchMedia(q);const f=()=>setM(mq.matches);mq.addEventListener('change',f);return ()=>mq.removeEventListener('change',f);},[]);return m;}
function Dock({go,route,phase,info}){
  const narrow=useNarrow();
  if(FULL.includes(route))return null;
  const it=phase===2?[['estacao','play','Treinar estação'],['dupla','users','Praticar'],['peps','list-checks','PEPs']]:[['questoes','file-question','Banco de Questões'],['flash','layers','Flashcards',info.flashcardsDue?String(info.flashcardsDue):null],['simulados','timer','Simulado']];
  return <div role="toolbar" aria-label="Ações rápidas" style={{position:'fixed',left:0,right:0,marginLeft:'auto',marginRight:'auto',width:'max-content',maxWidth:'calc(100vw - 32px)',bottom:24,display:'flex',whiteSpace:'nowrap',alignItems:'center',gap:2,padding:6,borderRadius:999,background:'var(--navy-900)',boxShadow:'0 18px 40px -12px rgba(13,28,66,.55)',zIndex:30}}>
    {it.map(([id,ic,l,c])=><button key={id} type="button" onClick={()=>go(id)} aria-label={l} title={l} style={{flex:'none',display:'flex',alignItems:'center',gap:8,height:44,padding:narrow?'0 13px':'0 16px',whiteSpace:'nowrap',border:0,borderRadius:999,background:'transparent',color:'#E2E9F5',font:'600 14px var(--font-sans)',cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.1)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>{AppRealIcon({name:ic,size:22})||<Icon name={ic} size={18}/>}{!narrow&&l}{c&&<span style={{font:'600 11px var(--font-mono)',background:'rgba(255,255,255,.16)',padding:'2px 7px',borderRadius:9}}>{c}</span>}</button>)}
    <span style={{width:1,height:24,background:'rgba(255,255,255,.18)',margin:'0 4px'}}/>
    <button type="button" onClick={()=>go(phase===2?'paciente':'tutor')} style={{flex:'none',display:'flex',alignItems:'center',gap:8,height:44,padding:'0 18px',whiteSpace:'nowrap',border:0,borderRadius:999,background:'var(--teal-400)',color:'var(--navy-950)',font:'700 14px var(--font-sans)',cursor:'pointer'}}>{AppRealIcon({name:'sparkles',size:22})}{phase===2?'Paciente simulado':'Perguntar ao tutor'}</button>
  </div>;
}
// Barra de baixo do celular: os atalhos mais usados + "Mais", que abre a lista com TODAS as áreas da 1ª fase (Aulas, Simulados,
// Flashcards, Tutor, Atualizações...). A 2ª fase não ganha "Mais" (só a equipe a vê; os atalhos dela não mudaram).
const ON_BAR=['home','trilha','questoes','classificacao','perfil'];
function MoreSheet({route,go,info,onClose}){
  const ref=React.useRef(null);
  React.useEffect(()=>{const k=e=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',k);const first=ref.current&&ref.current.querySelector('button[data-item]');if(first)first.focus();return ()=>document.removeEventListener('keydown',k);},[onClose]);
  const pick=id=>{onClose();go(id);};
  const badgeOf={flash:info.flashcardsDue||null,admin:info.radarGraves||null};
  const groups=[...groupsOf(1),['Configurações',[...(info.isStaff?[['admin','users','Administração']]:info.isReviewer?[['admin','stamp','Revisão médica']]:[]),['planos','crown','Meu Plano'],['perfil','settings','Conta e ajuda']]]];
  const item=(id,ic,l)=>{const on=route===id||GROUP[route]===id;const b=badgeOf[id];return <button key={id} type="button" data-item="1" onClick={()=>pick(id)} aria-current={on?'page':undefined} style={{display:'flex',alignItems:'center',gap:10,minHeight:48,padding:'0 12px',border:'1px solid '+(on?'var(--action-primary)':'var(--border-subtle)'),borderRadius:14,background:on?'var(--surface-subtle)':'transparent',color:on?'var(--text-primary)':'var(--text-secondary)',font:(on?'700':'500')+' 14px var(--font-sans)',cursor:'pointer',textAlign:'left'}}><Icon name={ic} size={18}/><span style={{flex:1,minWidth:0}}>{l}</span>{b!=null&&<span style={{minWidth:20,height:20,padding:'0 6px',borderRadius:999,background:'var(--danger-solid)',color:'#fff',font:'700 11px/20px var(--font-sans)',textAlign:'center'}}>{b}</span>}</button>;};
  return <div style={{position:'fixed',inset:0,zIndex:40}}>
    <div onClick={onClose} aria-hidden="true" style={{position:'absolute',inset:0,background:'rgba(13,28,66,.45)'}}/>
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Todas as áreas" style={{position:'absolute',left:14,right:14,bottom:'calc(96px + env(safe-area-inset-bottom))',maxHeight:'calc(100vh - 140px - env(safe-area-inset-bottom))',overflowY:'auto',borderRadius:24,background:'var(--surface-card)',border:'1px solid var(--border-default)',boxShadow:'var(--shadow-lg)',padding:'8px 14px 14px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0 0'}}><strong style={{font:'700 16px var(--font-sans)'}}>Todas as áreas</strong><button type="button" onClick={onClose} aria-label="Fechar" style={{width:40,height:40,border:0,borderRadius:'50%',background:'transparent',color:'var(--text-secondary)',cursor:'pointer'}}><Icon name="x" size={20}/></button></div>
      {groups.map(([t,its])=><div key={t}><div style={{padding:'12px 2px 6px',fontWeight:700,fontSize:10.5,fontFamily:'var(--font-sans)',letterSpacing:'.1em',textTransform:'uppercase',color:'var(--text-tertiary)'}}>{t}</div><div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>{its.map(([id,ic,l])=>item(id,ic,l))}</div></div>)}
      <div style={{paddingTop:12}}><button type="button" data-item="1" onClick={()=>{onClose();info.onSignOut&&info.onSignOut();}} style={{display:'flex',alignItems:'center',gap:10,width:'100%',minHeight:48,padding:'0 12px',border:'1px solid var(--border-subtle)',borderRadius:14,background:'transparent',color:'var(--danger-text)',font:'500 14px var(--font-sans)',cursor:'pointer'}}><Icon name="log-out" size={18}/>Sair</button></div>
    </div>
  </div>;
}
function MobileNav({route,go,phase,info}){
  const [more,setMore]=React.useState(false);
  const close=React.useCallback(()=>setMore(false),[]);
  React.useEffect(()=>{setMore(false);},[route]);
  if(FULL.includes(route))return null;
  const it=phase===2?[['home2','house','Início'],['estacoes','clipboard-list','Estações'],['peps','list-checks','PEPs'],['desempenho2','chart-column','Dados']]:[['home','house','Jornada'],['trilha','route','Trilha'],['classificacao','trophy','Ranking'],['perfil','user','Perfil']];
  const side='min(52px,14vw)';const mid='min(56px,15vw)';
  const moreOn=phase===1&&!ON_BAR.includes(route)&&!ON_BAR.includes(GROUP[route]);
  return <>
  {more&&phase===1&&<MoreSheet route={route} go={go} info={info||{}} onClose={close}/>}
  <nav aria-label="Navegação principal" style={{position:'fixed',left:14,right:14,bottom:'calc(16px + env(safe-area-inset-bottom))',height:68,borderRadius:999,background:'var(--navy-900)',display:'flex',alignItems:'center',justifyContent:'space-around',padding:'0 8px',boxShadow:'0 18px 40px -12px rgba(13,28,66,.55)',zIndex:50}}>
    {it.map(([id,ic,l],i)=>{const on=route===id||GROUP[route]===id;return <React.Fragment key={id}>{phase===1&&i===2&&<button type="button" onClick={()=>go('questoes')} aria-label="Praticar" style={{width:mid,height:mid,border:0,borderRadius:'50%',background:'var(--teal-400)',color:'var(--navy-950)',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><Icon name="play" size={24}/></button>}<button type="button" onClick={()=>go(id)} aria-label={l} aria-current={on?'page':undefined} style={{width:phase===1?side:52,height:phase===1?side:52,border:0,borderRadius:'50%',background:on?'rgba(255,255,255,.1)':'transparent',color:on?'var(--teal-300)':'#93A8D3',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>{AppRealIcon({name:ic,size:26})||<Icon name={ic} size={22}/>}</button></React.Fragment>;})}
    {phase===1&&<button type="button" onClick={()=>setMore(m=>!m)} aria-label="Mais" aria-haspopup="dialog" aria-expanded={more} style={{width:side,height:side,border:0,borderRadius:'50%',background:more||moreOn?'rgba(255,255,255,.1)':'transparent',color:more||moreOn?'var(--teal-300)':'#93A8D3',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><Icon name="layout-grid" size={22}/></button>}
    {phase===2&&<button type="button" onClick={()=>go('paciente')} aria-label="Paciente simulado" style={{width:56,height:56,border:0,borderRadius:'50%',background:'var(--teal-400)',color:'var(--navy-950)',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><Icon name="sparkles" size={24}/></button>}
  </nav>
  </>;
}
// phase2Locked: a 2ª fase está "em breve" para o aluno (a equipe segue com acesso): opção apagada, sem clique e com "Em breve" até no celular,
// onde fica embaixo do nome (em linha o seletor passaria de 280 px e empurraria os ícones do canto para outra linha).
function PhaseSwitch({phase,setPhase,mobile,phase2Locked}){
  const o=[[1,'1ª Fase','Objetiva'],[2,'2ª Fase',phase2Locked?'Em breve':'Prática']];
  return <div role="radiogroup" aria-label="Fase do Revalida" style={{display:'inline-flex',padding:4,gap:4,borderRadius:14,background:'var(--surface-sunken)',border:'1px solid var(--border-subtle)'}}>
    {o.map(([v,l,d])=>{const lock=!!phase2Locked&&v===2;const stack=lock&&mobile;return <button key={v} type="button" role="radio" aria-checked={phase===v} disabled={lock} aria-disabled={lock?'true':undefined} onClick={lock?undefined:()=>setPhase(v)} style={{display:'flex',alignItems:'center',gap:8,height:40,padding:'0 14px',border:0,borderRadius:10,cursor:lock?'not-allowed':'pointer',background:phase===v?'var(--surface-card)':'transparent',boxShadow:phase===v?'var(--shadow-sm)':'none',color:lock?'var(--text-tertiary)':phase===v?'var(--text-primary)':'var(--text-secondary)',font:'600 14px var(--font-sans)'}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:phase===v?(v===1?'var(--teal-500)':'var(--violet-600)'):'var(--border-strong)'}}/>{stack?<span style={{display:'flex',flexDirection:'column',alignItems:'flex-start',lineHeight:1.15}}>{l}{' '}<span style={{font:'500 11px/1.2 var(--font-sans)'}}>{d}</span></span>:<>{l}{!mobile&&<span style={{fontWeight:500,color:'var(--text-tertiary)'}}>· {d}</span>}</>}</button>;})}
  </div>;
}
function Header({title,sub,theme,setTheme,go,mobile,phase,setPhase,phase2Locked,info}){
  return <header style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap'}}>
    <div style={{minWidth:0,display:'flex',flexDirection:'column',gap:14}}>{mobile&&<button type="button" onClick={()=>go(phase===2?'home2':'home')} aria-label="StaziaMed, início" style={{display:'flex',alignItems:'center',gap:10,border:0,background:'none',padding:0,cursor:'pointer'}}><img src={theme==='dark'?'/brand/horizontal-escuro-320w.png':'/brand/horizontal-320w.png'} alt="StaziaMed Revalida" width="129" height="40" style={{height:40,width:'auto',display:'block'}}/></button>}<PhaseSwitch phase={phase} setPhase={setPhase} mobile={mobile} phase2Locked={phase2Locked}/><div>{sub&&<div style={{font:'500 13px var(--font-sans)',color:'var(--text-tertiary)'}}>{sub}</div>}<h1 style={{margin:'4px 0 0',font:'700 '+(mobile?26:32)+'px/1.15 var(--font-sans)',letterSpacing:'-0.02em'}}>{title}</h1></div></div>
    <div style={{display:'flex',gap:8,alignItems:'center'}}>
      {!mobile&&<button type="button" className="sm-pill" onClick={()=>go('missoes')} title="Sequência de dias de estudo"><Icon name="flame" size={16} style={{color:'var(--streak)'}}/>{info.streakDays} {info.streakDays===1?'dia':'dias'}</button>}
      <IconButton icon={theme==='dark'?'sun':'moon'} label={theme==='dark'?'Tema claro':'Tema escuro'} variant="secondary" onClick={()=>setTheme(theme==='dark'?'light':'dark')}/>
      {mobile&&<button type="button" onClick={()=>go('perfil')} aria-label="Conta" style={{border:0,background:'none',padding:0,cursor:'pointer'}}><Avatar name={info.name} size={40}/></button>}
    </div>
  </header>;
}
function AppShell({route,go,theme,setTheme,title,sub,children,bare,phase=1,setPhase,phase2Locked=false,info}){
  const mobile=useMobile();const narrowRail=useNarrowRail();const [pref,setC]=React.useState(()=>localStorage.getItem('smf-col'));const collapsed=pref==null?narrowRail:pref==='1';const setCollapsed=v=>{const x=v?'1':'0';setC(x);localStorage.setItem('smf-col',x);};
  return <div style={{minHeight:'100vh',background:'var(--bg-app)'}}>
    {!mobile&&!FULL.includes(route)&&<Rail route={route} go={go} phase={phase} collapsed={collapsed} setCollapsed={setCollapsed} info={info} theme={theme}/>}
    <main style={{marginLeft:mobile||FULL.includes(route)?0:(collapsed?100:288),transition:'margin-left var(--dur-slow) var(--ease-standard)',padding:bare?0:(mobile?'24px 18px 112px':'36px 48px 128px')}}>
      {bare?children:<div style={{maxWidth:1200,margin:'0 auto',display:'flex',flexDirection:'column',gap:24}}>
        <Header title={title} sub={sub} theme={theme} setTheme={setTheme} go={go} mobile={mobile} phase={phase} setPhase={setPhase} phase2Locked={phase2Locked} info={info}/>{children}</div>}
    </main>
    {mobile?<MobileNav route={route} go={go} phase={phase} info={info}/>:<Dock go={go} route={route} phase={phase} info={info}/>}
  </div>;
}
export { AppShell, useMobile, useMQ };
