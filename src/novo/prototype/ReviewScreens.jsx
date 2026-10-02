// Gerado por scripts/design-system/port-prototype.mjs a partir de "ui_kits/student-app/ReviewScreens.jsx". Não editar à mão.
import React from "react";
import { Card, Button, StatCard, Flashcard, Chip, Tabs, SelectField, EmptyState, Badge, Banner } from "../ds";
const AR=['Todas as áreas','Clínica Médica','Cirurgia Geral','Pediatria','Ginecologia e Obstetrícia','Preventiva / SUS'];
const DECK=[
 {area:'Clínica Médica',f:'Qual é a tríade de Beck no tamponamento cardíaco?',b:'Hipotensão arterial, turgência jugular e abafamento de bulhas cardíacas.'},
 {area:'Pediatria',f:'Idade de início da vacina tríplice viral no calendário do PNI?',b:'12 meses (1ª dose), com reforço aos 15 meses pela tetraviral.'},
 {area:'Ginecologia e Obstetrícia',f:'Critério laboratorial de plaquetopenia na síndrome HELLP?',b:'Plaquetas abaixo de 100.000/mm³.'},
];
function FlashcardsScreen(){
  const [i,setI]=React.useState(0);const [fl,setFl]=React.useState(false);const [a,setA]=React.useState(AR[0]);const [done,setDone]=React.useState(0);
  const rate=()=>{setDone(d=>d+1);setFl(false);setI(x=>x+1);};
  const card=DECK[i];
  return <>
    <Card><div style={{display:'flex',justifyContent:'space-between',gap:16,flexWrap:'wrap',alignItems:'center'}}>
      <div><div style={{display:'flex',gap:10,alignItems:'center'}}><span className="sm-overline">Repetição espaçada</span><Badge size="sm">{DECK.length} cartões agendados</Badge></div><h2 style={{margin:'6px 0 4px',font:'var(--type-h2)'}}>Flashcards</h2><p style={{margin:0,color:'var(--text-secondary)'}}>Revisão espaçada dos conteúdos clínicos que você precisa manter ativos na memória.</p></div>
      <Button variant="secondary" icon="headphones">Modo áudio</Button>
    </div></Card>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
      <StatCard label="Novos" value={DECK.length-done>0?DECK.length-done:0} caption="Aguardando 1ª repetição"/>
      <StatCard label="Em aprendizado" value={done} caption="Em fase de fixação ativa" tone="info" icon="refresh-cw"/>
      <StatCard label="Consolidados" value="0" caption="Domínio ≥ 70%" tone="success" icon="circle-check"/>
    </div>
    <Card><div style={{display:'flex',flexDirection:'column',gap:12}}><span className="sm-field__label">Filtrar por grande área</span><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{AR.map(x=><Chip key={x} selected={a===x} onClick={()=>setA(x)}>{x}</Chip>)}</div></div></Card>
    {card?<div style={{maxWidth:640,width:'100%',margin:'0 auto',display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',font:'var(--type-caption)',color:'var(--text-secondary)'}}><span>Revisão de hoje</span><span style={{fontFamily:'var(--font-mono)'}}>{i+1} / {DECK.length}</span></div>
      <Flashcard key={i} area={card.area} front={card.f} back={card.b} flipped={fl} onFlip={setFl} height={280}/>
      {fl?<div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}} role="group" aria-label="Como foi lembrar?">
        {[['Errei','danger','< 1 min'],['Difícil','warning','6 min'],['Bom','primary','1 dia'],['Fácil','secondary','4 dias']].map(([l,v,t])=><Button key={l} variant={v==='warning'?'secondary':v} onClick={rate} style={{flexDirection:'column',height:56,gap:2}}><span>{l}</span><span style={{font:'500 11px var(--font-mono)',opacity:.8}}>{t}</span></Button>)}
      </div>:<Button size="lg" variant="strong" fullWidth onClick={()=>setFl(true)}>Mostrar resposta</Button>}
    </div>:<Banner tone="success" title="Nenhum cartão pendente hoje" action={<Button size="sm" variant="secondary" icon="rotate-ccw" onClick={()=>{setI(0);setDone(0);}}>Revisar novamente</Button>}>Todos os seus flashcards programados estão em dia. Você pode antecipar revisões ou resolver novas questões.</Banner>}
  </>;
}
function ErrorsScreen({go}){
  const [t,setT]=React.useState('rev');const [a,setA]=React.useState('Todas');
  return <>
    <Card><span className="sm-overline">Revisão ativa · 0 casos para revisar</span><h2 style={{margin:'6px 0 4px',font:'var(--type-h2)'}}>Caderno de erros</h2><p style={{margin:0,color:'var(--text-secondary)'}}>Revise os erros que ainda precisam ser corrigidos e consolide lacunas clínicas.</p></Card>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
      <StatCard label="Para revisar" value="0" caption="Casos ainda não superados em novos testes" tone="warning" icon="rotate-ccw"/>
      <StatCard label="Superados" value="0" caption="Acertados em revisões posteriores" tone="success" icon="circle-check"/>
      <StatCard label="Questões recorrentes" value="0" caption="Erradas 2 ou mais vezes" tone="danger" icon="repeat"/>
    </div>
    <Card><div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:280}}><Tabs label="Status" value={t} onChange={setT} tabs={[{value:'rev',label:'Para revisar',count:0},{value:'sup',label:'Superados',count:0},{value:'all',label:'Todos',count:0}]}/></div>
        <div style={{width:220}}><SelectField aria-label="Ordenar" options={['Mais recentes','Mais antigas','Maior incidência']}/></div>
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><span style={{font:'var(--type-caption)',color:'var(--text-tertiary)'}}>Área:</span>{['Todas','Clínica Médica','Cirurgia Geral','Pediatria','Ginecologia e Obstetrícia','Preventiva / SUS'].map(x=><Chip key={x} selected={a===x} onClick={()=>setA(x)}>{x}</Chip>)}</div>
      <EmptyState icon="notebook-pen" title="Nenhum erro registrado no caderno" description="Continue praticando. Conforme você responder simulados e questões, os erros aparecem aqui para revisão." action={<Button iconRight="arrow-right" onClick={()=>go('questoes')}>Praticar questões</Button>}/>
    </div></Card>
  </>;
}
export { FlashcardsScreen, ErrorsScreen };
