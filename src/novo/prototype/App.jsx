// Gerado por scripts/design-system/port-prototype.mjs a partir de "StaziaMed App.html (inline)". Não editar à mão.
import React from "react";
import { SegmentedControl } from "../ds";
import { AppShell, useMobile } from "./AppShell.jsx";
import { Home } from "./Home.jsx";
import { Session, Builder } from "./Session.jsx";
import { Performance, Planning, Tutor } from "./More.jsx";
import { Aulas, Temas, Materiais } from "./Study1.jsx";
import { Home2, Stations, Station, Peps, Perf2, SimPatient } from "./Phase2.jsx";
import { Pair } from "./Match.jsx";
import { Theory2 } from "./Theory2.jsx";
import { FlashcardsScreen, ErrorsScreen } from "./ReviewScreens.jsx";
import { TodayScreen, ProfileScreen } from "./OtherScreens.jsx";
const T={home:['Bom dia, Joao.','Quinta, 2 de outubro · 41 dias para a prova'],aulas:['Aulas teórico-práticas','Estudar · conteúdo audiovisual por grande área'],temas:['Grandes Temas do Revalida','Estudar · 75 temas nas 5 grandes áreas'],materiais:['Materiais oficiais e diretrizes','Estudar · PCDTs, protocolos do MS, INEP e sociedades'],hoje:['Plano de hoje','Estudar · praticar · revisar'],questoes:['Questões','Monte seu treino'],simulados:['Simulados','Condições de prova'],flash:['Flashcards','Revisão espaçada'],erros:['Caderno de erros','Revisar'],plano:['Planejamento','Cronograma até a prova'],desempenho:['Desempenho','Seus dados reais'],tutor:['Tutor IA','Discussão clínica socrática'],perfil:['Conta','Dados, segurança e privacidade'],home2:['Bom dia, Joao.','2ª fase · habilidades clínicas'],teoria2:['Teoria para a prática','Esqueletos, documentos médicos e protocolos aplicados às estações'],estacoes:['Banco de estações','158 estações nas 5 grandes áreas'],dupla:['Praticar','Dê match com quem também está treinando'],peps:['Meus PEPs','Estações avaliadas'],paciente:['Paciente simulado','Treine a anamnese com IA'],desempenho2:['Desempenho prático','Notas pelo PEP']};
const P2R=['home2','teoria2','estacoes','estacao','dupla','peps','paciente','desempenho2'];
function App(){
  const [route,setRoute]=React.useState(()=>localStorage.getItem('smf-route')||'home');
  const [theme,setTheme]=React.useState(()=>localStorage.getItem('smf-theme')||'light');
  const [data,setData]=React.useState(()=>localStorage.getItem('smf-data')||'ativo');
  const phase=P2R.includes(route)?2:1;
  const setPhase=p=>go(p===2?'home2':'home');
  React.useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('smf-theme',theme);},[theme]);
  React.useEffect(()=>localStorage.setItem('smf-data',data),[data]);
  const go=r=>{if(r==='planos'){location.href='ui_kits/auth-billing/index.html';return;}setRoute(r);localStorage.setItem('smf-route',r);window.scrollTo(0,0);};
  const mobile=useMobile();
  let body;
  if(route==='sessao')return <Session go={go}/>;
  if(route==='estacao')return <Station go={go}/>;
  if(route==='home')body=<Home go={go} data={data} mobile={mobile}/>;
  else if(route==='hoje')body=<TodayScreen go={go}/>;
  else if(route==='aulas')body=<Aulas/>;
  else if(route==='temas')body=<Temas go={go}/>;
  else if(route==='materiais')body=<Materiais/>;
  else if(route==='questoes')body=<Builder go={go} mode="q"/>;
  else if(route==='simulados')body=<Builder go={go} mode="sim"/>;
  else if(route==='flash')body=<FlashcardsScreen go={go}/>;
  else if(route==='erros')body=<ErrorsScreen go={go}/>;
  else if(route==='plano')body=<Planning go={go}/>;
  else if(route==='desempenho')body=<Performance go={go} data={data}/>;
  else if(route==='tutor')body=<Tutor go={go}/>;
  else if(route==='home2')body=<Home2 go={go} data={data} mobile={mobile}/>;
  else if(route==='estacoes')body=<Stations go={go}/>;
  else if(route==='teoria2')body=<Theory2 go={go}/>;
  else if(route==='dupla')body=<Pair go={go}/>;
  else if(route==='peps')body=<Peps go={go}/>;
  else if(route==='paciente')body=<SimPatient go={go}/>;
  else if(route==='desempenho2')body=<Perf2 go={go} data={data}/>;
  else body=<ProfileScreen go={go}/>;
  const [t,s]=T[route]||T.home;
  return <AppShell route={route} go={go} theme={theme} setTheme={setTheme} phase={phase} setPhase={setPhase} title={(route==='home'||route==='home2')&&data==='novo'?'Bem-vindo, Joao.':t} sub={s}>
    {route==='flash'&&<div><SegmentedControl label="Revisar" value="flash" onChange={v=>go(v)} options={[{value:'flash',label:'Flashcards'},{value:'erros',label:'Caderno de erros'}]}/></div>}
    {route==='erros'&&<div><SegmentedControl label="Revisar" value="erros" onChange={v=>go(v)} options={[{value:'flash',label:'Flashcards'},{value:'erros',label:'Caderno de erros'}]}/></div>}
    {body}
    <div style={{display:'flex',gap:12,alignItems:'center',justifyContent:'center',flexWrap:'wrap',paddingTop:8,font:'var(--type-caption)',color:'var(--text-tertiary)'}}>
      <span>Estado dos dados:</span><SegmentedControl label="Estado dos dados" value={data} onChange={setData} options={[{value:'ativo',label:'Aluno ativo'},{value:'novo',label:'Aluno novo'}]}/>
      <a href="ui_kits/onboarding/index.html">Onboarding</a><a href="ui_kits/auth-billing/index.html">Login e planos</a>
    </div>
  </AppShell>;
}
export { App };
