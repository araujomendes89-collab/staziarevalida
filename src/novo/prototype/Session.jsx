// Gerado por scripts/design-system/port-prototype.mjs a partir de "app/Session.jsx". Não editar à mão.
import React from "react";
import { Button, Badge, Icon, AnswerOption, IconButton, Chip, Card, TextField, SegmentedControl, SelectField } from "../ds";
import { IconTile } from "./RealIcons.jsx";
import { useMobile, useMQ } from "./AppShell.jsx";
import { Tutor } from "./More.jsx";
const QS=[
 {area:'Cirurgia Geral',src:'Revalida 2024/1',stem:'Um homem de 24 anos procura atendimento com dor abdominal iniciada há cerca de 12 horas. A dor começou em região periumbilical e posteriormente migrou para a fossa ilíaca direita. Apresenta náuseas, inapetência e dor à palpação da região, com maior intensidade no ponto de McBurney.',ask:'Qual é o diagnóstico mais provável?',opts:['Gastroenterite aguda','Apendicite aguda','Colecistite aguda','Pancreatite aguda'],ok:1,pct:68,exp:'A migração da dor periumbilical para a fossa ilíaca direita, com náuseas, inapetência e dor no ponto de McBurney, é a apresentação clássica de apendicite aguda.',why:'Na colecistite a dor é em hipocôndrio direito, com sinal de Murphy, geralmente após refeição gordurosa.',chips:['Explicar o sinal de Rovsing','Quando pedir TC?','Criar flashcard']},
 {area:'Clínica Médica',src:'Revalida 2023/2',stem:'Mulher de 58 anos, hipertensa, chega ao pronto-socorro com dor torácica em aperto há 40 minutos, irradiada para membro superior esquerdo. ECG mostra infradesnivelamento de ST em V4–V6. Troponina elevada.',ask:'Qual é o diagnóstico?',opts:['Angina estável','IAM com supra de ST','IAM sem supra de ST','Pericardite aguda'],ok:2,pct:54,exp:'Dor típica com infradesnivelamento de ST e troponina elevada caracteriza IAM sem supradesnivelamento de ST.',why:'O IAM com supra exige supradesnivelamento de ST em derivações contíguas ou BRE novo.',chips:['Escore GRACE','Conduta inicial','Criar flashcard']},
];
function Session({go}){
  const mobile=useMQ('(max-width: 1023px)');
  const [i,setI]=React.useState(0);const [sel,setSel]=React.useState(null);const [rev,setRev]=React.useState(false);const [mark,setMark]=React.useState(false);const [strike,setStrike]=React.useState([]);const [sec,setSec]=React.useState(1062);
  React.useEffect(()=>{const t=setInterval(()=>setSec(s=>s+1),1000);return ()=>clearInterval(t);},[]);
  const Q=QS[i];const st=k=>!rev?(sel===k?'selected':'idle'):k===Q.ok?'correct':k===sel?'incorrect':'dimmed';
  const next=()=>{if(i+1>=QS.length){go('home');return;}setI(i+1);setSel(null);setRev(false);setMark(false);setStrike([]);};
  const mm=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
  const tool=(ic,l,on,fn,dis)=><button type="button" onClick={fn} disabled={dis} aria-pressed={on} style={{display:'flex',alignItems:'center',gap:8,height:44,padding:mobile?'0 12px':'0 16px',border:0,borderRadius:999,background:on?'var(--selected-bg)':'transparent',color:on?'var(--selected-text)':'var(--text-secondary)',font:'600 14px var(--font-sans)',cursor:dis?'not-allowed':'pointer',opacity:dis?.4:1}}><Icon name={ic} size={18}/>{!mobile&&l}</button>;
  const panel=<aside style={{background:'var(--surface-subtle)',borderLeft:mobile?0:'1px solid var(--border-subtle)',borderTop:mobile?'1px solid var(--border-subtle)':0,padding:28,display:'flex',flexDirection:'column',gap:16}} aria-live="polite">
    <div style={{padding:16,borderRadius:16,background:sel===Q.ok?'var(--success-bg)':'var(--danger-bg)',border:'1px solid '+(sel===Q.ok?'var(--success-border)':'var(--danger-border)'),display:'flex',gap:12}}><Icon name={sel===Q.ok?'circle-check':'circle-x'} size={22} style={{color:sel===Q.ok?'var(--success-text)':'var(--danger-text)',flex:'none'}}/><div><div style={{font:'600 15px var(--font-sans)'}}>{sel===Q.ok?'Resposta correta.':'Você marcou '+'ABCD'[sel]+'. A correta é '+'ABCD'[Q.ok]+'.'}</div><div style={{fontSize:14,color:'var(--text-secondary)',marginTop:2}}>{Q.pct}% dos alunos acertaram esta questão.</div></div></div>
    <div><div className="sm-overline">Explicação clínica</div><p style={{margin:'8px 0 0',fontSize:15,lineHeight:1.6}}>{Q.exp}</p></div>
    <div style={{padding:'14px 16px',borderRadius:14,background:'var(--surface-card)',border:'1px solid var(--border-subtle)',fontSize:14}}><b>Por que não as outras?</b> {Q.why}</div>
    <div style={{padding:14,borderRadius:16,background:'var(--surface-card)',border:'1px solid var(--border-default)',display:'flex',flexDirection:'column',gap:10,marginTop:'auto'}}>
      <div style={{display:'flex',gap:8,alignItems:'center',font:'600 14px var(--font-sans)'}}><IconTile name="sparkles" size={28} bg="var(--ai-bg)"/>Tutor IA</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{Q.chips.map(t=><Chip key={t} onClick={()=>go('tutor')}>{t}</Chip>)}</div>
      <TextField placeholder="Pergunte sobre esta questão…" aria-label="Pergunta ao tutor" icon="message-square"/>
    </div></aside>;
  return <div style={{minHeight:'100vh',display:'grid',gridTemplateColumns:rev&&!mobile?'minmax(0,1fr) 440px':'1fr',background:'var(--surface-card)'}}>
    <div style={{position:'relative',paddingBottom:120}}>
      <header style={{position:'sticky',top:0,zIndex:5,height:68,display:'flex',alignItems:'center',gap:16,padding:mobile?'0 12px':'0 32px',borderBottom:'1px solid var(--border-subtle)',background:'color-mix(in oklab,var(--surface-card) 90%,transparent)',backdropFilter:'blur(12px)'}}>
        <Button variant="ghost" size="sm" icon="x" onClick={()=>go('home')}>Sair</Button>
        <div style={{flex:1,display:'flex',gap:3,maxWidth:560,margin:'0 auto'}} aria-hidden="true">{Array.from({length:20},(_,k)=><span key={k} style={{flex:1,height:6,borderRadius:9,background:k<8+i?'var(--action-primary)':k===8+i?'var(--teal-300)':'var(--chart-track)'}}/>)}</div>
        <span style={{font:'600 14px var(--font-mono)',color:'var(--text-secondary)'}}>{9+i}/20</span>
        {!mobile&&<span className="sm-pill"><Icon name="timer" size={16}/><span style={{fontFamily:'var(--font-mono)'}}>{mm}</span></span>}
      </header>
      <div style={{maxWidth:720,margin:'0 auto',padding:mobile?'24px 18px':'44px 32px'}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Badge tone="brand">{Q.area}</Badge><Badge>{Q.src}</Badge>{mark&&<Badge tone="warning" icon="bookmark">Marcada</Badge>}</div>
        <p style={{font:'400 '+(mobile?17:19)+'px/1.65 var(--font-sans)',margin:'22px 0 0',textWrap:'pretty'}}>{Q.stem}</p>
        <p style={{font:'600 18px/1.4 var(--font-sans)',margin:'28px 0 20px'}}>{Q.ask}</p>
        <div role="radiogroup" aria-label="Alternativas" style={{display:'flex',flexDirection:'column',gap:10}}>{Q.opts.map((o,k)=><div key={k} style={{opacity:strike.includes(k)&&!rev?.45:1,textDecoration:strike.includes(k)&&!rev?'line-through':'none'}}><AnswerOption letter={'ABCD'[k]} state={st(k)} onClick={()=>{if(rev)return;if(strike.length&&strike.includes(k)&&sel!==k){setStrike(s=>s.filter(x=>x!==k));return;}setSel(k);}}>{o}</AnswerOption></div>)}</div>
      </div>
      {mobile&&rev&&panel}
      <div role="toolbar" aria-label="Ferramentas da questão" style={{position:'fixed',left:mobile?12:(rev?'calc((100% - 440px)/2)':'50%'),right:mobile?12:'auto',bottom:24,transform:mobile?'none':'translateX(-50%)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:2,padding:6,borderRadius:999,background:'var(--surface-card)',border:'1px solid var(--border-default)',boxShadow:'var(--shadow-lg)',zIndex:10}}>
        {tool('bookmark','Marcar',mark,()=>setMark(m=>!m))}
        {tool('strikethrough','Riscar',false,()=>{if(sel!=null&&!rev){setStrike(s=>s.includes(sel)?s:[...s,sel]);setSel(null);}},rev||sel==null)}
        {tool('sparkles','Dica da IA',false,()=>go('tutor'),rev)}
        {!rev?<Button disabled={sel==null} onClick={()=>setRev(true)} style={{borderRadius:999,marginLeft:6}} iconRight="check">Confirmar</Button>:<Button onClick={next} style={{borderRadius:999,marginLeft:6}} iconRight="arrow-right">{i+1>=QS.length?'Concluir':'Próxima'}</Button>}
      </div>
    </div>
    {rev&&!mobile&&panel}
  </div>;
}
const AR=[['Todas',1300,'library'],['Clínica Médica',468,'stethoscope'],['Cirurgia',176,'activity'],['Pediatria',213,'baby'],['Gineco & Obstetrícia',250,'heart-pulse'],['Preventiva / MFC',193,'shield-plus']];
function Builder({go,mode}){const mobile=useMobile();const [a,setA]=React.useState('Todas');const [q,setQ]=React.useState(mode==='sim'?'100':'20');const [s,setS]=React.useState('');
  return <div style={{display:'grid',gridTemplateColumns:mobile?'1fr':'minmax(0,1fr) 340px',gap:24,alignItems:'start'}}>
    <Card style={{borderRadius:24}} padding={mobile?22:32}><div style={{display:'flex',flexDirection:'column',gap:28}}>
      {mode==='sim'&&<SegmentedControl fullWidth label="Tipo de simulado" value="rapido" options={[{value:'rapido',label:'Rápido'},{value:'area',label:'Por área'},{value:'geral',label:'Geral'},{value:'pers',label:'Personalizado'}]}/>}
      <TextField label="Tema ou assunto" icon="search" placeholder="Ex.: asma, sepse, pré-eclâmpsia" value={s} onChange={e=>setS(e.target.value)}/>
      <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:-16}}>{['Pré-eclâmpsia','Sepse','Pneumonia','Asma','Tuberculose','Apendicite'].map(x=><Chip key={x} selected={s===x} onClick={()=>setS(s===x?'':x)}>{x}</Chip>)}</div>
      <div role="radiogroup" aria-label="Grande área" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10}}>{AR.map(([n,c,ic],k)=>{const on=a===n;return <button key={n} type="button" role="radio" aria-checked={on} onClick={()=>setA(n)} style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:10,padding:16,borderRadius:16,border:(on?2:1)+'px solid '+(on?'var(--selected-border)':'var(--border-default)'),background:on?'var(--selected-bg)':'var(--surface-card)',cursor:'pointer',font:'inherit',color:'var(--text-primary)',textAlign:'left'}}><IconTile name={ic} size={40} tone={['brand','--area-clinica','--area-cirurgia','--area-pediatria','--area-go','--area-preventiva'][k]}/><span style={{font:'var(--type-label)'}}>{n}</span><span style={{font:'500 12px var(--font-mono)',color:'var(--text-tertiary)'}}>{c} q.</span></button>;})}</div>
      <div style={{display:'grid',gridTemplateColumns:mobile?'1fr':'1fr 1fr',gap:16}}><SelectField label="Prova / edição" options={['Todas as provas oficiais','2026/1','2025/2','2025/1']}/><SelectField label={mode==='sim'?'Cronômetro':'Status'} options={mode==='sim'?['Tempo de prova (5h)','2 horas','Sem cronômetro']:['Não resolvidas','Erradas','Todas']}/></div>
      <div><div className="sm-field__label" style={{marginBottom:10}}>Quantidade</div><SegmentedControl fullWidth label="Quantidade" value={q} onChange={setQ} options={mode==='sim'?['30','50','100']:['10','20','30','50']}/></div>
    </div></Card>
    <div style={{position:mobile?'static':'sticky',top:24,display:'flex',flexDirection:'column',gap:16}}>
      <Card style={{borderRadius:24}} padding={24}><span className="sm-overline" style={{color:'var(--text-secondary)'}}>Resumo</span>
        <div style={{font:'700 34px/1.1 var(--font-sans)',letterSpacing:'-0.02em',marginTop:10}}>{q} questões</div>
        <div style={{color:'var(--text-secondary)',marginTop:4}}>{a} · ~{Math.round(q*2)} min{s?' · '+s:''}</div>
        <div style={{marginTop:20}}><Button size="lg" fullWidth iconRight="arrow-right" onClick={()=>go('sessao')}>{mode==='sim'?'Iniciar simulado':'Começar treino'}</Button></div>
      </Card>
      {mode==='sim'&&<Card style={{borderRadius:24}} padding={20}><div style={{display:'flex',gap:12}}><IconTile name="calendar-clock" size={40} tone="info"/><div><div style={{font:'var(--type-label)'}}>Simulado Nacional Geral</div><div style={{font:'var(--type-body-sm)',color:'var(--text-secondary)'}}>Domingo, 09:00 · 100 questões</div><Button variant="link" size="sm" style={{marginTop:6}}>Inscrever-se</Button></div></div></Card>}
    </div>
  </div>;}
export { Session, Builder };
