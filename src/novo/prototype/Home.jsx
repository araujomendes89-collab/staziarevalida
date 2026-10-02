// Gerado por scripts/design-system/port-prototype.mjs a partir de "app/Home.jsx". Não editar à mão.
import React from "react";
import { Card, Button, Badge, Icon, ProgressBar, TopicRow, Banner, EmptyState } from "../ds";
import { Temas } from "./Study1.jsx";
const AREAS=[['Clínica Médica',72,'--area-clinica'],['Cirurgia Geral',64,'--area-cirurgia'],['Ginecologia e Obstetrícia',48,'--area-go'],['Pediatria',70,'--area-pediatria'],['Preventiva / MFC',81,'--area-preventiva']];
const R={borderRadius:24};
function Spark({v}){return <div style={{display:'flex',alignItems:'flex-end',gap:4,height:52}} aria-hidden="true">{v.map((h,k)=><span key={k} style={{width:8,height:Math.max(6,h*.7),borderRadius:4,background:k===v.length-1?'var(--action-primary)':'var(--teal-200)',opacity:k===v.length-1?1:.6}}/>)}</div>;}
function Metric({l,v,s,ok,b}){return <Card style={R}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:12}}><div><div style={{font:'500 13px var(--font-sans)',color:'var(--text-tertiary)'}}>{l}</div><div style={{font:'700 38px/1.1 var(--font-sans)',letterSpacing:'-0.02em',marginTop:8}}>{v}</div><div style={{font:'600 13px var(--font-sans)',color:ok?'var(--success-text)':'var(--text-secondary)',marginTop:4}}>{s}</div></div><Spark v={b}/></div></Card>;}
function NextStep({go,mobile}){return <Card style={{...R,display:'flex',flexDirection:'column',gap:20}} padding={mobile?22:32}>
  <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><span className="sm-overline">Próximo passo</span><Badge tone="brand" size="sm">Recomendado pelo plano</Badge></div>
  <div><h2 style={{margin:0,font:'700 '+(mobile?22:28)+'px/1.2 var(--font-sans)',letterSpacing:'-0.015em'}}>Pré-eclâmpsia e síndrome HELLP</h2><p style={{margin:'8px 0 0',color:'var(--text-secondary)',textWrap:'pretty'}}>20 questões oficiais · Ginecologia e Obstetrícia · ~40 min. Seu domínio aqui é 35%, o menor entre os temas de maior peso.</p></div>
  <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><Button size="lg" iconRight="arrow-right" onClick={()=>go('sessao')}>Continuar sessão</Button><Button variant="ghost" onClick={()=>go('questoes')}>Trocar tema</Button><span style={{flex:1}}/><div style={{minWidth:180,flex:mobile?'1 1 100%':'none'}}><ProgressBar value={8} max={20} height={6} valueLabel="8 de 20" label="Respondidas"/></div></div>
</Card>;}
function TodayList({go}){const [d,setD]=React.useState([true,false,false]);const it=[['Estudar · 30 min','Microcompetências de clínica'],['Praticar · 40 min','20 questões de GO'],['Revisar · 10 min','5 flashcards agendados']];
  return <Card style={R} padding={28}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span className="sm-overline" style={{color:'var(--text-secondary)'}}>Plano de hoje</span><span style={{font:'600 13px var(--font-mono)',color:'var(--text-secondary)'}}>{d.filter(Boolean).length}/3</span></div>
  {it.map(([k,t],i)=><button key={i} type="button" role="checkbox" aria-checked={d[i]} onClick={()=>setD(x=>x.map((v,j)=>j===i?!v:v))} style={{display:'flex',gap:14,alignItems:'center',width:'100%',padding:'14px 0',marginTop:i?0:12,border:0,borderTop:'1px solid var(--border-subtle)',background:'none',textAlign:'left',cursor:'pointer',color:'inherit',font:'inherit'}}>
    <span style={{width:26,height:26,borderRadius:'50%',flex:'none',display:'inline-flex',alignItems:'center',justifyContent:'center',background:d[i]?'var(--action-primary)':'transparent',border:d[i]?0:'1.5px solid var(--border-strong)',color:'var(--action-on-primary)',transition:'all var(--dur-fast)'}}>{d[i]&&<Icon name="check" size={14}/>}</span>
    <span><span style={{display:'block',font:'500 12px var(--font-sans)',color:'var(--text-tertiary)'}}>{k}</span><span style={{display:'block',font:'600 15px var(--font-sans)',marginTop:2,textDecoration:d[i]?'line-through':'none',color:d[i]?'var(--text-tertiary)':'var(--text-primary)'}}>{t}</span></span></button>)}
  <Button variant="link" iconRight="chevron-right" onClick={()=>go('hoje')} style={{marginTop:8}}>Abrir plano completo</Button></Card>;}
