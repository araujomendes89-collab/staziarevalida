// Cartão da questão no modelo "Tela de Questão": chips, caso clínico com a pergunta em negrito no fim (Proposta B), alternativas A–D com ícone de riscar,
// rodapé (marcar, pular, confirmar) e "Encontrou algum erro nesta questão?". Só apresentação: quem decide estados e chama o banco
// é a tela que usa (PracticeSession, resultado, caderno de erros). Nada aqui mostra gabarito, explicação ou fontes por conta própria:
// a correção entra pelo slot `answer`, que a tela só preenche DEPOIS de responder.
import React from "react";
import { Icon } from "../../../ds";
import { useSession } from "../../session.jsx";
import { FiguraAmpliada, FigurasDaQuestao } from "../QuestionFigures.jsx";
import { SupportTable } from "../SupportTable.jsx";
import { PreliminarySeal } from "../Correction.jsx";
import { areaLabel, areaOf, isStaziamed, montarEnunciado, questionRef } from "../format.js";
// leitor do aluno (sem TipTap): só com formatação que o banco mandou e que bate com o texto; sem ela, a tela é a de sempre
import ParagrafoRico from "../../editorPro/leitor/ParagrafoRico.jsx";
import { ricoDoCampo } from "../../../../shared/questions/formatacao";
import "./tela-questao.css";

export const OFFICIAL_NOTICE = "Não é questão oficial do Inep";

/** Chips do topo: área (cor da grande área), tema (só depois de responder), referência e o aviso das Questões Inéditas. */
export function QuestionChips({ question, topic = null, bookmarked = false }) {
  const area = areaOf(question.area);
  const staz = isStaziamed(question);
  return (
    <div className="tq-chips">
      <span className="tq-chip tq-chip--area" style={area ? { "--area": `var(${area.tone})` } : undefined}>
        <i aria-hidden="true" />
        {areaLabel(question.area)}
      </span>
      {topic && <span className="tq-chip">{topic}</span>}
      {staz ? (
        <span className="tq-chip tq-chip--ref">
          {question.number != null ? `Questão Inédita · nº ${question.number}` : "Questão Inédita"}
        </span>
      ) : (
        <span className="tq-chip tq-chip--ref">{questionRef(question)}</span>
      )}
      {bookmarked && (
        <span className="tq-chip tq-chip--mark">
          <Icon name="bookmark" size={14} /> Marcada
        </span>
      )}
      {staz && (
        <span className="tq-notice" title="Questão autoral da StaziaMed no estilo do Revalida">
          <Icon name="info" size={14} />
          {OFFICIAL_NOTICE}
        </span>
      )}
    </div>
  );
}

// Tamanho do texto (A− / A+, só no tablet e no celular; no computador não aparece): 0, 1 (padrão) ou 2. Fica só neste aparelho.
const FS_KEY = "stazia-tq-tamanho-texto";
function useTextSize() {
  const [size, setSize] = React.useState(() => {
    try {
      const saved = window.localStorage.getItem(FS_KEY);
      return saved === "0" ? 0 : saved === "2" ? 2 : 1;
    } catch {
      return 1;
    }
  });
  const change = (delta) =>
    setSize((current) => {
      const next = Math.max(0, Math.min(2, current + delta));
      try {
        window.localStorage.setItem(FS_KEY, String(next));
      } catch {
        /* sem armazenamento: vale só nesta tela */
      }
      return next;
    });
  return [size, change];
}

const ESTILO_ENUNCIADO = { textAlign: "justify", hyphens: "auto" };

/**
 * Enunciado no modelo da prova impressa (Proposta B, escolhida pelo dono em 19/10/2026): o rótulo "Caso clínico", o texto contínuo
 * e a pergunta (a última frase, quando dá para separar) em NEGRITO no fim do próprio texto, sem caixa. Figuras e tabelas entram no
 * ponto da prova quando a figura tem `apos` (format.js, montarEnunciado); sem isso, depois do caso e antes da pergunta.
 * A pergunta é o título da questão para leitores de tela (role="heading"; nível 1 na tela, `nivelTitulo` no cartão compacto).
 */
