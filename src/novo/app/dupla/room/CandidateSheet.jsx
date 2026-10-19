// Folha do candidato e impressos (Room.jsx:289-308 do protótipo de 11/10). O enunciado (instruções + relato) e cada impresso
// aparecem como IMAGEM com "Ampliar" (tela cheia, − e +, Esc fecha), vindos da Montagem de estações pela rota da sala
// (`actions.printUrl`). Onde não houver imagem, o texto é a folha.
// TODO(dono): imagens da folha do candidato e dos impressos de cada estação vêm da Montagem (`station_assets`, chave
// `candidate_sheet` e a do impresso em `pressing_assets`); enquanto não houver, o candidato lê o texto.
// Nunca escreve o nome da estação (o tema é só do avaliador até o resultado).
import React from "react";
import { Badge, Card, Icon, PrintImage, PrintItem } from "../../../ds";
import { formatDecimal } from "../../../ds/format.js";
import { isTaskNote, splitTasks } from "../content.js";
import { Scene } from "./parts.jsx";
import { relatoNaFolha, tarefasAjustadas } from "../../../../shared/dupla/tarefasRelato";
import { cenarioEObservacao, cenarioInep, notaInep } from "../../../../shared/dupla/folhaCandidato";

/**
 * O impresso está NA FOLHA do candidato (o relato do caso, sem número)? O servidor manda `in_sheet`. Sem ele (conteúdo antigo),
 * todo impresso inicial era o relato, que ficava na folha. O impresso visível desde o início que NÃO está na folha (monitor e
 * bandeja "em cima da maca", decisão do dono de 17/10) aparece sozinho na lista de impressos, numerado com os liberáveis.
 */
export const inSheet = (p) => (typeof p?.in_sheet === "boolean" ? p.in_sheet : Boolean(p?.initially_visible));

const overline = { font: "var(--type-overline)", letterSpacing: "var(--tracking-overline)", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 10 };

/** Endereço da imagem pela rota da sala; `null` enquanto carrega ou quando não há imagem (aí o texto aparece). */
export function useImageUrl(id, hasImage, actions) {
  const [state, setState] = React.useState({ id: null, url: null, done: false });
  React.useEffect(() => {
    let alive = true;
    if (!hasImage) {
      setState({ id, url: null, done: true });
      return undefined;
    }
    setState({ id, url: null, done: false });
    Promise.resolve(actions.printUrl(id)).then(
      (url) => alive && setState({ id, url: url || null, done: true }),
      () => alive && setState({ id, url: null, done: true })
    );
    return () => {
      alive = false;
    };
  }, [id, hasImage, actions]);
  return state.id === id ? state : { id, url: null, done: !hasImage };
}

