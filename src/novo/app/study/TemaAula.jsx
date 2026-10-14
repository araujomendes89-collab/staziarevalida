// A aula dentro do Grande Tema (aluno). Lê app_tema_aula (só aula PUBLICADA pela Central; sem PDF, fonte, afirmação ou código do tema).
// Anotações e caixas marcadas: app_lesson_notes / app_lesson_notes_save (por aluno). Imagens (Revisão da Aula e flashcards ilustrados)
// vêm do servidor como bytes (sem endereço de arquivo, sem botão de baixar, sem arrastar nem menu de imagem).
import React from "react";
import { Banner, Button, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { LoadError, Loading, messageOf, useLoad } from "../admin/common.jsx";
import { TutorButton } from "../tutor/TutorDrawer.jsx";
import { temaVars } from "./temaCores.js";
import "./aula.css";

const noMenu = (e) => e.preventDefault();
const cleanHeading = (h) => String(h ?? "").replace(/^Bloco\s*\d+\s*[·:.-]\s*/i, "").trim();
const monthYear = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { month: "2-digit", year: "numeric" }).format(new Date(iso)) : null);

/** Tipo de caixa de um parágrafo, pelo começo do texto: Pegadinha (armadilha) ou Atenção (cuidado). */
export function boxOf(text) {
  const m = /^(Pegadinha|Armadilha cl[áa]ssica|Armadilha)\b[^:.]{0,40}[:.]\s*/i.exec(text);
  if (m) return { kind: "peg", title: "Pegadinha de prova!", body: text.slice(m[0].length) };
  const a = /^(Aten[çc][ãa]o|Cuidado)\b[^.:]{0,70}[.:]\s*/i.exec(text);
  if (a) return { kind: "atencao", title: "Atenção", body: text };
  return null;
}