export function QuestionStatement({ question, hint = null, revealed = false, size = 1, changeSize = () => {}, nivelTitulo = 1 }) {
  // enunciado com formatação (editor profissional): vai inteiro, sem separar a pergunta (a formatação é do texto todo)
  const ricoEnunciado = ricoDoCampo(question.formatacao, "statement", question.statement);
  const images = Array.isArray(question.images) ? question.images : [];
  const blocos = ricoEnunciado
    ? [{ tipo: "rico" }, ...(images.length ? [{ tipo: "figuras", indices: images.map((_, i) => i) }] : []), ...(question.support ? [{ tipo: "apoio" }] : [])]
    : montarEnunciado({ statement: question.statement, images, support: question.support });
  const pergunta = blocos.find((b) => b.tipo === "pergunta")?.texto ?? "";
  const [caseOpen, setCaseOpen] = React.useState(false);
  const [ampliada, setAmpliada] = React.useState(null);
  // tablet/celular, depois de responder: o caso fica em 3 linhas com "Ver caso completo" (no computador o caso aparece inteiro).
  // Com o caso encolhido, a pergunta sai do parágrafo encolhido e fica num parágrafo próprio, sempre visível.
  const clamp = revealed && !caseOpen;
  const idBase = `tq-stem-${question.id}`;
  const corpo = blocos.filter((b) => b.tipo !== "pergunta");
  const ultimo = corpo[corpo.length - 1];
  const perguntaNoTexto = Boolean(pergunta) && ultimo?.tipo === "texto" && !clamp;
  // cada parágrafo do caso tem id (o primeiro, o de sempre): "Ver caso completo" controla todos
  const idDe = new Map();
  corpo.forEach((b) => (b.tipo === "texto" || b.tipo === "rico") && idDe.set(b, idDe.size === 0 ? idBase : `${idBase}-${idDe.size}`));
  const forte = (
    <strong className="tq-pergunta" role="heading" aria-level={nivelTitulo} lang="pt-BR">
      {pergunta}
    </strong>
  );
  const conteudo = corpo.map((bloco, n) => {
    if (bloco.tipo === "texto" || bloco.tipo === "rico") {
      const id = idDe.get(bloco);
      const comPergunta = perguntaNoTexto && bloco === ultimo;
      const paragrafo =
        bloco.tipo === "rico" ? (
          <div key={id} id={id} className="tq-stem tq-rico" data-clamp={clamp ? "true" : "false"} lang="pt-BR" style={ESTILO_ENUNCIADO}>
            <ParagrafoRico texto={question.statement} rico={ricoEnunciado} />
          </div>
        ) : (
          <p key={id} id={id} className="tq-stem" data-clamp={clamp ? "true" : "false"} lang="pt-BR" style={ESTILO_ENUNCIADO}>
            {bloco.texto}
            {comPergunta && " "}
            {comPergunta && forte}
          </p>
        );
      // "Ver caso completo" logo depois do primeiro parágrafo, como sempre
      if (id !== idBase || !revealed) return paragrafo;
      return (
        <React.Fragment key={id}>
          {paragrafo}
          <button type="button" className="tq-more" aria-expanded={caseOpen} aria-controls={[...idDe.values()].join(" ")} onClick={() => setCaseOpen(!caseOpen)}>
            {caseOpen ? "Mostrar menos" : "Ver caso completo"}
          </button>
        </React.Fragment>
      );
    }
    if (bloco.tipo === "figuras") return <FigurasDaQuestao key={`f${n}`} images={images} indices={bloco.indices} questionId={question.id} onOpen={setAmpliada} />;
    if (bloco.tipo === "apoio") return <SupportTable key={`a${n}`} support={question.support} />;
    return null;
  });
  return (
    <>
      <div className="tq-case">
        <div className="tq-case__head">
          <span className="tq-over">{pergunta ? "Caso clínico" : "Enunciado"}</span>
          <span role="group" aria-label="Tamanho do texto" className="tq-fs">
            <button type="button" onClick={() => changeSize(-1)} disabled={size === 0} aria-label="Diminuir texto">
              A−
            </button>
            <button type="button" onClick={() => changeSize(1)} disabled={size === 2} aria-label="Aumentar texto" data-plus="true">
              A+
            </button>
          </span>
        </div>
        {conteudo}
        {pergunta && !perguntaNoTexto && (
          <p className="tq-stem tq-stem--fim" lang="pt-BR" style={ESTILO_ENUNCIADO}>
            {forte}
          </p>
        )}
        <FiguraAmpliada figura={ampliada} onClose={() => setAmpliada(null)} />
      </div>
      {/* a dica do Tutor fica sempre fora do enunciado, logo depois dele */}
      {hint && <div className="tq-hint-solo">{hint}</div>}
    </>
  );
}

