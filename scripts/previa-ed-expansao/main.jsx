// Prévia da EXPANSÃO do editor profissional: as telas de verdade da Administração e do aluno, ligadas ao banco de teste (PGlite).
// Abas da equipe usam o administrador de teste; abas "como o aluno vê" usam a aluna de teste. Endereço: ?aba=<id>
import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "@raiz/src/novo/ds/styles.css";
import { quem } from "./sessaoTeste.jsx";
import { QuestionEditor } from "@raiz/src/novo/app/admin/AdminQuestions.jsx";
import { QuestoesStaziaMed } from "@raiz/src/novo/app/admin/content/questoes/QuestoesStaziaMed.jsx";
import { PracticeSession } from "@raiz/src/novo/app/practice/PracticeSession.jsx";
import { AdminUpdates } from "@raiz/src/novo/app/admin/AdminUpdates.jsx";
import { UpdateDetail } from "@raiz/src/novo/app/study/UpdatesScreen.jsx";
import { AdminPodcasts } from "@raiz/src/novo/app/admin/AdminPodcasts.jsx";
import { MateriaisUnidade } from "@raiz/src/novo/app/admin/content/unidades/Materiais.jsx";
import { AdminLessons } from "@raiz/src/novo/app/admin/AdminLessons.jsx";
import { TemaAula } from "@raiz/src/novo/app/study/TemaAula.jsx";

const nada = () => {};
const go = new Proxy(nada, { get: () => nada });

const ABAS = [
  { id: "questao", rotulo: "Questão oficial (equipe)", quem: "equipe", tela: (d) => <QuestionEditor id={d.questao} onClose={nada} onSaved={nada} /> },
  { id: "ineditas", rotulo: "Inéditas (equipe)", quem: "equipe", tela: () => <QuestoesStaziaMed isAdmin isStaff reviewerAreas={["PEDIATRIA"]} go={go} /> },
  { id: "aluno-questao", rotulo: "Questão (aluno)", quem: "aluno", rota: (d) => `/treino?s=${d.sessao}`, tela: () => <PracticeSession go={go} /> },
  { id: "atualizacoes", rotulo: "Atualizações (equipe)", quem: "equipe", tela: () => <AdminUpdates /> },
  { id: "aluno-atualizacao", rotulo: "Atualização (aluno)", quem: "aluno", tela: (d) => <UpdateDetail slug={d.atualizacao} go={go} onBack={nada} lidas={[]} onToggleRead={nada} /> },
  { id: "podcasts", rotulo: "Podcasts (equipe)", quem: "equipe", tela: () => <AdminPodcasts /> },
  { id: "materiais", rotulo: "Central › Materiais (equipe)", quem: "equipe", tela: (d) => <MateriaisUnidade versionId={d.versao} secoes={[]} claims={[]} canEdit refresh={0} onChanged={nada} /> },
  { id: "aulas", rotulo: "Editar aula (equipe)", quem: "equipe", tela: () => <AdminLessons /> },
  { id: "aluno-aula", rotulo: "Aula (aluno)", quem: "aluno", tela: () => <TemaAula tema={{ id: "GR-001", area: "CLINICA_MEDICA", name: "Hipertensão" }} mobile={false} onBack={nada} go={go} onProgresso={nada} /> },
];

function Previa() {
  const [aba, setAba] = React.useState(() => new URLSearchParams(location.search).get("aba") || "questao");
  const [dados, setDados] = React.useState(null);
  React.useEffect(() => {
    fetch("/__previa/dados").then((r) => r.json()).then(setDados, (e) => setDados({ erros: [String(e)] }));
  }, []);
  const atual = ABAS.find((a) => a.id === aba) ?? ABAS[0];
  quem.atual = atual.quem;
  const trocar = (id) => {
    setAba(id);
    history.replaceState(null, "", `?aba=${id}`);
  };
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-app)", color: "var(--text-primary)", padding: "16px clamp(12px, 3vw, 32px)", fontFamily: "var(--font-sans)" }}>
      <header style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <strong style={{ font: "var(--type-h4)" }}>Prévia — editor profissional nas outras abas</strong>
        <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Banco de TESTE em memória (sem Supabase, sem chaves). Nada vai para o app.</span>
        <nav style={{ display: "flex", gap: 6, flexWrap: "wrap", width: "100%" }}>
          {ABAS.map((a) => (
            <button key={a.id} type="button" className={`sm-btn sm-btn--sm ${aba === a.id ? "sm-btn--primary" : "sm-btn--secondary"}`} onClick={() => trocar(a.id)}>
              {a.rotulo}
            </button>
          ))}
        </nav>
        {dados?.erros?.length > 0 && <div role="alert" style={{ color: "var(--danger-text)", fontSize: 12 }}>Dados de teste com falha: {dados.erros.join(" · ")}</div>}
      </header>
      {!dados ? (
        <p>Preparando o banco de teste (aplica todas as migrações; leva alguns segundos)…</p>
      ) : (
        <Suspense fallback={<p>Carregando…</p>}>
          <MemoryRouter key={aba} initialEntries={[atual.rota ? atual.rota(dados) : "/"]}>
            <div data-aba={aba}>{atual.tela(dados)}</div>
          </MemoryRouter>
        </Suspense>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Previa />);