/** Imagem do impresso (com "Ocultar" para o candidato) ou, sem imagem, o texto do impresso. */
export function PressingMedia({ pressing, actions, canHide = false }) {
  const img = useImageUrl(pressing.id, Boolean(pressing.has_image), actions);
  if (img.url) return <PrintImage src={img.url} alt={`Impresso ${pressing.display_number} · ${pressing.name}`} canHide={canHide} />;
  if (!img.done) return <div aria-busy="true" style={{ minHeight: 40 }} />;
  return <div style={{ whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>{pressing.content}</div>;
}

/**
 * Texto da folha, com os mesmos títulos da imagem (folha-1.2, opção B "Igual ao INEP" aprovada em 17/10): INSTRUÇÕES AO PARTICIPANTE,
 * CENÁRIO DE ATENDIMENTO, DESCRIÇÃO DO CASO (com "Nos N minutos de duração da estação, você deverá executar as seguintes tarefas:"
 * e as tarefas numeradas dentro) e o aviso ATENÇÃO em destaque, sem o prefixo "Observação:". O texto da estação é o mesmo. Com o relato
 * na folha, as tarefas citam "o relato do caso clínico (na sua folha, acima)" em vez de "impresso 1" (decisão do dono de 17/10; o
 * texto guardado não muda).
 */
const blocoTitulo = { margin: "0 0 12px", font: "700 var(--text-base)/1.3 var(--font-sans)", letterSpacing: "var(--tracking-overline)", color: "var(--text-brand)" };

function SheetText({ station, withReport }) {
  const tasks = splitTasks(tarefasAjustadas(station.doctor_tasks, withReport));
  const minutes = (station.duration_ms ?? 0) / 60000;
  const { cenario, observacao } = cenarioEObservacao({ cenario: station.doctor_scene });
  const { atendimento, descricao, temDescricao } = cenarioInep(cenario);
  const notes = tasks.filter(isTaskNote);
  const steps = tasks.filter((t) => !isTaskNote(t));
  const sceneStyle = { font: "400 var(--text-md)/1.6 var(--font-sans)", color: "var(--text-primary)" };
  let n = 0;
  return (
    <>
      <h2 style={{ margin: 0, textAlign: "center", font: "700 var(--text-lg)/1.3 var(--font-sans)", color: "var(--text-primary)" }}>
        INSTRUÇÕES AO PARTICIPANTE
      </h2>
      {atendimento.length > 0 && (
        <Card padding={28} style={{ boxShadow: "var(--shadow-sm)" }}>
          <h3 style={blocoTitulo}>CENÁRIO DE ATENDIMENTO</h3>
          <Scene blocks={atendimento} style={sceneStyle} />
        </Card>
      )}
      {(temDescricao || steps.length > 0) && (
        <Card padding={28} style={{ boxShadow: "var(--shadow-sm)" }}>
          {temDescricao && <h3 style={blocoTitulo}>DESCRIÇÃO DO CASO</h3>}
          <Scene blocks={descricao} style={sceneStyle} />
          {steps.length > 0 && (
            <>
              <h4 style={{ margin: descricao.length ? "18px 0 14px" : "0 0 14px", font: "600 var(--text-base)/1.3 var(--font-sans)", color: "var(--text-primary)" }}>
                Nos {Number.isInteger(minutes) ? minutes : formatDecimal(minutes, 1)} minutos de duração da estação, você deverá executar as seguintes tarefas:
              </h4>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {steps.map((t, i) => {
                  n += 1;
                  return (
                    <li key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", color: "var(--text-primary)" }}>
                      <span style={{ font: "600 var(--text-xs) var(--font-mono)", color: "var(--text-brand)" }}>{String(n).padStart(2, "0")}</span>
                      {t}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </Card>
      )}
      {observacao && (
        <Card padding={28} style={{ boxShadow: "var(--shadow-sm)" }}>
          <h3 style={blocoTitulo}>{observacao.titulo}</h3>
          {/* linhas com "•" viram marcadores; as outras, parágrafos */}
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {observacao.linhas.map((l, i) => (
              <li key={i} style={{ ...sceneStyle, display: "flex", gap: 10 }}>
                {/^[•▪◦*-]/.test(l) && <span aria-hidden="true" style={{ color: "var(--text-brand)" }}>•</span>}
                <span>{l.replace(/^[•▪◦*-]\s*/, "")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {notes.map((note, i) => (
        <p key={i} style={{ margin: 0, textAlign: "center", font: "700 var(--text-base)/1.7 var(--font-sans)", color: "var(--text-primary)" }}>
          {notaInep(note).map((frase, j) => {
            const m = /^(ATENÇÃO!?)(.*)$/.exec(frase);
            return (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                {m ? (
                  <>
                    <span style={{ color: "var(--text-brand)" }}>{m[1]}</span>
                    {m[2]}
                  </>
                ) : (
                  frase
                )}
              </React.Fragment>
            );
          })}
        </p>
      ))}
    </>
  );
}

/**
 * Folha do candidato: a imagem ÚNICA (instruções e relato do caso, como a do protótipo de 11/10) quando a Montagem a enviou;
 * senão o texto completo: cenário, tarefas e os impressos iniciais (visíveis desde o início, sem liberação), cada um em imagem
 * ou texto. Com a imagem única os impressos iniciais não se repetem embaixo (já estão nela).
 * TODO(dono): confirmar com a Montagem que a imagem "candidate_sheet" sempre traz o relato junto.
 */
export function CandidateSheet({ station, content, actions }) {
  const sheet = useImageUrl("candidate_sheet", Boolean(station.candidate_sheet?.has_image), actions);
  const initial = (content.pressings || []).filter(inSheet);
  const withReport = relatoNaFolha(content.pressings);
  return (
    <div className="dupla-cand__col">
      {sheet.url ? (
        <div className="dupla-sheet">
          <Card padding={8}>
            <PrintImage
              src={sheet.url}
              alt={withReport ? "Instruções ao participante e relato do caso clínico" : "Instruções ao participante"}
              baseWidth={1100} label="Ampliar imagem da estação" />
          </Card>
        </div>
      ) : sheet.done ? (
        <SheetText station={station} withReport={withReport} />
      ) : (
        <div aria-busy="true" style={{ minHeight: 120 }} />
      )}
      {!sheet.url && sheet.done && initial.map((p) => (
        <Card key={p.id} padding={20}>
          {/* sem número: o relato faz parte da folha; os impressos numerados (1, 2, 3) são só os liberados */}
          <div style={overline}>{p.name || "Relato do caso"}</div>
          <PressingMedia pressing={p} actions={actions} />
        </Card>
      ))}
    </div>
  );
}

/** Impresso liberado (ou visível desde o início): abre e fecha (aberto ao chegar), com a imagem ampliável e "Ocultar". */
function ReleasedPrint({ pressing, actions }) {
  const [open, setOpen] = React.useState(true);
  const label = `Impresso ${pressing.display_number} · ${pressing.name}`;
  return (
    <div style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <button
        type="button"
        className="f2-toque"
        aria-expanded={open}
        aria-label={`${open ? "Fechar" : "Abrir"} ${label}`}
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "12px 0",
          border: 0,
          background: "transparent",
          color: "var(--text-primary)",
          cursor: "pointer",
          textAlign: "left",
          font: "600 var(--text-sm) var(--font-sans)",
        }}
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size={16} />
        <Icon name="lock-open" size={15} />
        <span style={{ flex: 1 }}>
          {label}
          {pressing.initially_visible && <span style={{ marginLeft: 8, font: "500 var(--text-xs) var(--font-sans)", color: "var(--text-secondary)" }}>disponível desde o início</span>}
        </span>
        <span style={{ font: "600 var(--text-xs) var(--font-sans)", color: "var(--text-secondary)" }}>{open ? "Fechar" : "Abrir"}</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 12 }}>
          <PressingMedia pressing={pressing} actions={actions} canHide />
        </div>
      )}
    </div>
  );
}

/**
 * Lista "Impressos" do candidato, numerada 1, 2, 3: os visíveis desde o início (já abertos, sem liberação) e os que o avaliador
 * liberou; os não liberados aguardam. O relato do caso fica na folha e não entra aqui.
 */
export function CandidatePrints({ content, actions }) {
  const total = content.pressing_count ?? 0;
  const released = (content.pressings || []).filter((p) => !inSheet(p));
  return (
    <Card padding="12px 16px">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 0 8px" }}>
        <h2 style={{ margin: 0, font: "600 var(--text-base)/1.3 var(--font-sans)", color: "var(--text-primary)" }}>Impressos</h2>
        <Badge size="sm" tone="brand">{released.length === 1 ? "1 liberado" : `${released.length} liberados`}</Badge>
      </div>
      {Array.from({ length: total }, (_, k) => k + 1).map((index) => {
        const p = released.find((x) => x.display_number === index);
        return p ? <ReleasedPrint key={p.id} pressing={p} actions={actions} /> : <PrintItem key={index} index={index} title="Aguardando liberação" />;
      })}
    </Card>
  );
}
