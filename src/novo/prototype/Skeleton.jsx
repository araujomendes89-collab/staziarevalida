// Gerado por scripts/design-system/port-prototype.mjs a partir de "app/Skeleton.jsx". Não editar à mão.
import React from "react";
import { Card, Button, Badge, Icon, TextField, Chip, Banner, SelectField } from "../ds";
import { IconTile } from "./RealIcons.jsx";
import { useMobile } from "./AppShell.jsx";
const AREAS=[['clinica','Clínica Médica','--area-clinica','stethoscope',1],['cirurgia','Cirurgia Geral','--area-cirurgia','scissors',1],['pediatria','Pediatria','--area-pediatria','baby',1],['go','Ginecologia e Obstetrícia','--area-go','heart-pulse',2],['mfc','Medicina de Família e Comunidade','--area-preventiva','shield-plus',1]];
const ORDEM=[['Abordagem','hand','Cumprimente, apresente-se pelo nome e confirme nome, idade, profissão e naturalidade do paciente.'],['Motivo da consulta','message-circle','“O que trouxe o(a) senhor(a) aqui hoje?” Ouça sem interromper e anote até três queixas.'],['Caracterizar a queixa','search','Use o ALICIA-FREDUSA para cada queixa, na ordem em que surgiram.'],['Sintomas associados','list-plus','Náuseas, febre, perda de peso, sudorese noturna e sempre alterações intestinais e urinárias.'],['Antecedentes','folder-heart','Doenças prévias, medicações, alergias, cirurgias, internações e história familiar.'],['Hábitos de vida','coffee','Tabagismo, álcool e drogas quantificados; alimentação, sono e atividade física.'],['Exame físico','scan-heart','Peça autorização, lave as mãos, sinais vitais e exame dirigido. Verbalize cada achado.'],['Exames complementares','flask-conical','Solicite em bloco, dirigidos à hipótese. Interprete e explique cada resultado.'],['Hipótese e diferenciais','brain','Verbalize o raciocínio e traga de 3 a 5 diagnósticos diferenciais.'],['Conduta','pill','Nome, dose, via, posologia e duração. Inclua medidas não farmacológicas e encaminhamentos.'],['Finalização','door-closed','Resuma, cheque o entendimento, oriente sinais de alarme e combine o retorno.']];
const ALICIA=[['A','Aparecimento','Quando começou? Há quanto tempo?'],['L','Localização','Onde exatamente é?'],['I','Intensidade','De 0 a 10, quanto?'],['C','Caráter','É em cólica, pontada, queimação, aperto?'],['I','Irradiação','Vai para algum outro lugar?'],['A','Atenuantes e agravantes','Algo melhora ou piora? Tomou algum remédio?'],['FRE','Frequência','Quantas vezes por dia, semana ou mês?'],['DU','Duração','Quanto dura cada episódio? Já teve antes?'],['SA','Sintomas associados','O que vem junto?']];
const DICAS=[['Verbalize tudo','O avaliador só pontua o que ouve. Diga em voz alta cada manobra e cada achado do exame.'],['Exames em bloco','Peça todos os exames de uma vez, com nome completo. Pedidos soltos consomem tempo e passam insegurança.'],['Controle do tempo','Reserve os 3 minutos finais para hipótese, conduta e orientações; é onde está a maior parte dos pontos.'],['Erros que mais custam ponto','Esquecer alergias, não quantificar hábitos e prescrever sem posologia completa.']];
const TOC=[['ordem','Ordem de atendimento'],['anamnese','Anamnese (ALICIA-FREDUSA)'],['dicas','Dicas e observações']];
function Skeleton({area,back,go}){
  const mobile=useMobile();const [sec,setSec]=React.useState('ordem');const [open,setOpen]=React.useState(0);
  const [,name,c]=area;
  const th={textAlign:'left',padding:'10px 14px',font:'700 11px var(--font-sans)',letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text-secondary)',background:'var(--surface-subtle)',borderBottom:'1px solid var(--border-default)'};
  const td={padding:'12px 14px',borderBottom:'1px solid var(--border-subtle)',verticalAlign:'top',font:'var(--type-body-sm)'};
  return <div style={{display:'flex',flexDirection:'column',gap:20}}>
    <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}><Button variant="ghost" size="sm" icon="arrow-left" onClick={back}>Esqueletos</Button><span style={{width:10,height:10,borderRadius:3,background:'var('+c+')'}}/><span style={{font:'600 15px var(--font-sans)'}}>Esqueleto de {name}</span><span style={{flex:1}}/><Button variant="secondary" size="sm" icon="printer">Imprimir</Button><Button size="sm" icon="play" onClick={()=>go('estacao')}>Aplicar numa estação</Button></div>
    <div style={{display:'grid',gridTemplateColumns:mobile?'1fr':'260px minmax(0,1fr)',gap:24,alignItems:'start'}}>
      <nav aria-label="Sumário" style={{position:mobile?'static':'sticky',top:24,display:'flex',flexDirection:mobile?'row':'column',gap:2,overflowX:'auto'}}>
        <div style={{font:'700 10.5px var(--font-sans)',letterSpacing:'.1em',textTransform:'uppercase',color:'var(--text-tertiary)',padding:'0 12px 8px',display:mobile?'none':'block'}}>Sumário</div>
        {TOC.map(([id,l],k)=><button key={id} type="button" className="sm-nav__item" aria-current={sec===id?'location':undefined} onClick={()=>setSec(id)} style={{height:38,fontWeight:500,background:sec===id?'var(--selected-bg)':undefined,color:sec===id?'var(--selected-text)':undefined,whiteSpace:'nowrap'}}><span style={{font:'600 12px var(--font-mono)',color:'var(--text-tertiary)',width:16}}>{k+1}</span>{l}</button>)}
        <div style={{display:mobile?'none':'block',marginTop:16,padding:14,borderRadius:14,background:'var(--ai-bg)',font:'var(--type-caption)',color:'var(--ai-text)'}}>Leia uma vez por dia na reta final. É o roteiro que se repete em quase toda estação da área.</div>
      </nav>
      <Card style={{borderRadius:24}} padding={mobile?18:32}>
        {sec==='ordem'&&<><span className="sm-overline">1 · Ordem de atendimento</span><p style={{margin:'8px 0 18px',color:'var(--text-secondary)'}}>O resumo que você leva para a estação. Siga de cima para baixo.</p>
          <div style={{overflowX:'auto',border:'1px solid var(--border-default)',borderRadius:16}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:520}}><thead><tr><th style={{...th,width:40}}>#</th><th style={{...th,width:210}}>Etapa</th><th style={th}>O que fazer e o que falar</th></tr></thead><tbody>
            {ORDEM.map(([e,ic,d],k)=><tr key={e}><td style={{...td,font:'600 13px var(--font-mono)',color:'var(--text-tertiary)'}}>{k+1}</td><td style={td}><span style={{display:'flex',gap:10,alignItems:'center',font:'600 14px var(--font-sans)',color:'var(--text-brand)'}}><IconTile name={ic} size={28} radius={8} tone="brand"/>{e}</span></td><td style={{...td,color:'var(--text-primary)'}}>{d}</td></tr>)}
          </tbody></table></div></>}
        {sec==='anamnese'&&<><span className="sm-overline">2 · Caracterização da queixa</span><h3 style={{margin:'8px 0 6px',font:'var(--type-h4)'}}>ALICIA-FREDUSA</h3><div style={{padding:'14px 18px',borderRadius:14,background:'var(--navy-900)',color:'#fff',font:'italic 500 15px var(--font-sans)',margin:'12px 0 18px'}}>“O que trouxe o(a) senhor(a) aqui hoje?”</div>
          <div style={{overflowX:'auto',border:'1px solid var(--border-default)',borderRadius:16}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:480}}><thead><tr><th style={{...th,width:70}}>Sigla</th><th style={{...th,width:200}}>Significado</th><th style={th}>Pergunta prática</th></tr></thead><tbody>
            {ALICIA.map(([s,m,p],k)=><tr key={k}><td style={{...td,font:'700 14px var(--font-mono)',color:'var(--text-brand)'}}>{s}</td><td style={{...td,fontWeight:600}}>{m}</td><td style={{...td,color:'var(--text-secondary)'}}>{p}</td></tr>)}
          </tbody></table></div></>}
        {sec==='dicas'&&<><span className="sm-overline">3 · Dicas e observações</span><p style={{margin:'8px 0 16px',color:'var(--text-secondary)'}}>Detalhes que costumam decidir a nota da estação.</p>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>{DICAS.map(([t,d],k)=><div key={t} style={{borderRadius:14,border:'1px solid var(--border-default)',overflow:'hidden'}}><button type="button" aria-expanded={open===k} onClick={()=>setOpen(open===k?-1:k)} style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'14px 16px',border:0,background:open===k?'var(--surface-subtle)':'var(--surface-card)',cursor:'pointer',font:'600 15px var(--font-sans)',color:'var(--text-primary)',textAlign:'left'}}><IconTile name="lightbulb" size={28} radius={8} tone="warning"/><span style={{flex:1}}>{t}</span><Icon name="chevron-down" size={18} style={{transform:open===k?'rotate(180deg)':'none',transition:'transform var(--dur-base)'}}/></button>{open===k&&<p style={{margin:0,padding:'0 16px 16px 43px',background:'var(--surface-subtle)',color:'var(--text-secondary)'}}>{d}</p>}</div>)}</div>
          <Button variant="link" size="sm" icon="flag" style={{marginTop:16,color:'var(--danger-text)'}}>Reportar erro no esqueleto</Button></>}
      </Card>
    </div>
  </div>;
}
function Skeletons({go}){const [q,setQ]=React.useState('');const [open,setOpen]=React.useState(null);const [view,setView]=React.useState(null);
  if(view)return <Skeleton area={view} back={()=>setView(null)} go={go}/>;
  const list=AREAS.filter(a=>a[1].toLowerCase().includes(q.toLowerCase()));
  return <div style={{display:'flex',flexDirection:'column',gap:16}}>
    <p style={{margin:0,color:'var(--text-secondary)',maxWidth:720}}>O roteiro do que é sempre cobrado numa estação, área por área. Estude, imprima e leve para treinar.</p>
    <TextField icon="search" aria-label="Buscar esqueleto" placeholder="Buscar esqueleto" value={q} onChange={e=>setQ(e.target.value)}/>
    <Card style={{borderRadius:24}} padding={8}>{list.map((a,k)=>{const [id,n,c,ic,cnt]=a;const on=open===id;return <div key={id} style={{borderTop:k?'1px solid var(--border-subtle)':0}}>
      <button type="button" aria-expanded={on} onClick={()=>setOpen(on?null:id)} style={{display:'flex',alignItems:'center',gap:14,width:'100%',padding:'14px 16px',border:0,background:'none',cursor:'pointer',textAlign:'left',font:'inherit',color:'inherit'}}>
        <IconTile name={ic} size={40} bg="color-mix(in oklab,var("/>
        <span style={{flex:1}}><span style={{display:'block',font:'600 15px var(--font-sans)'}}>{n}</span><span style={{display:'block',font:'var(--type-caption)',color:'var(--text-tertiary)'}}>{cnt} esqueleto{cnt>1?'s':''}</span></span>
        <Icon name="chevron-down" size={18} style={{color:'var(--text-tertiary)',transform:on?'rotate(180deg)':'none',transition:'transform var(--dur-base)'}}/></button>
      {on&&<div style={{padding:'0 16px 14px 70px',display:'flex',flexDirection:'column',gap:8}}>{Array.from({length:cnt},(_,j)=><button key={j} type="button" className="sm-row" onClick={()=>setView(a)} style={{padding:'12px 16px'}}><IconTile name="file-text" size={32} tone="brand"/><span style={{flex:1,font:'600 14px var(--font-sans)'}}>{j?'Esqueleto de pré-natal e puerpério':'Esqueleto de '+n}</span><span style={{font:'var(--type-caption)',color:'var(--text-tertiary)'}}>11 etapas</span><Icon name="chevron-right" size={16}/></button>)}</div>}
    </div>;})}</Card>
    <div style={{textAlign:'center',font:'var(--type-caption)',color:'var(--text-tertiary)'}}>6 esqueletos</div>
  </div>;}