/** Imagem protegida pelo servidor: baixa com o login e mostra como blob. { src } | { error } | {}. */
function useAulaImage(temaId, qual, n, enabled = true) {
  const { backend } = useSession();
  const [state, setState] = React.useState({});
  React.useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    let url = null;
    (async () => {
      try {
        const token = backend.accessToken ? await backend.accessToken() : null;
        const res = await fetch(`/api/content-hub/aula-aluno/${temaId}/${qual}/${n}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) throw new Error("falhou");
        url = URL.createObjectURL(await res.blob());
        if (alive) setState({ src: url });
      } catch {
        if (alive) setState({ error: true });
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL?.(url);
    };
  }, [backend, temaId, qual, n, enabled]);
  return state;
}

function ProtectedImage({ temaId, qual, n = 1, alt, enabled }) {
  const img = useAulaImage(temaId, qual, n, enabled);
  if (img.error) return <div role="status" style={{ padding: 16, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Não foi possível carregar a imagem agora.</div>;
  if (!img.src) return <div aria-busy="true" style={{ width: "100%", height: "100%", minHeight: 120, background: "var(--surface-sunken)" }} />;
  return <img src={img.src} alt={alt} draggable={false} onContextMenu={noMenu} onDragStart={noMenu} />;
}

function Head({ n, title, id }) {
  return (
    <div className="al-sechead" id={id}>
      {n != null && <span className="al-secnum" aria-hidden="true">{n}</span>}
      <h2 className="al-sectab">{title}</h2>
    </div>
  );
}

function Para({ text }) {
  const box = boxOf(text);
  if (!box) return <p className="al-p">{text}</p>;
  return (
    <div className={`al-box al-${box.kind}`} role="note">
      <span className="em" aria-hidden="true">{box.kind === "peg" ? "!" : "i"}</span>
      <div>
        <div className="h">{box.title}</div>
        <div className="t">{box.body}</div>
      </div>
    </div>
  );
}

function Table({ t }) {
  return (
    <div className="al-tblw">
      <table className="al-tbl">
        <caption style={{ captionSide: "top", textAlign: "left", padding: "10px 12px", font: "700 17px/1.2 'Barlow Condensed', sans-serif", textTransform: "uppercase", color: "var(--al-p)" }}>{t.titulo}</caption>
        <thead><tr>{(t.headers ?? []).map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
        <tbody>{(t.rows ?? []).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Media({ m }) {
  const audio = m.tipo === "audio";
  return (
    <div className="al-card">
      <div className="al-chk" style={{ border: 0, padding: 0, margin: 0 }}><div className="h">{m.titulo}</div></div>
      <iframe className={`al-media${audio ? " al-media-a" : ""}`} src={m.embed_url} title={m.titulo} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media; picture-in-picture" />
      {m.legenda && <p className="al-p" style={{ margin: "8px 0 0", color: "var(--text-secondary)" }}>{m.legenda}</p>}
      {m.transcricao && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", font: "600 14px/1.3 var(--font-sans)" }}>Ler a transcrição</summary>
          <p className="al-p" style={{ marginTop: 8 }}>{m.transcricao}</p>
        </details>
      )}
    </div>
  );
}

function Fixacao({ itens }) {
  const [chosen, setChosen] = React.useState({});
  return (
    <>
      {itens.map((q, i) => {
        const pick = chosen[i];
        const right = q.correta;
        const comment = (id) => (q.comentarios ?? []).find((c) => c.id === id)?.text;
        return (
          <div className="al-q" key={i}>
            <div className="al-cond n">Questão {q.numero ?? i + 1}</div>
            <p className="s">{q.enunciado}</p>
            {(q.alternativas ?? []).map((o) => {
              const state = !pick ? "" : o.id === right ? " ok" : o.id === pick ? " bad" : "";
              return (
                <button key={o.id} type="button" className={`al-alt${state}`} disabled={Boolean(pick)} aria-pressed={pick === o.id} onClick={() => setChosen((c) => ({ ...c, [i]: o.id }))}>
                  <span className="l">{o.id}</span>
                  <span>{o.text}</span>
                </button>
              );
            })}
            {pick && (
              <div className={`al-fb ${pick === right ? "ok" : "bad"}`} role="status">
                <b>{pick === right ? "Você acertou." : `Não foi essa. A resposta correta é a alternativa ${right}.`}</b>
                {comment(pick) && <div style={{ marginTop: 6 }}>{comment(pick)}</div>}
                {pick !== right && comment(right) && <div style={{ marginTop: 6 }}>{comment(right)}</div>}
              </div>
            )}
            {pick && (
              <button type="button" className="al-btn" onClick={() => setChosen((c) => { const n = { ...c }; delete n[i]; return n; })}>Tentar de novo</button>
            )}
          </div>
        );
      })}
    </>
  );
}

function FlashcardIlustrado({ c, temaId, total }) {
  const [on, setOn] = React.useState(false);
  const [seen, setSeen] = React.useState(false);
  const flip = () => { setSeen(true); setOn((v) => !v); };
  return (
    <div className="al-fcw">
      <button type="button" className={`al-flip${on ? " on" : ""}`} onClick={flip} aria-label={`Virar flashcard ${c.n} de ${total}`} aria-pressed={on}>
        <div className="al-flip-in">
          <div className="al-face">
            {c.imagem ? <ProtectedImage temaId={temaId} qual="frente" n={c.n} alt={`Flashcard ${c.n}, frente: ${c.frente}`} /> : <div className="txt">{c.frente}</div>}
          </div>
          <div className="al-face back">
            {c.imagem ? <ProtectedImage temaId={temaId} qual="verso" n={c.n} alt={`Flashcard ${c.n}, verso: ${c.verso}`} enabled={seen} /> : <div className="txt">{c.verso}</div>}
          </div>
        </div>
      </button>
      <button type="button" className="al-btn" onClick={flip}>{on ? "Ver a pergunta" : "Virar"} · {c.n} de {total}</button>
    </div>
  );
}

/** Minhas anotações + caixas marcadas, gravadas por aluno (app_lesson_notes_save). Grava depois de uma pausa; avisa se falhar. */
function useNotes(backend, lessonId) {
  const [state, setState] = React.useState({ loaded: false, note: "", checks: {}, saving: "", error: null });
  const latest = React.useRef(state);
  latest.current = state;
  const timer = React.useRef(null);
  React.useEffect(() => {
    let alive = true;
    backend.rpc("app_lesson_notes", { p_lesson_id: lessonId }).then(
      (r) => alive && setState((s) => ({ ...s, loaded: true, note: r?.note ?? "", checks: r?.checks ?? {} })),
      () => alive && setState((s) => ({ ...s, loaded: true, error: "Não foi possível carregar as suas anotações." }))
    );
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [backend, lessonId]);
  const save = React.useCallback(async () => {
    const { note, checks } = latest.current;
    setState((s) => ({ ...s, saving: "saving", error: null }));
    try {
      await backend.rpc("app_lesson_notes_save", { p_lesson_id: lessonId, p_note: note, p_checks: checks });
      setState((s) => ({ ...s, saving: "saved" }));
    } catch (e) {
      setState((s) => ({ ...s, saving: "", error: messageOf(e, "Não foi possível salvar. Tente de novo.") }));
    }
  }, [backend, lessonId]);
  const later = () => { clearTimeout(timer.current); timer.current = setTimeout(save, 900); };
  return {
    ...state,
    setNote: (note) => { setState((s) => ({ ...s, note: note.slice(0, 20000), saving: "" })); later(); },
    toggle: (key) => { setState((s) => ({ ...s, checks: { ...s.checks, [key]: !s.checks[key] }, saving: "" })); later(); },
    flush: save,
  };
}

export function TemaAula({ tema, onBack, go, mobile }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_tema_aula", { p_tema_id: tema.id }), [backend, tema.id]);
  const notes = useNotes(backend, data?.lesson_id ?? "00000000-0000-0000-0000-000000000000");
  const vars = temaVars(tema.id, tema.area);
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });

  const bar = (
    <div className="al-bar">
      <Button variant="secondary" size="sm" icon="arrow-left" onClick={onBack}>Voltar aos temas</Button>
      <span className="al-bar-t">{tema.title}</span>
    </div>
  );
  let body;
  if (error) body = <LoadError error={error} retry={reload} />;
  else if (!data && data !== null) body = <Loading />;
  else if (data === null) body = <Banner tone="info">Esta aula ainda não está disponível. Volte aos temas e tente de novo mais tarde.</Banner>;
  else body = <Conteudo data={data} tema={tema} go={go} notes={notes} jump={jump} />;
  return (
    <div className="al" style={vars}>
      {bar}
      {body}
    </div>
  );
}

function Conteudo({ data, tema, go, notes, jump }) {
  const secoes = data.secoes ?? [];
  const [first, ...rest] = String(data.titulo ?? "").split(/:\s+/);
  const title = rest.length ? [first, rest.join(": ")] : [data.titulo, ""];
  const tabelasPor = (pos) => (data.tabelas ?? []).filter((t) => t.posicao === pos);
  const midiasPor = (pos) => (data.midias ?? []).filter((m) => m.posicao === pos);
  const fix = data.questoes?.itens ?? [];
  const cards = data.flashcards?.cartoes ?? [];
  const upd = monthYear(data.atualizado_em);
  const toc = [
    ...secoes.map((s, i) => [`al-s${i + 1}`, `${i + 1}. ${cleanHeading(s.titulo)}`]),
    ...(fix.length ? [["al-fix", "Questões de fixação"]] : []),
    ...(cards.length ? [["al-fc", "Flashcards ilustrados"]] : []),
    ...(data.revisao_aula ? [["al-rev", "Revisão da Aula"]] : []),
    ["al-notas", "Minhas anotações"],
  ];
  const trainable = tema.total > 0;
  const extras = (pos) => (
    <>
      {tabelasPor(pos).map((t, i) => <Table key={`t${pos}-${i}`} t={t} />)}
      {midiasPor(pos).map((m, i) => <Media key={`m${pos}-${i}`} m={m} />)}
    </>
  );
  const unmarked = (key, label) => (
    <label className="al-done">
      <input type="checkbox" checked={Boolean(notes.checks[key])} onChange={() => notes.toggle(key)} />
      {label}
    </label>
  );

  return (
    <>
      <header className="al-cover">
        <div className="al-pills">
          <span className="al-pill">{tema.area_name}{tema.subarea ? ` · ${tema.subarea}` : ""}</span>
          <span className="al-pill">Material StaziaMed</span>
          {upd && <span className="al-pill on">Atualizado {upd}</span>}
        </div>
        <h1 className="al-title">{title[0]}{title[1] && <span>{title[1]}</span>}</h1>
        {data.cabecalho && <p className="al-head">{data.cabecalho}</p>}
        <div className="al-use">
          <h2>Como usar esta aula</h2>
          <ul>
            <li>Sumário com títulos clicáveis para ir direto ao ponto</li>
            <li>Caixas para marcar o que já estudou (ficam salvas)</li>
            <li>Questões de fixação: toque na alternativa e veja a explicação</li>
            <li>Flashcards ilustrados: toque para virar</li>
            <li>Um espaço de anotações só seu</li>
          </ul>
        </div>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {trainable && (
          <Button variant="secondary" size="sm" iconRight="chevron-right" onClick={() => go.train(tema)}>Treinar este tema ({tema.total} {tema.total === 1 ? "questão" : "questões"})</Button>
        )}
        <TutorButton request={{ mode: "perguntas", topic: tema.title, context: { type: "theme", id: tema.id, label: tema.title, area: tema.area_name } }} label="Me teste" variant="ghost" />
        {cards.length > 0 && <Button variant="ghost" size="sm" onClick={() => go.flash()}>Estudar meus flashcards</Button>}
      </div>
      {notes.error && <Banner tone="warning">{notes.error}</Banner>}

      <section className="al-sheet" aria-labelledby="al-sumario">
        <Head title="Sumário" id="al-sumario" />
        {Array.isArray(data.pontos_chave) && data.pontos_chave.length > 0 && (
          <div className="al-obj" style={{ marginBottom: 14 }}>
            <div className="h">Em resumo</div>
            <ul>{data.pontos_chave.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
        )}
        <nav className="al-toc" aria-label="Sumário da aula">
          {toc.map(([id, label]) => (
            <button key={id} type="button" onClick={() => jump(id)}><span className="arr" aria-hidden="true">→</span>{label}</button>
          ))}
        </nav>
      </section>

      {(tabelasPor(0).length > 0 || midiasPor(0).length > 0) && <section className="al-sheet">{extras(0)}</section>}

      {secoes.map((s, i) => {
        const n = i + 1;
        const h = cleanHeading(s.titulo);
        const caso = /^caso cl[íi]nico/i.test(h);
        const erros = /^erros? frequentes/i.test(h);
        const volta = /^voltando ao caso/i.test(h);
        return (
          <section className="al-sheet" key={n} aria-label={h}>
            <Head n={n} title={h} id={`al-s${n}`} />
            {(s.paragrafos ?? []).map((p, j) => {
              if (caso) return <div className="al-card al-caso" key={j}><span className="al-ico" aria-hidden="true">?</span><p>{p}</p></div>;
              if (volta) return <div className="al-post" key={j}><div className="h">Voltando ao caso</div><p>{p}</p></div>;
              if (erros) return null;
              return <Para key={j} text={p} />;
            })}
            {erros && (
              <div className="al-chk erro">
                <div className="h">Erros frequentes · marque os que você já conhece</div>
                {(s.paragrafos ?? []).map((p, j) => {
                  const key = `erro-${j + 1}`;
                  return (
                    <label key={j} className={`al-row${notes.checks[key] ? " on" : ""}`}>
                      <input type="checkbox" checked={Boolean(notes.checks[key])} onChange={() => notes.toggle(key)} />
                      <span>{p}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {extras(n)}
            {unmarked(`sec-${n}`, "Marcar esta seção como estudada")}
          </section>
        );
      })}

      {fix.length > 0 && (
        <section className="al-sheet" aria-labelledby="al-fix">
          <Head title="Questões de fixação" id="al-fix" />
          <p className="al-p">Toque na alternativa que você acha correta: a aula corrige na hora e explica.</p>
          <Fixacao itens={fix} />
        </section>
      )}

      {cards.length > 0 && (
        <section className="al-sheet" aria-labelledby="al-fc">
          <Head title="Flashcards ilustrados" id="al-fc" />
          <p className="al-p">Os {cards.length} flashcards ilustrados desta aula. Toque no cartão para virar. Eles também entram nos seus flashcards de revisão.</p>
          <div className="al-fcg">{cards.map((c) => <FlashcardIlustrado key={c.n} c={c} temaId={tema.id} total={cards.length} />)}</div>
        </section>
      )}

      {data.revisao_aula && (
        <section className="al-sheet" aria-labelledby="al-rev">
          <Head title="Revisão da Aula" id="al-rev" />
          <figure style={{ margin: 0 }} className="al-a4" onContextMenu={noMenu}>
            <ProtectedImage temaId={tema.id} qual="revisao" n={1} alt={data.revisao_aula.texto_alternativo || data.revisao_aula.alt} />
          </figure>
        </section>
      )}

      <section className="al-sheet" aria-labelledby="al-notas">
        <Head title="Minhas anotações" id="al-notas" />
        <div className="al-notes">
          <div className="h">
            <span aria-hidden="true">Minhas anotações</span>
            <small aria-live="polite">{notes.saving === "saving" ? "Salvando…" : notes.saving === "saved" ? "Salvo" : "Só você vê"}</small>
          </div>
          <textarea aria-label="Minhas anotações" value={notes.note} onChange={(e) => notes.setNote(e.target.value)} onBlur={notes.flush} placeholder="Escreva aqui o que quiser lembrar desta aula." maxLength={20000} disabled={!notes.loaded} />
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="button" className="al-btn" onClick={() => jump("al-sumario")}><Icon name="arrow-up" size={14} /> Sumário</button>
        </div>
      </section>
      <p className="al-foot">Material StaziaMed. Não é material oficial do Inep.</p>
    </>
  );
}
