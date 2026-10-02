// Gerado por scripts/design-system/port-prototype.mjs a partir de "ui_kits/student-app/OtherScreens.jsx". Não editar à mão.
import React from "react";
import { Card, Button, ProgressBar, Badge, EmptyState, LockedFeature, SectionHeader, Icon, Switch, TextField, Avatar, Checkbox, Tabs } from "../ds";
function TodayScreen({go}){
  const [done,setDone]=React.useState([false,false,false]);
  const n=done.filter(Boolean).length;
  const steps=[['Estudar','30 min','Diagnóstico de microcompetências prioritárias','Clínica Médica','Estudar tema','aulas'],['Praticar','30 min','Resolver 10 questões oficiais','Questões comentadas com distratores mapeados','Resolver questões','questoes'],['Revisar','15 min','Flashcards agendados','5 cards pela repetição espaçada','Revisar agora','flash']];
  return <>
    <Card variant="brand"><div style={{display:'flex',justifyContent:'space-between',gap:16,flexWrap:'wrap',alignItems:'flex-start'}}>
      <div style={{flex:'1 1 360px'}}><span className="sm-overline">Ciclo diário recomendado</span><h2 style={{margin:'6px 0 6px',font:'var(--type-h2)'}}>Diagnóstico clínico inicial — matriz INEP</h2><p style={{margin:0,color:'var(--text-secondary)',textWrap:'pretty'}}>Resolva suas primeiras questões oficiais para que o sistema calcule sua prioridade de pontos nas 5 grandes áreas.</p></div>
      <Button variant="secondary" icon="sliders-horizontal">Personalizar plano</Button>
    </div></Card>
    <Card><ProgressBar label="Progresso de hoje" valueLabel={n+' de 3 tarefas concluídas ('+Math.round(n/3*100)+'%)'} value={n} max={3} height={10}/></Card>
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <h3 style={{margin:0,font:'var(--type-h4)'}}>Etapas do ciclo de hoje</h3>
      {steps.map(([k,t,title,sub,cta,dest],i)=><Card key={i} padding={20}><div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
        <Checkbox aria-label={'Marcar '+title+' como concluída'} checked={done[i]} onChange={()=>setDone(d=>d.map((x,j)=>j===i?!x:x))}/>
        <span style={{width:32,height:32,borderRadius:'50%',background:done[i]?'var(--success-bg)':'var(--surface-sunken)',color:done[i]?'var(--success-text)':'var(--text-secondary)',display:'inline-flex',alignItems:'center',justifyContent:'center',font:'700 14px var(--font-sans)'}}>{i+1}</span>
        <div style={{flex:'1 1 260px',minWidth:0}}><div style={{display:'flex',gap:8,alignItems:'center'}}><span className="sm-overline">{k}</span><span style={{font:'var(--type-data)',fontSize:12,color:'var(--text-tertiary)'}}>{t}</span></div>
          <div style={{font:'600 16px/1.35 var(--font-sans)',marginTop:4,textDecoration:done[i]?'line-through':'none',color:done[i]?'var(--text-tertiary)':'var(--text-primary)'}}>{title}</div><div style={{font:'var(--type-body-sm)',color:'var(--text-secondary)'}}>{sub}</div></div>
        <Button variant="secondary" size="sm" iconRight="arrow-right" onClick={()=>go(dest)}>{cta}</Button>
      </div></Card>)}
    </div>
  </>;
}
const AREAS=[['Clínica Médica','--area-clinica'],['Cirurgia Geral','--area-cirurgia'],['Ginecologia e Obstetrícia','--area-go'],['Pediatria','--area-pediatria'],['Medicina de Família e Comunidade','--area-preventiva']];
function PerformanceScreen({go}){
  return <>
    <Card><div style={{display:'flex',justifyContent:'space-between',gap:16,flexWrap:'wrap',alignItems:'center'}}>
      <div><div style={{display:'flex',gap:10,alignItems:'center'}}><h2 style={{margin:0,font:'var(--type-h2)'}}>Visão geral do desempenho</h2><Badge tone="success" icon="circle-check" size="sm">Dados reais</Badge></div><p style={{margin:'4px 0 0',color:'var(--text-secondary)'}}>Seu desempenho consolidado com base nas questões resolvidas no banco de treino.</p></div>
      <Button variant="secondary" icon="timer" onClick={()=>go('simulados')}>Simular prova</Button>
    </div></Card>
    <EmptyState icon="chart-no-axes-combined" title="Ainda não há dados suficientes" description="Resolva questões para que o sistema calcule sua acurácia real, evolução temporal e diagnóstico por área." action={<Button iconRight="arrow-right" onClick={()=>go('questoes')}>Começar a praticar questões</Button>}/>
    <Card><div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionHeader icon="target" title="Desempenho por grande área" subtitle="Acurácia consolidada nas 5 disciplinas oficiais do Revalida" action={<Button variant="link" iconRight="chevron-right" onClick={()=>go('area')}>Ver detalhes por área</Button>}/>
      {AREAS.map(([n,c])=><div key={n} style={{display:'flex',gap:12,alignItems:'center'}}><span style={{width:10,height:10,borderRadius:3,background:'var('+c+')',flex:'none'}}/><div style={{flex:1}}><ProgressBar label={n} valueLabel="0% · sem dados" value={0} color={'var('+c+')'}/></div></div>)}
    </div></Card>
  </>;
}
function Locked({title,description,plan='PRO',go}){return <div style={{paddingTop:24}}><LockedFeature title={title} description={description} plan={plan} cta={'Fazer upgrade para Stazia '+plan} onUpgrade={()=>go('planos')}/></div>;}
function TutorScreen({go}){
  const [t,setT]=React.useState('c');
  return <><Tabs label="Tutor IA" value={t} onChange={setT} tabs={[{value:'c',label:'Conversar com tutor',icon:'message-square'},{value:'t',label:'Modo trânsito',icon:'car'},{value:'h',label:'Histórico',icon:'history'}]}/>
  <Locked go={go} plan="Elite" title="Tutor por voz e Stazia AI Coach" description="O tutor por voz com preceptoria socrática em tempo real e o modo trânsito hands-free são exclusivos do plano Stazia Elite."/></>;
}
function ProfileScreen({go}){
  const [sec,setSec]=React.useState('conta');
  const menu=[['visao','Visão geral','Resumo do perfil e atalhos','layout-dashboard'],['conta','Minha conta','Nome, e-mail, foto e confirmação','user'],['seg','Segurança','Senha, Google e sessões ativas','shield-check'],['priv','Privacidade e dados','Exportação, exclusão e LGPD','file-lock']];
  return <>
    <Card><div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}><Avatar name="Joao Paulo" size={64}/><div style={{flex:1}}><h2 style={{margin:0,font:'var(--type-h3)'}}>Joao Paulo</h2><div style={{color:'var(--text-secondary)',font:'var(--type-body-sm)'}}>joaopaulo_df@msn.com</div><div style={{display:'flex',gap:6,marginTop:8,flexWrap:'wrap'}}><Badge tone="success" size="sm" icon="mail-check">E-mail confirmado</Badge><Badge tone="pro" size="sm">Plano Trial</Badge><Badge size="sm">Meta: Revalida INEP 2026/2</Badge></div></div></div></Card>
    <div style={{display:'grid',gridTemplateColumns:'260px minmax(0,1fr)',gap:24,alignItems:'start'}}>
      <Card padding={8}><nav aria-label="Seções da conta" style={{display:'flex',flexDirection:'column',gap:2}}>
        {menu.map(([id,l,s,ic])=><button key={id} type="button" className="sm-nav__item" aria-current={sec===id?'page':undefined} onClick={()=>setSec(id)} style={{height:'auto',padding:'10px 12px',alignItems:'flex-start'}}><Icon name={ic} size={18}/><span style={{display:'flex',flexDirection:'column',gap:2}}><span>{l}</span><span style={{font:'var(--type-caption)',color:'var(--text-tertiary)'}}>{s}</span></span></button>)}
        <button type="button" className="sm-nav__item" style={{color:'var(--danger-text)'}}><Icon name="log-out" size={18}/>Sair da conta</button>
      </nav></Card>
      <Card padding={28}><div style={{display:'flex',flexDirection:'column',gap:20}}>
        <SectionHeader title="Minha conta" subtitle="Gerencie seus dados pessoais, foto e status de confirmação do e-mail"/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}><TextField label="Nome completo" defaultValue="Joao Paulo"/><TextField label="E-mail cadastrado" defaultValue="joaopaulo_df@msn.com" hint="O e-mail é vinculado ao seu login e não pode ser alterado aqui." readOnly/></div>
        <div style={{display:'flex',flexDirection:'column',gap:16,paddingTop:20,borderTop:'1px solid var(--border-subtle)'}}>
          <Switch label="Lembrete diário de estudo" description="Notificação às 19:00 se o ciclo não foi concluído" defaultChecked/>
          <Switch label="Alertas de novas diretrizes" description="Atualizações do Radar de diretrizes clínicas"/>
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}><Button variant="ghost">Cancelar</Button><Button>Salvar alterações</Button></div>
      </div></Card>
    </div>
  </>;
}
function NotIncluded({label}){return <EmptyState icon="monitor-off" title={label+' — não incluída nesta recriação'} description="Esta tela existe no produto, mas não foi recriada no UI kit. Use os componentes do sistema para montá-la."/>;}
export { TodayScreen, PerformanceScreen, Locked, TutorScreen, ProfileScreen, NotIncluded };