const DOCS=[['receipt','Receita simples','Receituário'],['receipt','Notificação de receita A (amarela)','Receituário controlado'],['receipt','Notificação de receita B (azul)','Receituário controlado'],['file-badge','Atestado médico','Atestado'],['hard-hat','Atestado de saúde ocupacional (ASO)','Saúde do trabalhador'],['construction','Comunicação de acidente de trabalho (CAT)','Saúde do trabalhador'],['calendar-check','Declaração de comparecimento','Declaração'],['file-x','Declaração de óbito (campo VI)','Declaração'],['send','Encaminhamento','Referência'],['file-heart','Laudo médico','Laudo'],['bell-ring','Notificação compulsória (SINAN)','Vigilância'],['arrow-left-right','Passagem de plantão (SBAR)','Comunicação'],['notebook-tabs','Prontuário médico (SOAP)','Registro']];
function DocPractice({doc,back}){const [done,setDone]=React.useState(false);
  const fields=[['Identificação do paciente','Nome completo, idade'],['Medicamento','Nome genérico e concentração'],['Via e posologia','Ex.: via oral, 1 comprimido de 8/8h'],['Quantidade e duração','Ex.: 21 comprimidos, por 7 dias'],['Orientações','Uso, efeitos adversos e retorno']];
  return <div style={{display:'flex',flexDirection:'column',gap:20}}>
    <div style={{display:'flex',alignItems:'center',gap:12}}><Button variant="ghost" size="sm" icon="arrow-left" onClick={back}>Documentos</Button><span style={{font:'600 15px var(--font-sans)'}}>{doc[1]}</span><Badge size="sm">Caso 1 de 5</Badge></div>
    <Card style={{borderRadius:24}} padding={28}><span className="sm-overline">Caso</span><p style={{margin:'8px 0 0',font:'var(--type-body-lg)'}}>Mulher de 32 anos com cistite não complicada, sem alergias. Prescreva o tratamento de primeira linha no documento abaixo.</p></Card>
    <Card style={{borderRadius:24,background:'var(--surface-subtle)'}} padding={28}><div style={{display:'flex',flexDirection:'column',gap:16,maxWidth:640}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{font:'700 18px var(--font-sans)'}}>{doc[1]}</span><span style={{font:'500 12px var(--font-mono)',color:'var(--text-tertiary)'}}>02/10/2026</span></div>
      {fields.map(([l,p])=><TextField key={l} label={l} placeholder={p}/>)}
      <TextField label="Assinatura e CRM" placeholder="Nome do médico · CRM"/>
    </div></Card>
    {done&&<Banner tone="info" title="Confira os itens do gabarito">Nitrofurantoína 100 mg, via oral, de 6/6h por 5 dias · data · identificação completa · assinatura e CRM.</Banner>}
    <div style={{display:'flex',justifyContent:'flex-end',gap:8}}><Button variant="secondary" icon="rotate-ccw" onClick={()=>setDone(false)}>Limpar</Button><Button icon="check" onClick={()=>setDone(true)}>Corrigir documento</Button></div>
  </div>;}
