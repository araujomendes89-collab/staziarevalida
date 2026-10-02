// Gerado por scripts/design-system/port-prototype.mjs a partir de "app/Theory2.jsx". Não editar à mão.
import React from "react";
import { Card, Button, Badge, Icon, Tabs, Flashcard, Chip, TextField } from "../ds";
import { IconTile } from "./RealIcons.jsx";
import { useMobile } from "./AppShell.jsx";
import { Skeletons, Documents } from "./Skeleton.jsx";
const R={borderRadius:24};
const ROTEIROS=[
 {ic:'messages-square',t:'Anamnese dirigida',s:'Estrutura que pontua em quase todo PEP',tag:'Todas as áreas',steps:['Apresentar-se, identificar o paciente e pedir consentimento','Queixa principal e duração','Caracterizar o sintoma: início, localização, irradiação, intensidade, fatores de melhora e piora','Sintomas associados e sinais de alarme','Antecedentes pessoais, medicações e alergias','Hábitos de vida e história familiar','Resumir e confirmar com o paciente'],st:['Dor torácica na UPA','Febre e exantema em lactente']},
 {ic:'heart-pulse',t:'Exame físico cardiovascular',s:'Sequência inspeção → palpação → ausculta',tag:'Clínica Médica',steps:['Higienizar as mãos e explicar o exame','Sinais vitais e perfusão periférica','Inspeção: turgência jugular, edema, cianose','Palpação de pulsos e ictus','Ausculta nos 4 focos e manobras','Verbalizar achados ao avaliador'],st:['Dor torácica na UPA','Dispneia em paciente com DPOC']},
 {ic:'siren',t:'Atendimento inicial ao trauma (ABCDE)',s:'Prioridades do ATLS 10ª ed.',tag:'Cirurgia Geral',steps:['X: hemorragia exsanguinante','A: via aérea com proteção da coluna cervical','B: ventilação e respiração','C: circulação e controle de sangramento','D: avaliação neurológica (Glasgow, pupilas)','E: exposição e prevenção de hipotermia','Reavaliar e decidir transferência'],st:['Politrauma: atendimento inicial']},
 {ic:'hand-heart',t:'Comunicação de notícia difícil (SPIKES)',s:'Item de comunicação presente em MFC e GO',tag:'Medicina de Família',steps:['S: preparar o ambiente e a privacidade','P: perceber o que o paciente já sabe','I: pedir permissão para informar','K: comunicar com linguagem clara, em partes','E: acolher as emoções','S: resumir e combinar próximos passos'],st:['Notícia difícil na UBS']},
];
const TEMAS=[
 {area:'Ginecologia e Obstetrícia',c:'--area-go',t:'Pré-eclâmpsia e síndrome HELLP',m:35,pr:['Aferir PA corretamente e verbalizar critérios de gravidade','Prescrever sulfato de magnésio (Zuspan ou Pritchard) com dose','Indicar anti-hipertensivo para PA ≥ 160/110 mmHg','Definir momento do parto e comunicar à gestante']},
 {area:'Clínica Médica',c:'--area-clinica',t:'Síndrome coronariana aguda',m:52,pr:['ECG em até 10 minutos da chegada','Interpretar supra de ST e parede acometida','AAS + segundo antiagregante + anticoagulação','Indicar reperfusão: angioplastia ou trombólise, conforme tempo']},
 {area:'Cirurgia Geral',c:'--area-cirurgia',t:'Trauma torácico',m:88,pr:['Reconhecer pneumotórax hipertensivo pela clínica','Descompressão imediata no 5º espaço intercostal','Drenagem torácica: indicação e técnica','Verbalizar reavaliação após cada intervenção']},
];
const CARDS=[
 {area:'Ginecologia e Obstetrícia',f:'Dose de ataque do sulfato de magnésio (Zuspan)?',b:'4 g IV em 10–20 minutos, seguidos de 1 g/h em bomba de infusão.'},
 {area:'Cirurgia Geral',f:'Local da descompressão do pneumotórax hipertensivo no adulto (ATLS 10ª ed.)?',b:'5º espaço intercostal, entre a linha axilar anterior e a média.'},
 {area:'Medicina de Família e Comunidade',f:'O que significa o “E” do protocolo SPIKES?',b:'Emotions: acolher e responder às emoções do paciente com empatia.'},
];
const MATS=[['file-text','Manual do candidato: habilidades clínicas','INEP · edição 2026/2'],['book-marked','PCDT: hipertensão na gestação','Ministério da Saúde'],['book-marked','Diretriz de síndromes coronarianas agudas','Sociedade Brasileira de Cardiologia'],['file-check','Caderno de Atenção Básica: acolhimento','Ministério da Saúde']];
function Roteiro({r,go}){const [open,setOpen]=React.useState(false);const [chk,setChk]=React.useState([]);
  return <Card style={{borderRadius:20}} padding={0}>
    <button type="button" aria-expanded={open} onClick={()=>setOpen(o=>!o)} style={{display:'flex',gap:14,alignItems:'center',width:'100%',padding:20,border:0,background:'none',cursor:'pointer',textAlign:'left',font:'inherit',color:'inherit'}}>
      <IconTile name={r.ic} size={44} bg="var(--ai-bg)"/>
      <div style={{flex:1,minWidth:0}}><div style={{font:'600 16px var(--font-sans)'}}>{r.t}</div><div style={{font:'var(--type-body-sm)',color:'var(--text-secondary)'}}>{r.s}</div></div>
      <Badge size="sm">{r.tag}</Badge><Icon name="chevron-down" size={18} style={{transform:open?'rotate(180deg)':'none',transition:'transform var(--dur-base)',color:'var(--text-tertiary)'}}/>
    </button>
    {open&&<div style={{padding:'0 20px 20px 78px',display:'flex',flexDirection:'column',gap:14}}>
      <ol style={{margin:0,padding:0,listStyle:'none',display:'flex',flexDirection:'column',gap:2}}>{r.steps.map((s,k)=>{const on=chk.includes(k);return <li key={k}><button type="button" role="checkbox" aria-checked={on} onClick={()=>setChk(c=>on?c.filter(x=>x!==k):[...c,k])} style={{display:'flex',gap:12,alignItems:'flex-start',width:'100%',padding:'8px 0',border:0,background:'none',cursor:'pointer',textAlign:'left',font:'var(--type-body)',color:on?'var(--text-tertiary)':'var(--text-primary)'}}><span style={{width:24,height:24,flex:'none',borderRadius:8,display:'inline-flex',alignItems:'center',justifyContent:'center',font:'700 12px var(--font-mono)',background:on?'var(--violet-600)':'var(--surface-sunken)',color:on?'#fff':'var(--text-secondary)'}}>{on?<Icon name="check" size={13}/>:k+1}</span><span style={{textDecoration:on?'line-through':'none'}}>{s}</span></button></li>;})}</ol>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',paddingTop:12,borderTop:'1px solid var(--border-subtle)'}}><span style={{font:'var(--type-caption)',color:'var(--text-tertiary)'}}>Aplicar em:</span>{r.st.map(s=><Chip key={s} icon="play" onClick={()=>go('estacao')}>{s}</Chip>)}</div>
    </div>}
  </Card>;}
