// PRÉVIA sem login (porta 31994): cada botão entrega ao provedor das comemorações exatamente o que o banco devolveria
// (bloco `play` da resposta, placar do simulado, aula, flashcards, fechamento da liga). As regras são as do app.
import React from "react";
import { createRoot } from "react-dom/client";
import "../../../../ds/styles.css";
import { Button, Card, Switch } from "../../../../ds";
import { CelebracoesProvider, diaLocal, useCelebracoesApp, useSegurarCelebracoes } from "../CelebracoesProvider.jsx";
import { CelebracoesPreferencias } from "../CelebracoesPreferencias.jsx";
import { eventoDaAula, eventoDoSimulado, eventoDosFlashcards, eventosDaResposta, serieDeAcertos } from "../eventos.js";
import { definirLiga, definirMaiorSequencia, definirMostrarSequencia } from "../../../session.jsx";

const MEDALHAS = [
  { name: "Primeiros Passos", description: "10 questões respondidas.", xp: 10, coins: 5 },
  { name: "Mira Boa", description: "80% de acertos em 20 questões.", xp: 25, coins: 10 },
  { name: "Maratonista", description: "100 questões na semana.", xp: 60, coins: 30 },
];
let contador = 0;
const unico = (p) => `${p}-${Date.now().toString(36)}-${(contador += 1)}`;
const semanaPassada = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); // segunda-feira da semana passada
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function Grupo({ titulo, nota, children }) {
  return (
    <Card padding={20} style={{ borderRadius: 20 }}>
      <h2 style={{ margin: 0, font: "var(--type-h4)" }}>{titulo}</h2>
      {nota && <p style={{ margin: "4px 0 12px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{nota}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
    </Card>
  );
}
const B = ({ children, onClick, variant = "secondary" }) => (
  <Button size="sm" variant={variant} onClick={onClick}>
    {children}
  </Button>
);

function Previa() {
  const cel = useCelebracoesApp();
  const [primeiraVez, setPrimeiraVez] = React.useState(true);
  const [treino, setTreino] = React.useState(false);
  const [simulado, setSimulado] = React.useState(false);
  const [seguidas, setSeguidas] = React.useState(0);
  const [mostrarSeq, setMostrarSeq] = React.useState(true);
  const sessao = React.useRef("previa-1");
  useSegurarCelebracoes(`sessao:${sessao.current}`, "atividade", treino);
  useSegurarCelebracoes(`simulado:${sessao.current}`, "simulado", simulado);

  /** "Cada clique como se fosse o primeiro do dia": zera limites do dia e o que já foi comemorado (o histórico fica). */
  const antes = () => primeiraVez && !treino && !simulado && cel.reiniciar({ manterHistorico: true });
  const resposta = (play, acertou) => {
    antes();
    const s = serieDeAcertos(seguidas, { acertou, sessao: sessao.current });
    setSeguidas(s.seguidas);
    // igual ao treino de verdade (PracticeSession): resposta + série de acertos num envio só
    cel.enviar([...eventosDaResposta(play, { acertou, hoje: diaLocal() }), ...(s.evento ? [s.evento] : [])]);
  };
  const dia = (n) => {
    antes();
    definirMaiorSequencia(Math.max(21, n)); // o "banco" da prévia: a maior sequência nunca é menor que a atual
    cel.enviarResposta({ xp: { total: 12, valid: true }, streak_incremented: true, stats: { streak: n } }, {});
  };
  const liga = (h) => {
    antes();
    definirLiga({ starts_on: semanaPassada(), weekly_xp: 840, ...h });
    void cel.verificarLiga({ forcar: true });
  };
  const comecar = (tipo) => {
    sessao.current = unico("sessao");
    setSeguidas(0);
    if (primeiraVez) cel.reiniciar({ manterHistorico: true });
    if (tipo === "simulado") setSimulado(true);
    else setTreino(true);
  };

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px 160px", display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="sm-overline" style={{ color: "var(--text-brand)" }}>Prévia sem login · porta 31994</span>
        <h1 style={{ margin: 0, font: "var(--type-h2)" }}>Comemorações do Stazi dentro do app</h1>
        <p style={{ margin: 0, font: "var(--type-body)", color: "var(--text-secondary)", maxWidth: 760 }}>
          Cada botão entrega ao app exatamente o que o banco devolveria. As regras são as de verdade: nada interrompe uma questão, a mesma conquista não volta como nova,
          uma comemoração grande por dia, e as escolhas do aluno (sons, voz da Durona, animações reduzidas) valem na hora. O som só toca depois do primeiro toque na página.
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 6 }}>
          <Switch checked={primeiraVez} onChange={(e) => setPrimeiraVez(e.target.checked)} label="Cada clique como se fosse o primeiro do dia" description="Desligado: valem os limites reais do dia (a 2ª grande vira média, a mesma coisa não repete)." />
          <Switch
            checked={mostrarSeq}
            onChange={(e) => {
              setMostrarSeq(e.target.checked);
              definirMostrarSequencia(e.target.checked);
              cel.reiniciar({ manterHistorico: true });
            }}
            label="“Mostrar sequência” ligado na Arena"
            description="Desligado (Conta → Minha Stazia Arena), a sequência não é comemorada."
          />
        </div>
      </header>

      <Grupo
        titulo="1. Treino em andamento"
        nota={treino ? `Treino aberto: só a faixa pequena do acerto/erro aparece; o resto espera você terminar. Acertos seguidos: ${seguidas}.` : "Abra um treino para ver a regra de não interromper a questão."}
      >
        {!treino ? (
          <B variant="primary" onClick={() => comecar("treino")}>
            Abrir treino
          </B>
        ) : (
          <>
            <B onClick={() => resposta({ xp: { total: 12, valid: true } }, true)}>Acertar questão</B>
            <B onClick={() => resposta({ xp: { total: 2, valid: true } }, false)}>Errar questão</B>
            <B onClick={() => resposta({ xp: { total: 12, valid: true }, achievements_unlocked: [{ slug: unico("medalha"), ...MEDALHAS[1] }] }, true)}>Acertar + medalha nova</B>
            <B onClick={() => resposta({ xp: { total: 12, valid: true }, level_up: { from: "iniciante", to: "explorador" } }, true)}>Acertar + subir de nível</B>
            <B onClick={() => resposta({ xp: { total: 12, valid: true }, bonus: [{ type: "MISSION_COMPLETED", xp: 15, meta: { mission: unico("m"), period: "daily" } }] }, true)}>Acertar + missão cumprida</B>
            <B onClick={() => resposta({ xp: { total: 12, valid: true }, streak_incremented: true, stats: { streak: 7 } }, true)}>Acertar + fechar o dia (7 dias)</B>
            <B variant="primary" onClick={() => setTreino(false)}>
              Terminar treino
            </B>
          </>
        )}
      </Grupo>

      <Grupo titulo="2. Simulado" nota={simulado ? "Simulado aberto: nenhuma comemoração aparece até o resultado." : "No simulado nada aparece durante; o placar é comemorado no fim."}>
        {!simulado ? (
          <B variant="primary" onClick={() => comecar("simulado")}>
            Abrir simulado
          </B>
        ) : (
          [
            [82, "Terminar com 82%"],
            [55, "Terminar com 55%"],
            [30, "Terminar com 30%"],
          ].map(([pct, rotulo]) => (
            <B
              key={pct}
              variant="primary"
              onClick={() => {
                cel.enviar(eventoDoSimulado({ id: sessao.current, kind: "simulado", result: { correct: pct, total: 100, answered: 100 } }));
                setSimulado(false);
              }}
            >
              {rotulo}
            </B>
          ))
        )}
      </Grupo>

      <Grupo titulo="3. Sequência de dias (o dia fechou numa questão)" nota="Dias 2, 3 e comuns são faixas pequenas; 7, 14, 30, 60, 100 e 365 são marcos.">
        {[1, 2, 3, 12, 7, 14, 30, 60, 100, 365].map((n) => (
          <B key={n} onClick={() => dia(n)}>
            {n === 1 ? "1º dia" : n === 12 ? "Dia comum (12)" : `${n} dias`}
          </B>
        ))}
      </Grupo>

      <Grupo titulo="4. Progresso">
        <B onClick={() => (antes(), cel.enviarResposta({ level_up: { from: "iniciante", to: "explorador" } }, {}))}>Novo nível</B>
        {MEDALHAS.map((m) => (
          <B key={m.name} onClick={() => (antes(), cel.enviarResposta({ achievements_unlocked: [{ slug: unico("medalha"), ...m }] }, {}))}>
            Medalha: {m.name}
          </B>
        ))}
        <B onClick={() => (antes(), cel.enviarResposta({ bonus: [{ type: "MISSION_COMPLETED", xp: 15, meta: { mission: unico("m"), period: "daily" } }] }, {}))}>Missão cumprida</B>
        <B onClick={() => (antes(), cel.enviarResposta({ bonus: [{ type: "DAILY_MISSIONS_COMPLETED", xp: 50 }] }, {}))}>Todas as missões do dia</B>
        <B onClick={() => (antes(), cel.enviarResposta({ bonus: [{ type: "DAILY_GOAL_COMPLETED", xp: 25 }] }, {}))}>Meta do dia</B>
        <B onClick={() => (antes(), cel.enviar(eventoDaAula({ id: unico("aula"), title: "Sepse e choque séptico" }, 30)))}>Aula concluída</B>
        <B onClick={() => (antes(), cel.enviar(eventoDosFlashcards(24, diaLocal())))}>Flashcards do dia</B>
      </Grupo>

      <Grupo titulo="5. Liga da semana (fechamento confirmado pelo banco)" nota="A promoção só é comemorada depois que o banco fecha a semana; cada semana é comemorada uma vez.">
        {[
          ["bronze", "Subiu para Prata"],
          ["prata", "Subiu para Ouro"],
          ["ouro", "Subiu para Platina"],
          ["platina", "Subiu para Diamante"],
          ["diamante", "Subiu para Elite"],
          ["elite", "Subiu para Revalida Master"],
        ].map(([de, rotulo]) => (
          <B key={de} onClick={() => liga({ league: de, position: 4, outcome: "promoted" })}>
            {rotulo}
          </B>
        ))}
        <B onClick={() => liga({ league: "ouro", position: 1, outcome: "stayed" })}>1º lugar</B>
        <B onClick={() => liga({ league: "ouro", position: 2, outcome: "stayed" })}>Pódio (2º)</B>
        <B onClick={() => liga({ league: "ouro", position: 12, outcome: "stayed" })}>Permaneceu</B>
        <B onClick={() => liga({ league: "ouro", position: 27, outcome: "relegated" })}>Rebaixado</B>
      </Grupo>

      <Card padding={20} style={{ borderRadius: 20 }}>
        <CelebracoesPreferencias />
      </Card>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <CelebracoesProvider rota="/conta" ligaAoAbrir={false}>
    <Previa />
  </CelebracoesProvider>
);