function Documents(){const [q,setQ]=React.useState('');const [doc,setDoc]=React.useState(null);
  if(doc)return <DocPractice doc={doc} back={()=>setDoc(null)}/>;
  const list=DOCS.filter(d=>d[1].toLowerCase().includes(q.toLowerCase()));
  return <div style={{display:'flex',flexDirection:'column',gap:16}}>
    <p style={{margin:0,color:'var(--text-secondary)',maxWidth:720}}>Pratique o preenchimento de documentos médicos cobrados nas estações, a partir de casos clínicos.</p>
    <TextField icon="search" aria-label="Buscar documento" placeholder="Buscar documento" value={q} onChange={e=>setQ(e.target.value)}/>
    <Card style={{borderRadius:24}} padding={8}>{list.map((d,k)=><button key={d[1]} type="button" onClick={()=>setDoc(d)} className="sm-row" style={{border:0,borderTop:k?'1px solid var(--border-subtle)':0,borderRadius:16}}>
      <IconTile name={d[0]} size={40} bg="var(--surface-brand-soft)"/>
      <span style={{flex:1,minWidth:0}}><span style={{display:'block',font:'600 15px var(--font-sans)'}}>{d[1]}</span><span style={{display:'block',font:'var(--type-caption)',color:'var(--text-tertiary)'}}>{d[2]}</span></span>
      <span style={{font:'var(--type-caption)',color:'var(--text-tertiary)'}}>5 casos</span><Icon name="chevron-right" size={18} style={{color:'var(--text-tertiary)'}}/></button>)}</Card>
    <div style={{textAlign:'center',font:'var(--type-caption)',color:'var(--text-tertiary)'}}>{DOCS.length} documentos · {DOCS.length*5} casos</div>
  </div>;}
export { Skeletons, Documents };