function HomeActive({go,mobile}){
  const [d,setD]=React.useState([true,false,false]);
  const steps=[['Estudar','Microcompetências de clínica','30 min','aulas'],['Praticar','20 questões de GO','40 min','sessao'],['Revisar','5 flashcards','10 min','flash']];
  const n=d.filter(Boolean).length;
  return <>
    <Card style={{borderRadius:28}} padding={mobile?24:36}><div style={{display:'flex',flexDirection:'column',gap:mobile?24:32}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:24,flexWrap:'wrap'}}>
        <div style={{flex:'1 1 360px',minWidth:0}}>
          <span className="sm-overline">Próximo passo</span>
          <h2 style={{margin:'10px 0 8px',font:'700 '+(mobile?24:30)+'px/1.2 var(--font-sans)',letterSpacing:'-0.02em'}}>Pré-eclâmpsia e síndrome HELLP</h2>
          <p style={{margin:0,color:'var(--text-secondary)',maxWidth:520}}>Seu tema mais fraco entre os de maior peso no INEP. 12 questões restantes da sessão.</p>
        </div>
        <Button size="lg" iconRight="arrow-right" onClick={()=>go('sessao')}>Continuar</Button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:mobile?'1fr':'repeat(3,1fr)',gap:mobile?8:12}}>
        {steps.map(([k,t,m,r],i)=><div key={k} style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',borderRadius:16,background:d[i]?'var(--surface-subtle)':'var(--surface-card)',border:'1px solid var(--border-subtle)'}}>
          <button type="button" role="checkbox" aria-checked={d[i]} aria-label={'Concluir '+k} onClick={()=>setD(x=>x.map((v,j)=>j===i?!v:v))} style={{width:24,height:24,flex:'none',borderRadius:'50%',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',background:d[i]?'var(--action-primary)':'transparent',border:d[i]?0:'1.5px solid var(--border-strong)',color:'var(--action-on-primary)'}}>{d[i]&&<Icon name="check" size={13}/>}</button>
          <button type="button" onClick={()=>go(r)} style={{flex:1,minWidth:0,border:0,background:'none',padding:0,textAlign:'left',cursor:'pointer',font:'inherit',color:'inherit'}}><span style={{display:'block',font:'500 12px var(--font-sans)',color:'var(--text-tertiary)'}}>{k} · {m}</span><span style={{display:'block',font:'600 14px var(--font-sans)',marginTop:2,textDecoration:d[i]?'line-through':'none',color:d[i]?'var(--text-tertiary)':'var(--text-primary)'}}>{t}</span></button>
        </div>)}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:12,font:'var(--type-caption)',color:'var(--text-tertiary)'}}><span>Plano de hoje · {n} de 3</span><div style={{flex:1,maxWidth:200,height:4,borderRadius:9,background:'var(--chart-track)'}}><div style={{width:(n/3*100)+'%',height:'100%',borderRadius:9,background:'var(--action-primary)',transition:'width var(--dur-slow)'}}/></div></div>
    </div></Card>
    <div style={{display:'grid',gridTemplateColumns:mobile?'1fr 1fr':'repeat(3,1fr)',gap:mobile?12:20}}>
      {[['Acurácia','68%','+4 pts na semana',true,'desempenho'],['Itens na semana','320','14% acima dos aprovados',true,'desempenho'],['Retenção','82%','48 cards consolidados',false,'flash']].map(([l,v,c,ok,r])=><button key={l} type="button" onClick={()=>go(r)} className="sm-card sm-card--interactive" style={{borderRadius:24,padding:mobile?18:24,textAlign:'left',font:'inherit',color:'inherit',cursor:'pointer'}}>
        <div style={{font:'500 13px var(--font-sans)',color:'var(--text-tertiary)'}}>{l}</div>
        <div style={{font:'700 '+(mobile?28:34)+'px/1.1 var(--font-sans)',letterSpacing:'-0.02em',marginTop:8}}>{v}</div>
        <div style={{font:'600 13px var(--font-sans)',color:ok?'var(--success-text)':'var(--text-secondary)',marginTop:4}}>{c}</div>
      </button>)}
    </div>
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><h3 style={{margin:0,font:'600 17px var(--font-sans)'}}>Temas prioritários</h3><Button variant="link" iconRight="chevron-right" onClick={()=>go('questoes')}>Ver todos</Button></div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <TopicRow status="pendente" area="Ginecologia e Obstetrícia" title="Pré-eclâmpsia e síndrome HELLP" questions={28} cards={16} mastery={35} onClick={()=>go('sessao')}/>
        <TopicRow status="iniciado" area="Clínica Médica" title="Síndrome coronariana aguda" questions={34} cards={22} mastery={52} onClick={()=>go('sessao')}/>
      </div>
    </div>
  </>;}