function Theory2({go}){const mobile=useMobile();const [tab,setTab]=React.useState('esq');const [i,setI]=React.useState(0);
  return <>
    <Tabs label="Conteúdo teórico" value={tab} onChange={setTab} tabs={[{value:'esq',label:'Esqueletos',icon:'list-tree'},{value:'docs',label:'Documentos médicos',icon:'file-pen-line'},{value:'roteiros',label:'Roteiros',icon:'route'},{value:'temas',label:'Temas na prática',icon:'library'},{value:'cards',label:'Flashcards práticos',icon:'layers',count:CARDS.length},{value:'mat',label:'Materiais oficiais',icon:'landmark'}]}/>
    {tab==='esq'&&<Skeletons go={go}/>}{tab==='docs'&&<Documents/>}{tab==='roteiros'&&<><p style={{margin:0,color:'var(--text-secondary)',maxWidth:720}}>Sequências que se repetem nos PEPs. Abra um roteiro, marque os passos enquanto revisa e aplique direto numa estação.</p><div style={{display:'flex',flexDirection:'column',gap:12}}>{ROTEIROS.map(r=><Roteiro key={r.t} r={r} go={go}/>)}</div></>}
    {tab==='temas'&&<><p style={{margin:0,color:'var(--text-secondary)',maxWidth:720}}>Os mesmos temas da 1ª fase, reescritos como ações que o avaliador espera ver e ouvir na estação.</p>
      <div style={{display:'grid',gridTemplateColumns:mobile?'1fr':'repeat(3,1fr)',gap:16}}>{TEMAS.map(x=><Card key={x.t} style={R} padding={24}><div style={{display:'flex',flexDirection:'column',gap:14,height:'100%'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><span style={{display:'flex',alignItems:'center',gap:6,font:'600 12px var(--font-sans)',color:'var(--text-secondary)'}}><span style={{width:8,height:8,borderRadius:3,background:'var('+x.c+')'}}/>{x.area}</span><Badge tone={x.m>=70?'success':x.m>=50?'info':'warning'} size="sm">1ª fase {x.m}%</Badge></div>
        <div style={{font:'600 17px/1.35 var(--font-sans)'}}>{x.t}</div>
        <div><div className="sm-overline" style={{color:'var(--ai-text)'}}>O que pontua na estação</div><ul style={{margin:'10px 0 0',padding:0,listStyle:'none',display:'flex',flexDirection:'column',gap:8}}>{x.pr.map(p=><li key={p} style={{display:'flex',gap:8,font:'var(--type-body-sm)'}}><Icon name="circle-check" size={16} style={{color:'var(--violet-600)',flex:'none',marginTop:2}}/>{p}</li>)}</ul></div>
        <div style={{marginTop:'auto',display:'flex',gap:8,flexWrap:'wrap'}}><Button size="sm" icon="play" onClick={()=>go('estacao')}>Treinar estação</Button><Button size="sm" variant="ghost" onClick={()=>go('home')}>Ver na 1ª fase</Button></div>
      </div></Card>)}</div></>}
    {tab==='cards'&&<div style={{maxWidth:640,width:'100%',margin:'0 auto',display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',font:'var(--type-caption)',color:'var(--text-secondary)'}}><span>Doses, técnicas e protocolos cobrados na estação</span><span style={{fontFamily:'var(--font-mono)'}}>{i+1} / {CARDS.length}</span></div>
      <Flashcard key={i} area={CARDS[i].area} front={CARDS[i].f} back={CARDS[i].b} height={260}/>
      <div style={{display:'flex',justifyContent:'space-between'}}><Button variant="secondary" icon="arrow-left" disabled={i===0} onClick={()=>setI(i-1)}>Anterior</Button><Button iconRight="arrow-right" disabled={i===CARDS.length-1} onClick={()=>setI(i+1)}>Próximo</Button></div>
    </div>}
    {tab==='mat'&&<Card style={R} padding={8}>{MATS.map(([ic,t,s],k)=><div key={t} className="sm-row" style={{border:0,borderTop:k?'1px solid var(--border-subtle)':0,borderRadius:16}}><IconTile name={ic} size={40} bg="var(--surface-brand-soft)"/><div style={{flex:1,minWidth:0}}><div style={{font:'600 15px var(--font-sans)'}}>{t}</div><div style={{font:'var(--type-caption)',color:'var(--text-secondary)'}}>{s}</div></div><Button variant="ghost" size="sm" icon="external-link">Abrir</Button></div>)}</Card>}
  </>;}
export { Theory2 };