/** Texto da alternativa: com a formatação do banco (opcao.X.texto) quando ela bate com o texto; senão, o texto como sempre. */
function TextoDaAlternativa({ option, formatacao }) {
  const rico = ricoDoCampo(formatacao, `opcao.${option.id}.texto`, option.text);
  return rico ? <ParagrafoRico texto={option.text} rico={rico} className="tq-rico" /> : option.text;
}

/**
 * Alternativas. stateOf(id): idle | selected | correct | incorrect | dimmed. `revealed` trava tudo e mostra os selos
 * "Gabarito" e "Sua resposta". Riscar é só da tela (nada vai ao banco).
 */
export function Alternatives({ options, formatacao = null, stateOf, chosen = null, struck = [], revealed = false, locked = false, onPick, onStrike, strikeDisabled = () => false }) {
  return (
    <div role="radiogroup" aria-label="Alternativas" className="tq-alts">
      {options.map((option) => {
        const state = stateOf(option.id);
        const isStruck = struck.includes(option.id);
        const mine = chosen === option.id;
        const badge = !revealed ? null : state === "correct" ? (mine ? "Gabarito · Sua resposta" : "Gabarito") : mine ? "Sua resposta" : null;
        const lock = revealed || locked;
        return (
          <div key={option.id} className="tq-alt" data-state={state} data-struck={isStruck ? "true" : "false"}>
            <button type="button" className="tq-alt__main" role="radio" aria-checked={state === "selected" || (revealed && mine)} disabled={lock} onClick={() => onPick?.(option.id)}>
              <span className="tq-alt__letter">{option.id}</span>
              <span className="tq-alt__text">
                <TextoDaAlternativa option={option} formatacao={formatacao} />
              </span>
              {badge && (
                <span className="tq-alt__badge">
                  <Icon name={state === "correct" ? "circle-check" : "circle-alert"} size={20} />
                  <span className="tq-alt__badge-t">{badge}</span>
                </span>
              )}
            </button>
            {!revealed && (
              <button
                type="button"
                className="tq-alt__strike"
                aria-pressed={isStruck}
                aria-label={`${isStruck ? "Desfazer risco da alternativa" : "Riscar alternativa"} ${option.id}`}
                title={`${isStruck ? "Desfazer risco da alternativa" : "Riscar alternativa"} ${option.id}`}
                disabled={locked || strikeDisabled(option.id)}
                onClick={() => onStrike?.(option.id)}
              >
                <Icon name="strikethrough" size={18} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Rodapé: marcar para revisão, anterior (simulado), pular, dica de estado e a ação principal. */
export function QuestionFooter({ marked, onMark, onPrev = null, prevDisabled = false, onSkip = null, skipDisabled = false, hint = "", primary }) {
  return (
    <div className="tq-foot" role="toolbar" aria-label="Ferramentas da questão">
      {onMark && (
        <button type="button" className="tq-ghost" onClick={onMark} aria-pressed={marked}>
          <Icon name="bookmark" size={18} />
          {marked ? "Marcada para revisão" : "Marcar para revisão"}
        </button>
      )}
      {onPrev && (
        <button type="button" className="tq-ghost" onClick={onPrev} disabled={prevDisabled}>
          <Icon name="arrow-left" size={18} />
          Anterior
        </button>
      )}
      {onSkip && (
        <button type="button" className="tq-ghost" onClick={onSkip} disabled={skipDisabled}>
          <Icon name="skip-forward" size={18} />
          Pular
        </button>
      )}
      <span className="tq-foot__sp" />
      {hint && (
        <span className="tq-foot__hint" role="status">
          {hint}
        </span>
      )}
      <button type="button" className="tq-primary" onClick={primary.onClick} disabled={primary.disabled} aria-busy={primary.loading || undefined}>
        {primary.label}
        <Icon name="arrow-right" size={18} />
      </button>
    </div>
  );
}

const REASONS = ["Gabarito incorreto", "Erro no enunciado", "Alternativas ambíguas", "Explicação com erro", "Fonte desatualizada", "Outro"];
const REPORT_SCREEN = "Resolvendo questões";

function reportFailure(error) {
  const message = String(error?.message ?? "");
  if (/pelo menos 10 letras|no máximo 1000|5 relatos nas últimas 24 horas|Entre na sua conta/.test(message)) return message;
  if (error?.code === "network" || /fetch|network/i.test(message)) return "Falha de conexão. Verifique sua internet e tente de novo.";
  return "Não foi possível enviar agora. Tente de novo em instantes.";
}

/**
 * "Encontrou algum erro nesta questão? Nos avise de um erro": usa o envio de relatos que o app já tem (app_report_problem); a equipe lê em
 * Configurações > Relatos dos alunos. A mensagem leva a referência da questão (sem código interno).
 */
export function ReportQuestion({ question }) {
  const { backend } = useSession();
  const [phase, setPhase] = React.useState("idle"); // idle | open | sent
  const [reason, setReason] = React.useState(null);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [failure, setFailure] = React.useState(null);
  const ref = questionRef(question);
  // as fontes das Questões Inéditas não aparecem ao aluno: "Fonte desatualizada" só para as oficiais
  const reasons = isStaziamed(question) ? REASONS.filter((r) => r !== "Fonte desatualizada") : REASONS;
  const close = () => {
    setPhase("idle");
    setReason(null);
    setText("");
    setFailure(null);
  };
  const send = async (event) => {
    event.preventDefault();
    if (!reason || sending) return;
    setSending(true);
    setFailure(null);
    const details = text.trim() ? `: ${text.trim()}` : ".";
    try {
      await backend.rpc("app_report_problem", { p_screen: REPORT_SCREEN, p_message: `Erro na questão ${ref}. ${reason}${details}`.slice(0, 1000) });
      setPhase("sent");
    } catch (error) {
      setFailure(reportFailure(error));
    }
    setSending(false);
  };
  return (
    <div className="tq-report">
      {phase === "idle" && (
        <div className="tq-report__row">
          <span className="tq-report__ask">
            <Icon name="flag" size={16} />
            Encontrou algum erro nesta questão?
          </span>
          <button type="button" className="tq-link" onClick={() => setPhase("open")} aria-expanded="false">
            Nos avise de um erro
          </button>
        </div>
      )}
      {phase === "open" && (
        <form className="tq-form" onSubmit={send} aria-label="Reportar erro na questão">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--tq-ink)" }}>Reportar erro na questão</div>
              <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 2 }}>Nossa equipe revisa cada aviso.</div>
            </div>
            <button type="button" className="tq-exit" onClick={close} aria-label="Fechar" style={{ width: 36, height: 36 }}>
              <Icon name="x" size={18} />
            </button>
          </div>
          <fieldset>
            <legend>Qual o problema?</legend>
            <div className="tq-reasons">
              {reasons.map((label) => (
                <button key={label} type="button" className="tq-reason" aria-pressed={reason === label} onClick={() => setReason(reason === label ? null : label)}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            Detalhes (opcional)
            <textarea rows={3} maxLength={800} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: o prazo citado na explicação diverge da portaria vigente." />
          </label>
          {failure && (
            <div role="alert" className="tq-fail">
              {failure}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="tq-ghost" onClick={close}>
              Cancelar
            </button>
            <button type="submit" className="tq-send" disabled={!reason || sending}>
              Enviar aviso
            </button>
          </div>
        </form>
      )}
      {phase === "sent" && (
        <div role="status" className="tq-thanks">
          <Icon name="circle-check" size={18} />
          Obrigado! Recebemos seu aviso e vamos revisar a questão.
        </div>
      )}
    </div>
  );
}

/**
 * Cartão completo. `answer` (a correção, só depois de responder) e `aside` (o painel lateral) chegam prontos da tela.
 * `banner`: avisos e erros acima do enunciado.
 */
export function QuestionSheet({ question, revealed = false, topic = null, bookmarked = false, banner = null, hint = null, alternatives, answer = null, footer = null, report = null, compact = false }) {
  const [size, changeSize] = useTextSize();
  return (
    <section className={`tq-sheet${compact ? " tq-sheet--static" : ""}`} aria-label="Questão" data-fs={size}>
      <QuestionChips question={question} topic={revealed ? topic : null} bookmarked={bookmarked} />
      {question.preliminary && (
        <div className="tq-flag">
          <PreliminarySeal info={question.preliminary} />
        </div>
      )}
      {banner && <div className="tq-err">{banner}</div>}
      <QuestionStatement question={question} hint={hint} revealed={revealed} size={size} changeSize={changeSize} nivelTitulo={compact ? 2 : 1} />
      {alternatives}
      {revealed && answer}
      {footer}
      {report}
    </section>
  );
}
