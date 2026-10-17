// A aula dentro do Grande Tema (aluno). Lê app_tema_aula (só aula PUBLICADA pela Central; sem PDF, fonte, afirmação ou código do tema).
// Anotações (uma por seção, migração 9994) e caixas marcadas: app_lesson_notes / app_lesson_section_note_save / app_lesson_checks_save (por aluno). Imagens (Revisão da Aula e flashcards ilustrados)
// vêm do servidor como bytes (sem endereço de arquivo, sem botão de baixar, sem arrastar nem menu de imagem).
// Padrão visual único para todas as aulas: docs/aula-layout.md (regras de cada bloco em aulaPadrao.js).
import React from "react";
import { Banner, Button, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { LoadError, Loading, messageOf, useLoad } from "../admin/common.jsx";
import { TutorButton } from "../tutor/TutorDrawer.jsx";
import { temaVars } from "./temaCores.js";
import { ProtectedImage, noMenu, preCarregarCartao, useVersoPronto } from "./AulaImagem.jsx";
import { blocoDe, boxOf, celula, cleanHeading, dividirFrases, minutosDeLeitura, mudanca, progressoDaAula, secaoTipo, sobretitulo } from "./aulaPadrao.js";
import "./aula.css";
import { TextoRico } from "../textoRico/TextoRico.jsx";
import { ricoValido } from "../../../shared/docRico";
import ParagrafoRico from "../editorPro/leitor/ParagrafoRico.jsx";
import { ricoDoMaterial, ricoDoPonto } from "../../../shared/aulas/camposRicos";
import { MiniTutor, contextoDaAula } from "../tutor/mini";

export { boxOf };

const monthYear = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { month: "2-digit", year: "numeric" }).format(new Date(iso)) : null);
const reduzMovimento = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Cabeçalho de seção: número (ou ícone) na cor do tema, sobretítulo e título. */
function Head({ n, icon, over, title, done }) {
  return (
    <div className="al-sechead">
      <span className="al-secnum" aria-hidden="true">{n != null ? n : <Icon name={icon} size={20} />}</span>
      <div className="al-sechead-t">
        {over && <span className="al-over">{over}</span>}
        <h2 className="al-sectab">{title}</h2>
      </div>
      {done && <span className="al-tag-done"><Icon name="check" size={14} />Estudada</span>}
    </div>
  );
}

const BOX_ICON = { peg: "triangle-alert", atencao: "circle-alert", nota: "lightbulb" };

/** Parágrafo comum ou caixa (Pegadinha, Atenção, Tome nota). */
function Bloco({ texto, estilo, rico }) {
  const b = blocoDe(texto, estilo);
  if (b.kind === "p") {
    if (ricoValido(texto, rico)) {
      return <ParagrafoRico texto={texto} rico={rico} className="al-p al-p-rico" />;
    }
    return <p className="al-p"><TextoRico texto={texto} /></p>;
  }
  return (
    <div className={`al-box al-${b.kind}`} role="note">
      <span className="al-box-ico" aria-hidden="true"><Icon name={BOX_ICON[b.kind]} size={18} /></span>
      <div className="al-box-c">
        <div className="h">{b.title}</div>
        <div className="t"><TextoRico texto={b.body} /></div>
      </div>
    </div>
  );
}

function Mudanca({ texto }) {
  const m = mudanca(texto);
  return (
    <article className="al-mud">
      <div className="al-mud-h">
        <span className="al-mud-ico" aria-hidden="true"><Icon name="history" size={16} /></span>
        {m.titulo ? <h3><TextoRico texto={m.titulo} /></h3> : <span className="al-mud-l">Atualização</span>}
      </div>
      {m.antes ? (
        <div className="al-compare">
          <div className="al-cmp al-cmp-antes"><div className="al-cmp-l">Antes</div><p><TextoRico texto={m.antes} /></p></div>
          <div className="al-cmp al-cmp-agora"><div className="al-cmp-l">Agora</div><p><TextoRico texto={m.agora} /></p></div>
        </div>
      ) : (
        <p className="al-p"><TextoRico texto={m.corpo} /></p>
      )}
    </article>
  );
}