function HomeNew({go,mobile}){return <>
  <Banner tone="warning" title="Seu teste gratuito termina hoje" action={<Button size="sm" variant="secondary" onClick={()=>go('planos')}>Ver planos</Button>}>Você resolveu 0 de 100 questões da cota do período de avaliação.</Banner>
  <div style={{display:'grid',gridTemplateColumns:mobile?'1fr':'minmax(0,1.55fr) minmax(0,1fr)',gap:20}}>
    <div style={{padding:mobile?24:36,borderRadius:24,background:'var(--navy-900)',color:'#fff',display:'flex',flexDirection:'column',gap:14}}>
      <span className="sm-overline" style={{color:'var(--teal-300)'}}>Comece aqui</span><h2 style={{margin:0,font:'700 '+(mobile?24:30)+'px/1.2 var(--font-sans)',letterSpacing:'-0.015em',color:'#fff'}}>Faça o diagnóstico inicial</h2>
      <p style={{margin:0,color:'var(--navy-200)',maxWidth:480}}>10 questões oficiais, cerca de 15 minutos. Com elas montamos seu plano nas 5 grandes áreas do Revalida.</p>
      <div><button type="button" className="sm-btn sm-btn--lg" onClick={()=>go('sessao')} style={{background:'var(--teal-400)',color:'var(--navy-950)',marginTop:8}}>Começar diagnóstico <Icon name="arrow-right" size={18}/></button></div>
    </div>
    <Card style={R} padding={28}><span className="sm-overline" style={{color:'var(--text-secondary)'}}>Primeiros passos · 1 de 4</span>
      {[['Personalizar rotina',1,'perfil'],['Diagnóstico inicial',0,'sessao'],['Primeira revisão de flashcards',0,'flash'],['Definir data da prova',0,'plano']].map(([t,d,r])=><button key={t} type="button" onClick={()=>go(r)} style={{display:'flex',gap:12,alignItems:'center',width:'100%',padding:'14px 0',border:0,borderBottom:'1px solid var(--border-subtle)',background:'none',cursor:'pointer',color:'inherit',font:'inherit',textAlign:'left'}}><span style={{width:24,height:24,borderRadius:'50%',flex:'none',display:'inline-flex',alignItems:'center',justifyContent:'center',background:d?'var(--action-primary)':'transparent',border:d?0:'1.5px solid var(--border-strong)',color:'#fff'}}>{d?<Icon name="check" size={13}/>:null}</span><span style={{flex:1,font:'600 15px var(--font-sans)',textDecoration:d?'line-through':'none',color:d?'var(--text-tertiary)':'var(--text-primary)'}}>{t}</span><Icon name="chevron-right" size={18} style={{color:'var(--text-tertiary)'}}/></button>)}
    </Card>
  </div>
  <EmptyState icon="chart-no-axes-combined" title="Seu desempenho aparece aqui" description="Depois das primeiras 10 questões mostramos acurácia, ritmo e temas prioritários."/>
</>;}
function Home(p){return p.data==='novo'?<HomeNew {...p}/>:<HomeActive {...p}/>;}
export { Home };
