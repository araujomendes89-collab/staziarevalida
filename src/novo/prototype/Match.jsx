// Gerado por scripts/design-system/port-prototype.mjs a partir de "app/Match.jsx". Não editar à mão.
import React from "react";
import { Card, Button, Badge, Icon, Avatar, Switch, TextField, SegmentedControl, Chip, IconButton } from "../ds";
import { IconTile } from "./RealIcons.jsx";
import { useMobile } from "./AppShell.jsx";
const R={borderRadius:24};
const PEOPLE=[
 {n:'Gabriela Carlyle',f:'UFPR · Paraná',ed:'2026/2',meta:'Treinar GO e Pediatria',av:'Noites · seg a qui',role:'Médica ou atriz',areas:['GO','Pediatria'],est:14,pep:7.8,match:92,bio:'Formada na Bolívia, estudando há 6 meses. Prefiro treinar por vídeo, 3 estações por sessão.'},
 {n:'Diego Monteiro',f:'UERJ · Rio de Janeiro',ed:'2026/2',meta:'Melhorar comunicação',av:'Manhãs · fim de semana',role:'Ator / avaliador',areas:['MFC','Clínica'],est:22,pep:8.3,match:87,bio:'Já fiz a 1ª fase. Topo ser ator primeiro e trocar de papel na rodada seguinte.'},
 {n:'Gabriel Torres',f:'UBA · Argentina',ed:'2027/1',meta:'Começando a 2ª fase',av:'Tardes · ter e qui',role:'Médico',areas:['Cirurgia','Clínica'],est:3,pep:6.1,match:74,bio:'Primeiras estações. Quero alguém com paciência para treinar ATLS e dor torácica.'},
];
const ONLINE=[['Danielle Dias','USP · São Paulo',96,'Livre'],['Diego Monteiro','UERJ · Rio de Janeiro',87,'Livre'],['Gabriel Oliveira','UFMG · Minas Gerais',81,'Em estação'],['Hayla Drika','UNIFESP · São Paulo',78,'Livre'],['Gabriela Carlyle','UFPR · Paraná',92,'Livre']];
const ATORES=[['Dra. Marina Costa','Atriz e avaliadora · 340 sessões',4.9,'R$ 45 / sessão'],['Dr. Paulo Reis','Ex-avaliador de estações · 210 sessões',4.8,'R$ 60 / sessão']];
const SALAS=[['Maratona GO · 5 estações','3/4 vagas','Começa em 12 min'],['Clínica médica: dor torácica','1/2 vagas','Agora']];
function SwipeCard({p,onPass,onLike,onSuper}){
  const [dx,setDx]=React.useState(0);const [drag,setDrag]=React.useState(null);
  const up=()=>{if(dx>110)onLike();else if(dx<-110)onPass();setDx(0);setDrag(null);};
  return <div onPointerDown={e=>{setDrag(e.clientX);e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>drag!=null&&setDx(e.clientX-drag)} onPointerUp={up} onPointerCancel={up}
    style={{position:'relative',touchAction:'pan-y',cursor:drag!=null?'grabbing':'grab',transform:'translateX('+dx+'px) rotate('+(dx/22)+'deg)',transition:drag!=null?'none':'transform var(--dur-slow) var(--ease-standard)',userSelect:'none'}}>
    <div className="sm-card" style={{borderRadius:28,overflow:'hidden',boxShadow:'var(--shadow-lg)'}}>
      <div style={{height:200,background:'linear-gradient(160deg,var(--teal-100),var(--navy-100))',position:'relative',display:'flex',alignItems:'flex-end',padding:20}}>
        <Avatar name={p.n} size={96} style={{boxShadow:'0 0 0 4px var(--surface-card)'}}/>
        <span style={{position:'absolute',top:16,right:16,display:'inline-flex',alignItems:'center',gap:6,height:32,padding:'0 12px',borderRadius:999,background:'var(--surface-card)',font:'700 14px var(--font-sans)',color:'var(--text-brand)',boxShadow:'var(--shadow-sm)'}}><Icon name="sparkles" size={15}/>{p.match}% compatível</span>
        <span style={{position:'absolute',top:16,left:16,display:'inline-flex',alignItems:'center',gap:6,height:28,padding:'0 10px',borderRadius:999,background:'var(--success-bg)',color:'var(--success-text)',font:'600 12px var(--font-sans)'}}><span style={{width:7,height:7,borderRadius:'50%',background:'var(--success-solid)'}}/>online</span>
        {dx>40&&<span style={{position:'absolute',top:60,left:20,padding:'6px 14px',borderRadius:10,border:'3px solid var(--success-solid)',color:'var(--success-text)',font:'800 20px var(--font-sans)',transform:'rotate(-12deg)',background:'var(--surface-card)'}}>ESTUDAR</span>}
        {dx<-40&&<span style={{position:'absolute',top:60,right:20,padding:'6px 14px',borderRadius:10,border:'3px solid var(--danger-solid)',color:'var(--danger-text)',font:'800 20px var(--font-sans)',transform:'rotate(12deg)',background:'var(--surface-card)'}}>PULAR</span>}
      </div>
      <div style={{padding:24,display:'flex',flexDirection:'column',gap:14}}>
        <div><div style={{font:'700 24px/1.2 var(--font-sans)',letterSpacing:'-0.015em'}}>{p.n}</div><div style={{font:'var(--type-body-sm)',color:'var(--text-secondary)'}}>{p.f} · Revalida {p.ed}</div></div>
        <p style={{margin:0,font:'var(--type-body)',color:'var(--text-primary)',textWrap:'pretty'}}>{p.bio}</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>{[['target','Objetivo',p.meta],['clock','Disponível',p.av],['user-round-cog','Papel',p.role],['list-checks','Estações',p.est+' feitas · PEP '+String(p.pep).replace('.',',')]].map(([ic,l,v])=><div key={l} style={{padding:12,borderRadius:14,background:'var(--surface-subtle)'}}><div style={{display:'flex',gap:6,alignItems:'center',font:'500 12px var(--font-sans)',color:'var(--text-tertiary)'}}><Icon name={ic} size={14}/>{l}</div><div style={{font:'600 14px/1.35 var(--font-sans)',marginTop:4}}>{v}</div></div>)}</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{p.areas.map(a=><Badge key={a} tone="ai" size="sm">{a}</Badge>)}</div>
      </div>
    </div>
  </div>;
}
function MatchModal({p,onClose,go}){return <div role="dialog" aria-modal="true" aria-label="Deu match" style={{position:'fixed',inset:0,zIndex:60,background:'var(--surface-overlay)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
  <div className="sm-card" style={{maxWidth:420,width:'100%',borderRadius:28,padding:32,textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:14,boxShadow:'var(--shadow-lg)'}}>
    <div style={{display:'flex',alignItems:'center'}}><Avatar name="Joao Paulo" size={72} style={{boxShadow:'0 0 0 4px var(--surface-card)'}}/><IconTile name="handshake" size={44} bg="var(--action-primary)" radius={22}/><Avatar name={p.n} size={72} style={{boxShadow:'0 0 0 4px var(--surface-card)'}}/></div>
    <h2 style={{margin:'6px 0 0',font:'800 30px/1.1 var(--font-sans)',letterSpacing:'-0.02em'}}>Deu match!</h2>
    <p style={{margin:0,color:'var(--text-secondary)'}}>Você e {p.n.split(' ')[0]} querem treinar a 2ª fase. Combinem a primeira sessão.</p>
    <div style={{width:'100%',display:'flex',flexDirection:'column',gap:8,marginTop:8}}><Button size="lg" fullWidth icon="video" onClick={()=>go('estacao')}>Abrir sala agora</Button><Button variant="secondary" fullWidth icon="calendar-plus">Agendar sessão</Button><Button variant="ghost" fullWidth icon="message-circle">Enviar mensagem</Button></div>
    <Button variant="link" size="sm" onClick={onClose}>Continuar buscando</Button>
  </div></div>;}
function Pair({go}){
  const mobile=useMobile();
  const [i,setI]=React.useState(0);const [matched,setMatched]=React.useState(null);const [matches,setMatches]=React.useState([]);
  const [radar,setRadar]=React.useState(true);const [inv,setInv]=React.useState(true);const [tab,setTab]=React.useState('col');const [role,setRole]=React.useState('ambos');
  const p=PEOPLE[i%PEOPLE.length];
  const next=()=>setI(x=>x+1);
  const like=()=>{if(p.match>=80){setMatched(p);setMatches(m=>m.includes(p.n)?m:[...m,p.n]);}next();};
  return <>
    <div style={{display:'grid',gridTemplateColumns:mobile?'1fr':'minmax(0,1fr) minmax(0,1fr)',gap:24,alignItems:'start'}}>
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <Card style={R} padding={20}><div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><div style={{font:'600 17px var(--font-sans)'}}>Encontrar dupla</div><div style={{font:'var(--type-body-sm)',color:'var(--text-secondary)'}}>Arraste para a direita para estudar junto, para a esquerda para pular.</div></div>{matches.length>0&&<Badge tone="success" icon="handshake">{matches.length} match{matches.length>1?'es':''}</Badge>}</div>
          <SegmentedControl fullWidth label="Papel que procuro" value={role} onChange={setRole} options={[{value:'ambos',label:'Qualquer papel'},{value:'medico',label:'Quero ser médico'},{value:'ator',label:'Quero ser ator'}]}/>
        </div></Card>
        <SwipeCard key={i} p={p} onPass={next} onLike={like}/>
        <div role="group" aria-label="Decidir" style={{display:'flex',justifyContent:'center',alignItems:'center',gap:18,padding:'4px 0'}}>
          <button type="button" aria-label="Pular" onClick={next} style={{width:60,height:60,borderRadius:'50%',border:'1px solid var(--border-default)',background:'var(--surface-card)',color:'var(--danger-text)',boxShadow:'var(--shadow-md)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><Icon name="x" size={26}/></button>
          <button type="button" aria-label="Convite prioritário" onClick={()=>{setMatched(p);setMatches(m=>[...m,p.n]);next();}} style={{width:48,height:48,borderRadius:'50%',border:'1px solid var(--border-default)',background:'var(--surface-card)',color:'var(--ai-text)',boxShadow:'var(--shadow-md)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><Icon name="zap" size={20}/></button>
          <button type="button" aria-label="Quero estudar junto" onClick={like} style={{width:72,height:72,borderRadius:'50%',border:0,background:'var(--action-primary)',color:'#fff',boxShadow:'var(--shadow-brand)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><Icon name="handshake" size={30}/></button>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <Card style={R} padding={22}><div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{display:'flex',gap:14,alignItems:'center'}}><span style={{position:'relative',width:48,height:48,flex:'none',borderRadius:'50%',background:radar?'var(--surface-brand-soft)':'var(--surface-sunken)',color:radar?'var(--text-brand)':'var(--text-tertiary)',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><Icon name="radar" size={24}/>{radar&&<span style={{position:'absolute',inset:-4,borderRadius:'50%',border:'2px solid var(--teal-300)',opacity:.5}}/>}</span>
            <div style={{flex:1}}><Switch label="Busca automática de duplas" description={radar?'Você está visível no radar · 11 colegas compatíveis online':'Pausada · ninguém encontra você'} checked={radar} onChange={()=>setRadar(r=>!r)}/></div></div>
          <div style={{paddingTop:14,borderTop:'1px solid var(--border-subtle)'}}><Switch label="Permitir convites diretos" description="Colegas podem chamar você para uma estação" checked={inv} onChange={()=>setInv(v=>!v)}/></div>
        </div></Card>
        <Card style={R} padding={20}><div style={{display:'flex',flexDirection:'column',gap:14}}>
          <SegmentedControl fullWidth label="Lista" value={tab} onChange={setTab} options={[{value:'col',label:'Online'},{value:'ator',label:'Atores'},{value:'sala',label:'Salas abertas'}]}/>
          {tab==='col'&&<><TextField icon="search" aria-label="Buscar colega" placeholder="Buscar por nome, faculdade ou tema"/>
            <div style={{display:'flex',justifyContent:'space-between',font:'var(--type-caption)',color:'var(--text-tertiary)'}}><span>11 colegas online</span><span style={{display:'flex',gap:6,alignItems:'center'}}><span style={{width:7,height:7,borderRadius:'50%',background:'var(--success-solid)'}}/>Tempo real</span></div>
            <div style={{display:'flex',flexDirection:'column'}}>{ONLINE.map(([n,f,m,s],k)=><div key={n} style={{display:'flex',gap:12,alignItems:'center',padding:'12px 0',borderTop:k?'1px solid var(--border-subtle)':0}}>
              <span style={{position:'relative'}}><Avatar name={n} size={42}/><span style={{position:'absolute',right:0,bottom:0,width:12,height:12,borderRadius:'50%',background:s==='Livre'?'var(--success-solid)':'var(--warning-solid)',boxShadow:'0 0 0 2px var(--surface-card)'}}/></span>
              <div style={{flex:1,minWidth:0}}><div style={{font:'600 15px var(--font-sans)'}}>{n}</div><div style={{font:'var(--type-caption)',color:'var(--text-secondary)'}}>{f} · <span style={{color:s==='Livre'?'var(--success-text)':'var(--warning-text)'}}>{s==='Livre'?'livre agora':'em estação'}</span></div></div>
              <span style={{font:'600 12px var(--font-mono)',color:'var(--text-brand)'}}>{m}%</span>
              <Button size="sm" variant={s==='Livre'?'primary':'secondary'} icon="send" disabled={s!=='Livre'} onClick={()=>setMatched({n})}>Convidar</Button></div>)}</div></>}
          {tab==='ator'&&ATORES.map(([n,d,r,pr])=><div key={n} style={{display:'flex',gap:12,alignItems:'center',padding:'12px 0'}}><Avatar name={n.replace('Dra. ','').replace('Dr. ','')} size={44}/><div style={{flex:1,minWidth:0}}><div style={{font:'600 15px var(--font-sans)'}}>{n}</div><div style={{font:'var(--type-caption)',color:'var(--text-secondary)'}}>{d}</div><div style={{display:'flex',gap:4,alignItems:'center',font:'600 12px var(--font-sans)',color:'var(--warning-text)',marginTop:2}}><Icon name="star" size={13}/>{String(r).replace('.',',')}</div></div><div style={{textAlign:'right'}}><div style={{font:'600 13px var(--font-sans)'}}>{pr}</div><Button size="sm" variant="secondary" style={{marginTop:6}}>Agendar</Button></div></div>)}
          {tab==='sala'&&SALAS.map(([t,v,q])=><div key={t} className="sm-row" style={{padding:14}}><Icon name="door-open" size={20} style={{color:'var(--text-brand)'}}/><div style={{flex:1}}><div style={{font:'600 15px var(--font-sans)'}}>{t}</div><div style={{font:'var(--type-caption)',color:'var(--text-secondary)'}}>{v} · {q}</div></div><Button size="sm" onClick={()=>go('estacao')}>Entrar</Button></div>)}
        </div></Card>
        <Card style={R} padding={18}><div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><IconTile name="message-circle" size={40} bg="var(--success-bg)"/><div style={{flex:'1 1 200px'}}><div style={{font:'600 15px var(--font-sans)'}}>Grupo de duplas no WhatsApp</div><div style={{font:'var(--type-caption)',color:'var(--text-secondary)'}}>Para combinar treinos fora da plataforma</div></div><Button size="sm" variant="secondary" icon="external-link">Entrar no grupo</Button></div></Card>
      </div>
    </div>
    {matched&&<MatchModal p={matched} go={go} onClose={()=>setMatched(null)}/>}
  </>;
}
export { Pair };
