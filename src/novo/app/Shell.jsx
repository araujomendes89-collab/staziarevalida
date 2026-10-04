// Estrutura do app novo (menu lateral, cabeçalho, barra de atalhos, navegação mobile).
// Derivado de src/novo/prototype/AppShell.jsx: mesma marcação e estilos; os dados de
// demonstração (nome, contadores) foram trocados pelos dados reais recebidos em `info`.
import React from "react";
import { Icon, Avatar, IconButton } from "../ds";
import { RealIcon, RI_CSS } from "../prototype/RealIcons.jsx";
function useMQ(q){const [m,setM]=React.useState(()=>matchMedia(q).matches);React.useEffect(()=>{const mq=matchMedia(q);const f=()=>setM(mq.matches);mq.addEventListener('change',f);return ()=>mq.removeEventListener('change',f);},[q]);return m;}
function useMobile(){const q='(max-width: 860px)';const [m,setM]=React.useState(()=>matchMedia(q).matches);React.useEffect(()=>{const mq=matchMedia(q);const f=()=>setM(mq.matches);mq.addEventListener('change',f);return ()=>mq.removeEventListener('change',f);},[]);return m;}
const RAILS={1:[['home','house','Início'],['hoje','list-checks','Hoje'],['questoes','file-question','Questões'],['simulados','timer','Simulados'],['flash','layers','Revisar'],['plano','calendar-days','Plano'],['desempenho','chart-column','Dados'],['tutor','sparkles','Tutor']],2:[['home2','house','Início'],['teoria2','book-open','Teoria'],['estacoes','clipboard-list','Estações'],['dupla','users','Praticar'],['peps','list-checks','PEPs'],['paciente','message-circle-heart','Paciente IA'],['desempenho2','chart-column','Dados']]};
const GROUP={erros:'flash'};
const FULL=['sessao','estacao'];
const GROUPS={1:[['Menu',[['home','house','Início'],['hoje','list-checks','Plano de hoje'],['estudar','book-open','Estudar',null,[['aulas','Aulas'],['temas','Grandes Temas'],['materiais','Materiais oficiais']]],['questoes','file-question','Questões'],['simulados','timer','Simulados']]],['Revisar',[['flash','layers','Flashcards'],['erros','notebook-pen','Caderno de erros']]],['Análise',[['plano','calendar-days','Planejamento'],['desempenho','chart-column','Desempenho'],['tutor','sparkles','Tutor IA']]]],
2:[['Menu',[['home2','house','Início'],['teoria2','book-open','Teoria'],['estacoes','clipboard-list','Estações'],['dupla','users','Praticar'],['peps','list-checks','Meus PEPs']]],['Treino com IA',[['paciente','message-circle-heart','Paciente simulado']]],['Análise',[['desempenho2','chart-column','Desempenho']]]]};
function Rail({route,go,phase,collapsed,setCollapsed,info}){
  const badgeOf={flash:info.flashcardsDue||null};
  const G=GROUPS[phase];const W=collapsed?76:264;
  const [txt,setTxt]=React.useState(!collapsed);const [hov,setHov]=React.useState(false);
  React.useEffect(()=>{if(collapsed){setTxt(false);return;}const t=setTimeout(()=>setTxt(true),170);return ()=>clearTimeout(t);},[collapsed]);
  const sub=['aulas','temas','materiais'];const [openSub,setOpenSub]=React.useState(sub.includes(route));
  React.useEffect(()=>{if(sub.includes(route))setOpenSub(true);},[route]);
  const listRef=React.useRef(null);const [ind,setInd]=React.useState(null);
  const activeKey=collapsed&&sub.includes(route)?'estudar':route;
  React.useLayoutEffect(()=>{const el=listRef.current&&listRef.current.querySelector('[data-key="'+activeKey+'"]');if(!el){setInd(null);return;}const m=()=>{const L=listRef.current;if(!L)return;setInd({top:el.getBoundingClientRect().top-L.getBoundingClientRect().top+L.scrollTop,h:el.offsetHeight});};m();const t=setTimeout(m,340);return ()=>clearTimeout(t);},[activeKey,collapsed,openSub,txt,phase]);
  const fade={opacity:txt?1:0,transition:'opacity 180ms ease',whiteSpace:'nowrap'};
  const row=(key,ic,l,{badge,onClick,small,chev,open}={})=>{const on=key===activeKey;return <button key={key} data-key={key} type="button" onClick={onClick||(()=>go(key))} aria-current={on?'page':undefined} title={collapsed?l:undefined} aria-label={collapsed?l:undefined}
    className="smr-row" style={{position:'relative',zIndex:1,display:'flex',alignItems:'center',gap:12,width:'100%',height:small?36:40,flex:'none',padding:collapsed?0:(small?'0 16px 0 48px':'0 20px'),justifyContent:collapsed?'center':'flex-start',border:0,background:'transparent',color:on?'var(--action-on-primary)':'var(--text-secondary)',font:(on?'700':'500')+' '+(small?13.5:14)+'px var(--font-sans)',cursor:'pointer',transition:'color 250ms'}}>
    {!small&&<span className="smr-ic"><span className="o" style={{display:'inline-flex'}}><Icon name={ic} size={19}/></span><span className="c"><RealIcon name={ic}/></span></span>}
    {!collapsed&&<span style={{...fade,flex:1,textAlign:'left',overflow:'hidden'}}>{l}</span>}
    {chev&&!collapsed&&<Icon name="chevron-down" size={16} style={{...fade,transform:open?'rotate(180deg)':'none',transition:'transform 250ms,opacity 180ms'}}/>}
    {badge!=null&&(collapsed?<span style={{position:'absolute',top:8,right:18,width:8,height:8,borderRadius:'50%',background:on?'#fff':'var(--danger-solid)'}}/>:<span style={{...fade,minWidth:20,height:20,padding:'0 6px',borderRadius:999,background:on?'rgba(255,255,255,.25)':'var(--danger-solid)',color:'#fff',font:'700 11px/20px var(--font-sans)',textAlign:'center'}}>{badge}</span>)}
  </button>;};
  const label=t=><div style={{padding:collapsed?'14px 0 6px':'14px 20px 6px',textAlign:collapsed?'center':'left',fontWeight:700,fontSize:collapsed?8.5:10.5,fontFamily:'var(--font-sans)',lineHeight:1.2,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--text-tertiary)',whiteSpace:'nowrap',overflow:'hidden',transition:'font-size 250ms'}}>{t}</div>;
  return <nav aria-label="Navegação principal" onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{position:'fixed',left:16,top:16,bottom:16,width:W,zIndex:20,display:'flex',flexDirection:'column',borderRadius:24,background:'color-mix(in oklab,var(--surface-card) 88%,transparent)',backdropFilter:'blur(20px) saturate(1.4)',border:'1px solid var(--border-default)',boxShadow:'var(--shadow-lg)',transition:'width 380ms cubic-bezier(.4,0,.2,1)'}}>
    <style>{'.smr-row:hover:not([aria-current]){color:var(--text-primary)!important;background:var(--action-ghost-hover)!important}.smr-row:active .smr-ic{transform:scale(.9)}'+RI_CSS+'.smr-ic .o{opacity:0!important}.smr-ic .c{opacity:1!important;transform:none!important}.smr-row:hover .smr-ic .c{transform:scale(1.12)!important}'}</style>
    <div style={{display:'flex',alignItems:'center',gap:8,padding:collapsed?'18px 0 10px':'18px 16px 10px 20px',justifyContent:collapsed?'center':'space-between',minHeight:64}}>
      <button type="button" onClick={()=>go(phase===2?'home2':'home')} aria-label="StaziaMed, início" style={{border:0,background:'none',padding:0,cursor:'pointer',display:'flex'}}>{collapsed?<img src="/novo-assets/logo-mark.png" alt="" style={{height:30}}/>:<img src="/novo-assets/logo-horizontal.png" alt="" style={{height:40,...fade}}/>}</button>
      {!collapsed&&<span style={{...fade,position:'relative',display:'inline-flex',color:'var(--text-secondary)'}}><Icon name="bell" size={19}/></span>}
    </div>
    <div style={{position:'absolute',top:30,left:'calc(100% - 14px)',display:'flex',alignItems:'center',gap:6,zIndex:2}}>
      <button type="button" onClick={()=>setCollapsed(!collapsed)} aria-label={collapsed?'Expandir menu':'Recolher menu'} aria-expanded={!collapsed} style={{width:28,height:28,display:'inline-flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',border:'1px solid var(--border-default)',background:'var(--surface-card)',boxShadow:'var(--shadow-md)',color:'var(--text-primary)',cursor:'pointer'}}><Icon name={collapsed?'chevron-right':'chevron-left'} size={14}/></button>
      <span aria-hidden="true" style={{height:22,padding:'0 10px',borderRadius:999,background:'var(--action-primary)',color:'var(--action-on-primary)',font:'700 11px/22px var(--font-sans)',boxShadow:'var(--shadow-md)',opacity:hov?1:0,transform:hov?'translateX(0)':'translateX(-6px)',transition:'opacity 200ms,transform 200ms',pointerEvents:'none',whiteSpace:'nowrap'}}>{collapsed?'Expandir':'Recolher'}</span>
    </div>
    <button type="button" onClick={()=>go('perfil')} className="smr-row" style={{display:'flex',alignItems:'center',gap:10,margin:collapsed?'4px auto':'4px 12px',padding:collapsed?4:'8px 10px',borderRadius:16,border:'1px solid '+(collapsed?'transparent':'var(--border-subtle)'),background:collapsed?'transparent':'var(--surface-subtle)',cursor:'pointer',font:'inherit',color:'inherit',textAlign:'left',overflow:'hidden'}} aria-label={'Conta de '+info.name}>
      <Avatar name={info.name} size={36}/>{!collapsed&&<><span style={{...fade,flex:1,minWidth:0}}><span style={{display:'block',font:'600 14px var(--font-sans)'}}>{info.name}</span><span style={{display:'flex',alignItems:'center',gap:4,font:'500 11px var(--font-sans)',color:'var(--text-tertiary)'}}><Icon name="repeat" size={11}/>{phase===1?'1ª fase · objetiva':'2ª fase · prática'}</span></span><Icon name="chevron-right" size={16} style={{...fade,color:'var(--text-tertiary)'}}/></>}
    </button>
    <div style={{padding:collapsed?'8px 0':'8px 12px',display:'flex',justifyContent:'center'}}>{collapsed?<span title="Buscar" style={{width:40,height:36,borderRadius:12,display:'inline-flex',alignItems:'center',justifyContent:'center',color:'var(--text-tertiary)'}}><Icon name="search" size={18}/></span>:<label style={{...fade,flex:1,display:'flex',alignItems:'center',gap:8,height:38,padding:'0 12px',borderRadius:12,background:'var(--surface-sunken)',color:'var(--text-tertiary)'}}><Icon name="search" size={16}/><input aria-label="Buscar" placeholder="Buscar…" style={{flex:1,minWidth:0,border:0,background:'transparent',outline:'none',font:'500 13px var(--font-sans)',color:'var(--text-primary)'}}/><span style={{font:'600 10px var(--font-mono)',padding:'2px 5px',borderRadius:5,border:'1px solid var(--border-default)'}}>⌘K</span></label>}</div>
    <div ref={listRef} style={{position:'relative',flex:1,minHeight:0,overflowY:'auto',overflowX:'hidden',scrollbarWidth:'none',display:'flex',flexDirection:'column',paddingBottom:12}}>
      {ind&&<span aria-hidden="true" style={{position:'absolute',left:0,right:0,top:ind.top,height:ind.h,background:'var(--action-primary)',boxShadow:'0 6px 18px -6px color-mix(in oklab,var(--action-primary) 70%,transparent)',transition:'top 420ms cubic-bezier(.3,1.25,.5,1),height 300ms',zIndex:0}}/>}
      {G.map(([t,its])=><div key={t}>{label(t)}{its.map(([id,ic,l,bd,kids])=>kids?<div key={id}>{row(id,ic,l,{chev:true,open:openSub,onClick:()=>collapsed?go(kids[0][0]):setOpenSub(o=>!o)})}{openSub&&!collapsed&&<div style={{position:'relative'}}><span style={{position:'absolute',left:29,top:2,bottom:2,width:1,background:'var(--border-default)',zIndex:2}}/>{kids.map(([k,kl])=>row(k,null,kl,{small:true}))}</div>}</div>:row(id,ic,l,{badge:badgeOf[id]??null}))}</div>)}
      <div style={{flex:1}}/>
      <div>{label('Geral')}{info.isStaff?row('admin','users','Administração'):info.isReviewer&&row('admin','stamp','Revisão médica')}{row('perfil','settings','Ajustes')}{row('sair','log-out','Sair',{onClick:info.onSignOut})}</div>
    </div>
  </nav>;
}
function useNarrowRail(){const q='(max-width: 1200px)';const [m,setM]=React.useState(()=>matchMedia(q).matches);React.useEffect(()=>{const mq=matchMedia(q);const f=()=>setM(mq.matches);mq.addEventListener('change',f);return ()=>mq.removeEventListener('change',f);},[]);return m;}
function useNarrow(){const q='(max-width: 1180px)';const [m,setM]=React.useState(()=>matchMedia(q).matches);React.useEffect(()=>{const mq=matchMedia(q);const f=()=>setM(mq.matches);mq.addEventListener('change',f);return ()=>mq.removeEventListener('change',f);},[]);return m;}
function Dock({go,route,phase,info}){
  const narrow=useNarrow();
  if(FULL.includes(route))return null;
  const it=phase===2?[['estacao','play','Treinar estação'],['dupla','users','Praticar'],['peps','list-checks','PEPs']]:[['questoes','file-question','Questões'],['flash','layers','Flashcards',info.flashcardsDue?String(info.flashcardsDue):null],['simulados','timer','Simulado']];
  return <div role="toolbar" aria-label="Ações rápidas" style={{position:'fixed',left:0,right:0,marginLeft:'auto',marginRight:'auto',width:'max-content',maxWidth:'calc(100vw - 32px)',bottom:24,display:'flex',whiteSpace:'nowrap',alignItems:'center',gap:2,padding:6,borderRadius:999,background:'var(--navy-900)',boxShadow:'0 18px 40px -12px rgba(13,28,66,.55)',zIndex:30}}>
    {it.map(([id,ic,l,c])=><button key={id} type="button" onClick={()=>go(id)} aria-label={l} title={l} style={{flex:'none',display:'flex',alignItems:'center',gap:8,height:44,padding:narrow?'0 13px':'0 16px',whiteSpace:'nowrap',border:0,borderRadius:999,background:'transparent',color:'#E2E9F5',font:'600 14px var(--font-sans)',cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.1)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>{RealIcon({name:ic,size:22})||<Icon name={ic} size={18}/>}{!narrow&&l}{c&&<span style={{font:'600 11px var(--font-mono)',background:'rgba(255,255,255,.16)',padding:'2px 7px',borderRadius:9}}>{c}</span>}</button>)}
    <span style={{width:1,height:24,background:'rgba(255,255,255,.18)',margin:'0 4px'}}/>
    <button type="button" onClick={()=>go(phase===2?'paciente':'tutor')} style={{flex:'none',display:'flex',alignItems:'center',gap:8,height:44,padding:'0 18px',whiteSpace:'nowrap',border:0,borderRadius:999,background:'var(--teal-400)',color:'var(--navy-950)',font:'700 14px var(--font-sans)',cursor:'pointer'}}>{RealIcon({name:'sparkles',size:22})}{phase===2?'Paciente simulado':'Perguntar ao tutor'}</button>
  </div>;
}
function MobileNav({route,go,phase}){
  if(FULL.includes(route))return null;
  const it=phase===2?[['home2','house','Início'],['estacoes','clipboard-list','Estações'],['peps','list-checks','PEPs'],['desempenho2','chart-column','Dados']]:[['home','house','Início'],['questoes','file-question','Treinar'],['flash','layers','Revisar'],['desempenho','chart-column','Dados']];
  return <nav aria-label="Navegação principal" style={{position:'fixed',left:14,right:14,bottom:'calc(16px + env(safe-area-inset-bottom))',height:68,borderRadius:999,background:'var(--navy-900)',display:'flex',alignItems:'center',justifyContent:'space-around',padding:'0 8px',boxShadow:'0 18px 40px -12px rgba(13,28,66,.55)',zIndex:30}}>
    {it.map(([id,ic,l])=>{const on=route===id||GROUP[route]===id;return <button key={id} type="button" onClick={()=>go(id)} aria-label={l} aria-current={on?'page':undefined} style={{width:52,height:52,border:0,borderRadius:'50%',background:on?'rgba(255,255,255,.1)':'transparent',color:on?'var(--teal-300)':'#93A8D3',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>{RealIcon({name:ic,size:26})||<Icon name={ic} size={22}/>}</button>;})}
    <button type="button" onClick={()=>go(phase===2?'paciente':'tutor')} aria-label="Tutor IA" style={{width:56,height:56,border:0,borderRadius:'50%',background:'var(--teal-400)',color:'var(--navy-950)',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><Icon name="sparkles" size={24}/></button>
  </nav>;
}
function PhaseSwitch({phase,setPhase,mobile}){
  const o=[[1,'1ª Fase','Objetiva'],[2,'2ª Fase','Prática']];
  return <div role="radiogroup" aria-label="Fase do Revalida" style={{display:'inline-flex',padding:4,gap:4,borderRadius:14,background:'var(--surface-sunken)',border:'1px solid var(--border-subtle)'}}>
    {o.map(([v,l,d])=><button key={v} type="button" role="radio" aria-checked={phase===v} onClick={()=>setPhase(v)} style={{display:'flex',alignItems:'center',gap:8,height:40,padding:'0 14px',border:0,borderRadius:10,cursor:'pointer',background:phase===v?'var(--surface-card)':'transparent',boxShadow:phase===v?'var(--shadow-sm)':'none',color:phase===v?'var(--text-primary)':'var(--text-secondary)',font:'600 14px var(--font-sans)'}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:phase===v?(v===1?'var(--teal-500)':'var(--violet-600)'):'var(--border-strong)'}}/>{l}{!mobile&&<span style={{fontWeight:500,color:'var(--text-tertiary)'}}>· {d}</span>}</button>)}
  </div>;
}
function Header({title,sub,theme,setTheme,go,mobile,phase,setPhase,info}){
  return <header style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap'}}>
    <div style={{minWidth:0,display:'flex',flexDirection:'column',gap:14}}>{mobile&&<button type="button" onClick={()=>go(phase===2?'home2':'home')} aria-label="StaziaMed, início" style={{display:'flex',alignItems:'center',gap:10,border:0,background:'none',padding:0,cursor:'pointer'}}><img src="/novo-assets/logo-mark.png" alt="" style={{height:32}}/><span style={{font:'800 20px var(--font-sans)',letterSpacing:'-0.02em',color:'var(--text-primary)'}}>Stazia<span style={{color:'var(--text-brand)'}}>Med</span></span></button>}<PhaseSwitch phase={phase} setPhase={setPhase} mobile={mobile}/><div>{sub&&<div style={{font:'500 13px var(--font-sans)',color:'var(--text-tertiary)'}}>{sub}</div>}<h1 style={{margin:'4px 0 0',font:'700 '+(mobile?26:32)+'px/1.15 var(--font-sans)',letterSpacing:'-0.02em'}}>{title}</h1></div></div>
    <div style={{display:'flex',gap:8,alignItems:'center'}}>
      {!mobile&&<span className="sm-pill"><Icon name="flame" size={16} style={{color:'var(--streak)'}}/>{info.streakDays} {info.streakDays===1?'dia':'dias'}</span>}
      <IconButton icon={theme==='dark'?'sun':'moon'} label={theme==='dark'?'Tema claro':'Tema escuro'} variant="secondary" onClick={()=>setTheme(theme==='dark'?'light':'dark')}/>
      <IconButton icon="bell" label="Alertas" variant="secondary"/>
      {mobile&&<button type="button" onClick={()=>go('perfil')} aria-label="Conta" style={{border:0,background:'none',padding:0,cursor:'pointer'}}><Avatar name={info.name} size={40}/></button>}
    </div>
  </header>;
}
function AppShell({route,go,theme,setTheme,title,sub,children,bare,phase=1,setPhase,info}){
  const mobile=useMobile();const narrowRail=useNarrowRail();const [pref,setC]=React.useState(()=>localStorage.getItem('smf-col'));const collapsed=pref==null?narrowRail:pref==='1';const setCollapsed=v=>{const x=v?'1':'0';setC(x);localStorage.setItem('smf-col',x);};
  return <div style={{minHeight:'100vh',background:'var(--bg-app)'}}>
    {!mobile&&!FULL.includes(route)&&<Rail route={route} go={go} phase={phase} collapsed={collapsed} setCollapsed={setCollapsed} info={info}/>}
    <main style={{marginLeft:mobile||FULL.includes(route)?0:(collapsed?100:288),transition:'margin-left var(--dur-slow) var(--ease-standard)',padding:bare?0:(mobile?'24px 18px 112px':'36px 48px 128px')}}>
      {bare?children:<div style={{maxWidth:1200,margin:'0 auto',display:'flex',flexDirection:'column',gap:24}}>
        <Header title={title} sub={sub} theme={theme} setTheme={setTheme} go={go} mobile={mobile} phase={phase} setPhase={setPhase} info={info}/>{children}</div>}
    </main>
    {mobile?<MobileNav route={route} go={go} phase={phase}/>:<Dock go={go} route={route} phase={phase} info={info}/>}
  </div>;
}
export { AppShell, useMobile, useMQ };