function Table({ t }) {
  const headers = t.headers ?? [];
  return (
    <figure className="al-fig al-tblfig">
      <div className="al-tblw">
        <table className="al-tbl" role="table">
          <caption>{t.titulo}</caption>
          <thead role="rowgroup"><tr role="row">{headers.map((h, i) => <th key={i} scope="col" role="columnheader">{h}</th>)}</tr></thead>
          <tbody role="rowgroup">
            {(t.rows ?? []).map((r, i) => {
              const cells = (r ?? []).map(celula);
              return (
                <tr key={i} role="row" className={cells.some((c) => c.alerta) ? "al-tr-alerta" : undefined}>
                  {cells.map((c, j) => <td key={j} role="cell" data-label={headers[j] ?? ""}>{c.texto}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

const duracao = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : null);

// Legenda e transcrição com formatação (migração 013160): só quando o rico bate com o texto; senão, exatamente como antes.
function Media({ m }) {
  const audio = m.tipo === "audio";
  const ricoLegenda = ricoDoMaterial(m.formatacao, "legenda", m.legenda);
  const ricoTranscricao = ricoDoMaterial(m.formatacao, "transcricao", m.transcricao);
  return (
    <figure className="al-fig al-mediafig">
      <iframe className={`al-media${audio ? " al-media-a" : ""}`} src={m.embed_url} title={m.titulo} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media; picture-in-picture" />
      <figcaption className="al-cap">
        <strong>{m.titulo}</strong>
        <span> · {audio ? "Áudio" : "Vídeo"}{duracao(m.duracao_segundos) ? ` · ${duracao(m.duracao_segundos)}` : ""}</span>
        {m.legenda && (ricoLegenda ? <ParagrafoRico texto={m.legenda} rico={ricoLegenda} className="al-cap-l al-p-rico" /> : <span className="al-cap-l">{m.legenda}</span>)}
      </figcaption>
      {m.transcricao && (
        <details className="al-det">
          <summary>Ler a transcrição</summary>
          {ricoTranscricao ? <ParagrafoRico texto={m.transcricao} rico={ricoTranscricao} className="al-p al-p-rico" /> : <p className="al-p">{m.transcricao}</p>}
        </details>
      )}
    </figure>
  );
}

function Fixacao({ itens }) {
  const [chosen, setChosen] = React.useState({});
  const respondidas = Object.keys(chosen).length;
  const acertos = itens.filter((q, i) => chosen[i] != null && chosen[i] === q.correta).length;
  return (
    <>
      <p className="al-p al-hint">Toque na alternativa que você acha correta: a aula corrige na hora e explica.</p>
      {itens.map((q, i) => {
        const pick = chosen[i];
        const right = q.correta;
        const comment = (id) => (q.comentarios ?? []).find((c) => c.id === id)?.text;
        return (
          <div className="al-q" key={i}>
            <div className="al-q-n">Questão {q.numero ?? i + 1} <span>de {itens.length}</span></div>
            <p className="al-q-s">{q.enunciado}</p>
            {(q.alternativas ?? []).map((o) => {
              const state = !pick ? "" : o.id === right ? " ok" : o.id === pick ? " bad" : " off";
              return (
                <button key={o.id} type="button" className={`al-alt${state}`} disabled={Boolean(pick)} aria-pressed={pick === o.id} onClick={() => setChosen((c) => ({ ...c, [i]: o.id }))}>
                  <span className="l">{o.id}</span>
                  <span className="x">{o.text}</span>
                  {pick && o.id === right && <Icon name="circle-check" size={18} className="al-alt-ic" />}
                </button>
              );
            })}
            {pick && (
              <div className={`al-fb ${pick === right ? "ok" : "bad"}`} role="status">
                <b>{pick === right ? "Você acertou." : `Não foi essa. A resposta correta é a alternativa ${right}.`}</b>
                {comment(pick) && <div className="al-fb-t">{comment(pick)}</div>}
                {pick !== right && comment(right) && <div className="al-fb-t">{comment(right)}</div>}
              </div>
            )}
            {pick && (
              <button type="button" className="al-btn" onClick={() => setChosen((c) => { const n = { ...c }; delete n[i]; return n; })}>
                <Icon name="rotate-ccw" size={14} />Tentar de novo
              </button>
            )}
          </div>
        );
      })}
      {respondidas > 0 && <p className="al-score" aria-live="polite">Você acertou {acertos} de {respondidas} {respondidas === 1 ? "respondida" : "respondidas"}.</p>}
    </>
  );
}

function FlashcardIlustrado({ c, temaId, total, on, onFlip }) {
  const [seen, setSeen] = React.useState(on);
  React.useEffect(() => { if (on) setSeen(true); }, [on]);
  const verso = useVersoPronto(temaId, c.n, seen, Boolean(c.imagem));
  const flip = () => { setSeen(true); onFlip(!on); };
  return (
    <button type="button" className={`al-flip${on ? " on" : ""}${c.imagem ? "" : " al-flip-txt"}`} onClick={flip} aria-label={`Virar flashcard ${c.n} de ${total}`} aria-pressed={on} onContextMenu={noMenu}>
      <div className="al-flip-in">
        <div className="al-face">
          {c.imagem ? <ProtectedImage temaId={temaId} qual="frente" n={c.n} alt={`Flashcard ${c.n}, frente: ${c.frente}`} /> : <div className="txt"><span className="al-face-l">Pergunta</span><span className="al-face-t">{c.frente}</span><span className="al-face-hint">Toque para virar</span></div>}
        </div>
        <div className="al-face back">
          {c.imagem ? <ProtectedImage temaId={temaId} qual="verso" n={c.n} alt={`Flashcard ${c.n}, verso: ${c.verso}`} enabled={verso} /> : <div className="txt"><span className="al-face-l">Resposta</span><span className="al-face-t">{c.verso}</span></div>}
        </div>
      </div>
    </button>
  );
}

/** Um cartão por vez (nada de rolagem lateral): virar, anterior, próximo e atalhos de teclado (setas). */
function Flashcards({ cards, temaId }) {
  const [i, setI] = React.useState(0);
  const [on, setOn] = React.useState(false);
  const [vistos, setVistos] = React.useState(() => new Set());
  const total = cards.length;
  const c = cards[Math.min(i, total - 1)];
  const ir = (k) => { setI(((k % total) + total) % total); setOn(false); };
  const flip = (v) => { setOn(v); if (v) setVistos((s) => new Set(s).add(c.n)); };
  // adianta as imagens do próximo cartão (depois das do atual): "Próximo" troca sem esperar o servidor
  const { backend } = useSession();
  const prox = total > 1 ? cards[(Math.min(i, total - 1) + 1) % total] : null;
  React.useEffect(() => {
    if (!prox?.imagem) return undefined;
    let alive = true;
    const atual = c.imagem ? { tema: temaId, n: c.n } : null;
    preCarregarCartao(backend, atual).then(() => alive && preCarregarCartao(backend, { tema: temaId, n: prox.n }));
    return () => { alive = false; };
  }, [backend, temaId, c.n, c.imagem, prox?.n, prox?.imagem]);
  const onKey = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); ir(i + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); ir(i - 1); }
  };
  return (
    <div className="al-fcv" role="group" aria-label="Flashcards da aula" onKeyDown={onKey}>
      <div className="al-fcv-top">
        <span className="al-fcv-pos">Cartão {i + 1} de {total}</span>
        <span className="al-fcv-seen" aria-live="polite">{vistos.size} de {total} virados</span>
      </div>
      <div className="al-fcv-card">
        <FlashcardIlustrado key={c.n} c={c} temaId={temaId} total={total} on={on} onFlip={flip} />
      </div>
      <div className="al-fcv-nav">
        <button type="button" className="al-btn" onClick={() => ir(i - 1)} aria-label="Cartão anterior" disabled={total < 2}><Icon name="chevron-left" size={16} /><span className="al-hide-sm">Anterior</span></button>
        <button type="button" className="al-btn pri" onClick={() => flip(!on)}><Icon name="refresh-cw" size={14} />{on ? "Ver a pergunta" : "Virar"} · {c.n} de {total}</button>
        <button type="button" className="al-btn" onClick={() => ir(i + 1)} aria-label="Próximo cartão" disabled={total < 2}><span className="al-hide-sm">Próximo</span><Icon name="chevron-right" size={16} /></button>
      </div>
      {total > 1 && (
        <div className="al-fcv-dots" role="group" aria-label="Escolher o cartão">
          {cards.map((x, k) => (
            <button key={x.n} type="button" className={`al-dot${k === i ? " on" : ""}${vistos.has(x.n) ? " seen" : ""}`} aria-label={`Ir para o cartão ${k + 1}`} aria-current={k === i ? "true" : undefined} onClick={() => ir(k)}>{k + 1}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const PAUSA_MS = 900;
const statusNota = (st) => (st === "saving" ? "Salvando…" : st === "saved" ? "Salvo" : st === "error" ? "Não salvo" : "Só você vê");

/**
 * Anotações por seção (app_lesson_section_note_save, chave "geral" ou "sec-N") e caixas marcadas (app_lesson_checks_save), por aluno.
 * Cada caixa grava sozinha depois de uma pausa; sair da caixa grava na hora; sair da aula grava o que estava pendente. Avisa se falhar.
 */
function useNotes(backend, lessonId) {
  const [state, setState] = React.useState({ loaded: false, notas: {}, inicial: [], checks: {}, saving: {}, error: null });
  const latest = React.useRef(state);
  latest.current = state;
  const ctx = React.useRef({ backend, lessonId });
  ctx.current = { backend, lessonId };
  const pending = React.useRef({}); // chave -> { timer, run }

  const runNow = (key) => {
    const p = pending.current[key];
    if (!p) return;
    clearTimeout(p.timer);
    delete pending.current[key];
    p.run();
  };
  const later = (key, run) => {
    clearTimeout(pending.current[key]?.timer);
    pending.current[key] = { run, timer: setTimeout(() => runNow(key), PAUSA_MS) };
  };

  React.useEffect(() => {
    if (!lessonId) return undefined;
    let alive = true;
    backend.rpc("app_lesson_notes", { p_lesson_id: lessonId }).then(
      (r) => {
        if (!alive) return;
        const notas = r?.notas && typeof r.notas === "object" ? { ...r.notas } : r?.note ? { geral: r.note } : {};
        setState((s) => ({ ...s, loaded: true, notas, inicial: Object.keys(notas), checks: r?.checks ?? {} }));
      },
      () => alive && setState((s) => ({ ...s, loaded: true, error: "Não foi possível carregar as suas anotações." }))
    );
    return () => {
      alive = false;
      for (const key of Object.keys(pending.current)) runNow(key); // nada se perde ao sair da aula
    };
  }, [backend, lessonId]);

  const setSaving = (key, st, error) => setState((s) => ({ ...s, saving: { ...s.saving, [key]: st }, ...(error !== undefined ? { error } : {}) }));
  const saveNota = async (key) => {
    const { backend: b, lessonId: id } = ctx.current;
    const text = latest.current.notas[key] ?? "";
    setSaving(key, "saving", null);
    try {
      await b.rpc("app_lesson_section_note_save", { p_lesson_id: id, p_secao: key, p_note: text });
      setSaving(key, pending.current[key] ? "" : "saved");
    } catch (e) {
      setSaving(key, "error", messageOf(e, "Não foi possível salvar a anotação. Tente de novo."));
    }
  };
  const saveChecks = async () => {
    const { backend: b, lessonId: id } = ctx.current;
    try {
      await b.rpc("app_lesson_checks_save", { p_lesson_id: id, p_checks: latest.current.checks });
    } catch (e) {
      setState((s) => ({ ...s, error: messageOf(e, "Não foi possível salvar as caixas marcadas. Tente de novo.") }));
    }
  };
  return {
    ...state,
    setNota: (key, text) => {
      setState((s) => ({ ...s, notas: { ...s.notas, [key]: String(text).slice(0, 20000) }, saving: { ...s.saving, [key]: "" } }));
      later(key, () => saveNota(key));
    },
    flush: (key) => runNow(key),
    toggle: (key) => {
      setState((s) => ({ ...s, checks: { ...s.checks, [key]: !s.checks[key] } }));
      later("__caixas", saveChecks);
    },
  };
}

/** Uma caixa de anotação (de uma seção ou a geral antiga). */
function NotaBox({ k, label, title, notes, placeholder }) {
  const st = notes.saving[k];
  return (
    <div className={`al-notes${st === "error" ? " is-error" : ""}`}>
      <div className="h">
        <span aria-hidden="true"><Icon name="notebook-pen" size={16} />{title}</span>
        <small aria-live="polite">{statusNota(st)}</small>
      </div>
      <textarea aria-label={label} value={notes.notas[k] ?? ""} onChange={(e) => notes.setNota(k, e.target.value)} onBlur={() => notes.flush(k)} placeholder={placeholder} maxLength={20000} disabled={!notes.loaded} />
    </div>
  );
}

/** Seção que aparece na tela (para o índice acompanhar a rolagem). Sem IntersectionObserver (testes), fica na primeira. */
function useSecaoAtual(ids) {
  const [atual, setAtual] = React.useState(ids[0] ?? null);
  const chave = ids.join("|");
  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const visiveis = new Set();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.isIntersecting ? visiveis.add(e.target.id) : visiveis.delete(e.target.id));
        const primeiro = ids.find((id) => visiveis.has(id));
        if (primeiro) setAtual(primeiro);
      },
      { rootMargin: "-96px 0px -55% 0px" }
    );
    for (const id of ids) { const el = document.getElementById(id); if (el) io.observe(el); }
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return atual;
}

function Barra({ tema, onBack, atual, toc, tocOpen, setTocOpen, toggleRef }) {
  const item = toc?.find((t) => t.id === atual);
  return (
    <div className="al-bar">
      <Button variant="secondary" size="sm" icon="arrow-left" onClick={onBack}><span className="al-hide-sm">Voltar aos temas</span><span className="al-show-sm" aria-hidden="true">Temas</span></Button>
      <div className="al-bar-t">
        <span className="al-bar-tema">{tema.title}</span>
        {item && <span className="al-bar-sec">{item.label}</span>}
      </div>
      {toc && (
        <button ref={toggleRef} type="button" className="al-bar-toc" aria-expanded={tocOpen} aria-controls="al-toc-panel" onClick={() => setTocOpen(!tocOpen)}>
          <Icon name={tocOpen ? "x" : "list"} size={18} /><span>Índice</span>
        </button>
      )}
    </div>
  );
}

export function TemaAula({ tema, onBack, go, mobile, onProgresso }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_tema_aula", { p_tema_id: tema.id }), [backend, tema.id]);
  const notes = useNotes(backend, data?.lesson_id ?? null);
  const vars = temaVars(tema.id, tema.area);

  if (data) return <div className="al" style={vars}><Conteudo data={data} tema={tema} go={go} notes={notes} onBack={onBack} mobile={mobile} onProgresso={onProgresso} /></div>;
  let body;
  if (error) body = <LoadError error={error} retry={reload} />;
  else if (data === null) body = <Banner tone="info">Esta aula ainda não está disponível. Volte aos temas e tente de novo mais tarde.</Banner>;
  else body = <div className="al-loading" aria-busy="true"><Loading /><div className="al-skel" /><div className="al-skel short" /></div>;
  return (
    <div className="al" style={vars}>
      <Barra tema={tema} onBack={onBack} />
      {body}
    </div>
  );
}

function Conteudo({ data, tema, go, notes, onBack, onProgresso }) {
  const secoes = data.secoes ?? [];
  const [first, ...rest] = String(data.titulo ?? "").split(/:\s+/);
  const title = rest.length ? [first, rest.join(": ")] : [data.titulo, ""];
  const tabelasPor = (pos) => (data.tabelas ?? []).filter((t) => t.posicao === pos);
  const midiasPor = (pos) => (data.midias ?? []).filter((m) => m.posicao === pos);
  const fix = data.questoes?.itens ?? [];
  const cards = data.flashcards?.cartoes ?? [];
  const pontos = Array.isArray(data.pontos_chave) ? data.pontos_chave : [];
  const upd = monthYear(data.atualizado_em);
  const cab = String(data.cabecalho ?? "").trim();
  const cabCurto = cab && cab.length <= 160;
  const secN = (k) => (/^sec-(\d+)$/.exec(k) ? Number(k.slice(4)) : null);
  const antigas = notes.inicial.filter((k) => k !== "geral" && secN(k) != null && secN(k) > secoes.length).sort((a, b) => secN(a) - secN(b));
  const temAntes = notes.inicial.includes("geral") || antigas.length > 0;
  const minutos = minutosDeLeitura(data);
  const prog = progressoDaAula(secoes.length, notes.checks, notes.notas);
  // O cartão do tema mostra o mesmo progresso (seções estudadas) quando o aluno volta à lista; só depois que as caixas do aluno
  // foram lidas do banco (falha na leitura não vira 0%).
  const progLido = notes.loaded && notes.error !== "Não foi possível carregar as suas anotações.";
  React.useEffect(() => {
    if (progLido && prog.total > 0) onProgresso?.(tema.id, prog.pct);
  }, [progLido, prog.pct, prog.total, tema.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const temNota = (k) => String(notes.notas[k] ?? "").trim() !== "";
  const temResumo = pontos.length > 0 || (cab && !cabCurto);

  const toc = [
    ...(temAntes ? [{ id: "al-notas", label: "Minhas anotações de antes", icon: "notebook-pen" }] : []),
    ...(temResumo ? [{ id: "al-resumo", label: "Em resumo", icon: "list-checks" }] : []),
    ...secoes.map((s, i) => ({ id: `al-s${i + 1}`, n: i + 1, label: cleanHeading(s.titulo), done: Boolean(notes.checks[`sec-${i + 1}`]), nota: temNota(`sec-${i + 1}`) })),
    ...(fix.length ? [{ id: "al-fix", label: "Questões de fixação", icon: "list-checks" }] : []),
    ...(cards.length ? [{ id: "al-fc", label: "Flashcards ilustrados", icon: "layers" }] : []),
    ...(data.revisao_aula ? [{ id: "al-rev", label: "Revisão da Aula", icon: "image" }] : []),
  ];
  const ids = toc.map((t) => t.id);
  const atual = useSecaoAtual(ids);
  const [tocOpen, setTocOpen] = React.useState(false);
  const toggleRef = React.useRef(null);
  const tocRef = React.useRef(null);

  React.useEffect(() => {
    if (!tocOpen) return undefined;
    tocRef.current?.querySelector("button")?.focus();
    const onKey = (e) => { if (e.key === "Escape") { setTocOpen(false); toggleRef.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tocOpen]);

  const jump = (id) => {
    setTocOpen(false);
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduzMovimento() ? "auto" : "smooth", block: "start" });
    el.focus?.({ preventScroll: true });
  };
  const proxima = (id) => toc[ids.indexOf(id) + 1] ?? null;

  const trainable = tema.total > 0;
  const extras = (pos) => (
    <>
      {tabelasPor(pos).map((t, i) => <Table key={`t${pos}-${i}`} t={t} />)}
      {midiasPor(pos).map((m, i) => <Media key={`m${pos}-${i}`} m={m} />)}
    </>
  );
  const progresso = (compact) => (
    <div className={`al-prog${compact ? " compact" : ""}`}>
      <div className="al-prog-row">
        <span className="al-prog-txt"><b>{prog.feitas}</b>&nbsp;de {prog.total} seções estudadas</span>
        <span><Icon name="notebook-pen" size={14} />{prog.anotacoes} {prog.anotacoes === 1 ? "anotação" : "anotações"}</span>
      </div>
      <div className="al-prog-bar" role="progressbar" aria-label="Seções estudadas" aria-valuemin={0} aria-valuemax={prog.total} aria-valuenow={prog.feitas} aria-valuetext={`${prog.feitas} de ${prog.total} seções estudadas`}>
        <span style={{ width: `${prog.pct}%` }} />
      </div>
    </div>
  );
  const seguir = (id) => {
    const p = proxima(id);
    if (!p) return null;
    return (
      <button type="button" className="al-next" onClick={() => jump(p.id)} aria-label={`Ir para a próxima parte: ${p.label}`}>
        <span>Próxima</span><Icon name="arrow-right" size={14} />
      </button>
    );
  };

  return (
    <>
      <Barra tema={tema} onBack={onBack} atual={atual} toc={toc} tocOpen={tocOpen} setTocOpen={setTocOpen} toggleRef={toggleRef} />
      {/* mini tutor: dúvidas da aula, com o tema e a seção que está na tela */}
      <MiniTutor contexto={contextoDaAula(tema, toc.find((t) => t.id === atual)?.label)} />

      <header className="al-cover" id="al-topo" tabIndex={-1}>
        <div className="al-pills">
          <span className="al-selo"><span className="al-selo-dot" aria-hidden="true" />{tema.area_name}{tema.subarea ? ` · ${tema.subarea}` : ""}</span>
          <span className="al-pill">Material StaziaMed</span>
          {upd && <span className="al-pill">Atualizado {upd}</span>}
        </div>
        <h1 className="al-title">{title[0]}{title[1] && <span>{title[1]}</span>}</h1>
        {cabCurto && <p className="al-head">{cab}</p>}
        <ul className="al-meta" aria-label="Sobre esta aula">
          <li><Icon name="clock" size={15} />≈ {minutos} min de leitura</li>
          <li><Icon name="book-open" size={15} />{secoes.length} {secoes.length === 1 ? "seção" : "seções"}</li>
          {fix.length > 0 && <li><Icon name="list-checks" size={15} />{fix.length} {fix.length === 1 ? "questão" : "questões"} de fixação</li>}
          {cards.length > 0 && <li><Icon name="layers" size={15} />{cards.length} flashcards</li>}
        </ul>
        {progresso()}
        <details className="al-use">
          <summary>Como usar esta aula</summary>
          <ul>
            <li>Índice com as seções: toque para ir direto ao ponto</li>
            <li>Marque cada seção como estudada (fica salvo)</li>
            <li>Questões de fixação: toque na alternativa e veja a explicação</li>
            <li>Flashcards ilustrados: toque para virar</li>
            <li>Uma caixa de anotações em cada seção, só sua (salva sozinha)</li>
          </ul>
        </details>
      </header>

      <div className="al-actions">
        {trainable && (
          <Button variant="primary" size="sm" iconRight="chevron-right" className="al-cta" onClick={() => go.train(tema)}>Treinar este tema ({tema.total} {tema.total === 1 ? "questão" : "questões"})</Button>
        )}
        <TutorButton request={{ mode: "perguntas", topic: tema.title, context: { type: "theme", id: tema.id, label: tema.title, area: tema.area_name } }} label="Me teste" variant="ghost" />
        {cards.length > 0 && <Button variant="ghost" size="sm" icon="layers" onClick={() => go.flash()}>Estudar meus flashcards</Button>}
      </div>
      {notes.error && <Banner tone="warning">{notes.error}</Banner>}

      <div className="al-layout">
        <aside className="al-side">
          <div className={`al-toc-panel${tocOpen ? " is-open" : ""}`} id="al-toc-panel">
            <div className="al-toc-head">
              <span>Nesta aula</span>
              <button type="button" className="al-toc-close" aria-label="Fechar o índice" onClick={() => { setTocOpen(false); toggleRef.current?.focus(); }}><Icon name="x" size={18} /></button>
            </div>
            <nav className="al-toc" aria-label="Sumário da aula" ref={tocRef}>
              {toc.map((t) => (
                <button key={t.id} type="button" className={`al-toc-i${t.done ? " done" : ""}`} aria-current={atual === t.id ? "location" : undefined} onClick={() => jump(t.id)}>
                  <span className={`al-toc-n${t.n != null ? " sec" : ""}`} aria-hidden="true">{t.done ? <Icon name="check" size={13} /> : t.n != null ? null : <Icon name={t.icon} size={13} />}</span>
                  <span className="al-toc-l">{t.n != null ? `${t.n}. ${t.label}` : t.label}</span>
                  {t.done && <span className="al-sr"> (estudada)</span>}
                  {t.nota && <span className="al-toc-note" title="Tem anotação"><Icon name="notebook-pen" size={12} /><span className="al-sr"> (com anotação)</span></span>}
                </button>
              ))}
            </nav>
            {progresso(true)}
          </div>
          {tocOpen && <div className="al-toc-backdrop" aria-hidden="true" onClick={() => setTocOpen(false)} />}
        </aside>

        <div className="al-main">
          {temResumo && (
            <section className="al-sheet al-resumo" id="al-resumo" tabIndex={-1} aria-labelledby="al-resumo-h">
              <div className="al-sechead">
                <span className="al-secnum" aria-hidden="true"><Icon name="list-checks" size={20} /></span>
                <div className="al-sechead-t"><span className="al-over">Antes de começar</span><h2 className="al-sectab" id="al-resumo-h">Em resumo</h2></div>
              </div>
              {cab && !cabCurto && <p className="al-p al-lead">{cab}</p>}
              {pontos.length > 0 && <ul className="al-pontos">{pontos.map((p, i) => <li key={i}><Icon name="circle-check" size={18} /><ParagrafoRico texto={p} rico={ricoDoPonto(data.pontos_chave_ricos, i, p)} como="span" /></li>)}</ul>}
            </section>
          )}

          {(tabelasPor(0).length > 0 || midiasPor(0).length > 0) && <section className="al-sheet">{extras(0)}</section>}

          {temAntes && (
            <section className="al-sheet" id="al-notas" tabIndex={-1} aria-label="Minhas anotações de antes">
              <Head icon="notebook-pen" title="Minhas anotações de antes" />
              <p className="al-p">O que você já tinha escrito nesta aula continua aqui. As novas anotações ficam em cada seção.</p>
              {notes.inicial.includes("geral") && (
                <NotaBox k="geral" label="Anotação geral desta aula" title="Anotação geral" notes={notes} placeholder="Escreva aqui o que quiser lembrar desta aula." />
              )}
              {antigas.map((k) => (
                <NotaBox key={k} k={k} label={`Anotação da antiga seção ${secN(k)}`} title={`Antiga seção ${secN(k)}`} notes={notes} placeholder="Escreva aqui." />
              ))}
            </section>
          )}

          {secoes.map((s, i) => {
            const n = i + 1;
            const id = `al-s${n}`;
            const h = cleanHeading(s.titulo);
            const estilos = Array.isArray(s.estilos) ? s.estilos : [];
            const tipo = secaoTipo(s.titulo, estilos);
            const paras = s.paragrafos ?? [];
            const done = Boolean(notes.checks[`sec-${n}`]);
            const erros = tipo === "erros" ? (paras.length === 1 ? dividirFrases(paras[0]) : paras) : [];
            const marcados = erros.filter((_, j) => notes.checks[`erro-${j + 1}`]).length;
            return (
              <section className={`al-sheet al-sec al-k-${tipo}${done ? " is-done" : ""}`} key={n} id={id} tabIndex={-1} aria-label={h}>
                <Head n={n} over={sobretitulo(s.titulo, tipo)} title={h} done={done} />
                <div className="al-body">
                  {tipo === "caso" && paras.map((p, j) => (
                    <div className="al-caso" key={j}>
                      <span className="al-caso-ico" aria-hidden="true"><Icon name="stethoscope" size={20} /></span>
                      <p><TextoRico texto={p} /></p>
                    </div>
                  ))}
                  {tipo === "volta" && paras.map((p, j) => (
                    <div className="al-volta" key={j}>
                      <span className="al-caso-ico" aria-hidden="true"><Icon name="circle-check" size={20} /></span>
                      <p><TextoRico texto={p} /></p>
                    </div>
                  ))}
                  {tipo === "mudou" && <div className="al-muds">{paras.map((p, j) => <Mudanca key={j} texto={p} />)}</div>}
                  {tipo === "bloco" && paras.map((p, j) => <Bloco key={j} texto={p} estilo={estilos[j]} rico={s.ricos?.[j]} />)}
                  {tipo === "erros" && (
                    <div className="al-chk erro">
                      <div className="al-chk-h">
                        <span>Marque os que você já sabe evitar</span>
                        <small>{marcados} de {erros.length}</small>
                      </div>
                      {erros.map((p, j) => {
                        const key = `erro-${j + 1}`;
                        return (
                          <label key={j} className={`al-row${notes.checks[key] ? " on" : ""}`}>
                            <input type="checkbox" checked={Boolean(notes.checks[key])} onChange={() => notes.toggle(key)} />
                            <span><TextoRico texto={p} /></span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {extras(n)}
                </div>
                <div className="al-secfoot">
                  <NotaBox k={`sec-${n}`} label={`Minha anotação da seção ${n}: ${h}`} title="Minha anotação" notes={notes} placeholder="Escreva aqui o que quiser lembrar desta seção." />
                  <div className="al-secfoot-row">
                    <label className={`al-done${done ? " on" : ""}`}>
                      <input type="checkbox" checked={done} onChange={() => notes.toggle(`sec-${n}`)} />
                      <span>Marcar esta seção como estudada</span>
                    </label>
                    {seguir(id)}
                  </div>
                </div>
              </section>
            );
          })}

          {fix.length > 0 && (
            <section className="al-sheet" id="al-fix" tabIndex={-1} aria-labelledby="al-fix-h">
              <div className="al-sechead">
                <span className="al-secnum" aria-hidden="true"><Icon name="list-checks" size={20} /></span>
                <div className="al-sechead-t"><span className="al-over">Pratique</span><h2 className="al-sectab" id="al-fix-h">Questões de fixação</h2></div>
              </div>
              <Fixacao itens={fix} />
              <div className="al-secfoot-row end">{seguir("al-fix")}</div>
            </section>
          )}

          {cards.length > 0 && (
            <section className="al-sheet" id="al-fc" tabIndex={-1} aria-labelledby="al-fc-h">
              <div className="al-sechead">
                <span className="al-secnum" aria-hidden="true"><Icon name="layers" size={20} /></span>
                <div className="al-sechead-t"><span className="al-over">Memorize</span><h2 className="al-sectab" id="al-fc-h">Flashcards ilustrados</h2></div>
              </div>
              <p className="al-p al-hint">Os {cards.length} flashcards ilustrados desta aula. Toque no cartão para virar. Eles também entram nos seus flashcards de revisão.</p>
              <Flashcards cards={cards} temaId={tema.id} />
              <div className="al-secfoot-row end">{seguir("al-fc")}</div>
            </section>
          )}

          {data.revisao_aula && (
            <section className="al-sheet" id="al-rev" tabIndex={-1} aria-labelledby="al-rev-h">
              <div className="al-sechead">
                <span className="al-secnum" aria-hidden="true"><Icon name="image" size={20} /></span>
                <div className="al-sechead-t"><span className="al-over">Uma página</span><h2 className="al-sectab" id="al-rev-h">Revisão da Aula</h2></div>
              </div>
              <figure className="al-a4" onContextMenu={noMenu}>
                <ProtectedImage temaId={tema.id} qual="revisao" n={1} alt={data.revisao_aula.texto_alternativo || data.revisao_aula.alt} />
              </figure>
              <p className="al-cap al-cap-c">O resumo da aula em uma página, para revisar antes da prova.</p>
            </section>
          )}

          <section className="al-end" aria-label="Fim da aula">
            <div className="al-end-h"><Icon name="flag" size={18} />Fim da aula</div>
            {progresso()}
            <div className="al-end-a">
              {trainable && <Button variant="primary" size="sm" className="al-cta" iconRight="chevron-right" onClick={() => go.train(tema)}>Treinar este tema</Button>}
              <Button variant="secondary" size="sm" icon="arrow-up" onClick={() => jump("al-topo")}>Voltar ao início da aula</Button>
              <Button variant="ghost" size="sm" icon="layout-grid" onClick={onBack}>Escolher outro tema</Button>
            </div>
          </section>
          <p className="al-foot">Material StaziaMed. Não é material oficial do Inep.</p>
        </div>
      </div>
    </>
  );
}
