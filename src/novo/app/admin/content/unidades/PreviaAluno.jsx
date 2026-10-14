// "Pré-visualizar como aluno": a página da aula como o aluno vai ver, com os materiais que ele vê. Nada é publicado.
// Só o que o banco devolve em app_ch_unit_student_preview (itens ativos e visíveis ao aluno; nunca PDF, equipe ou arquivo para baixar).
import React from "react";
import { Badge, Banner } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { LoadError, Loading, useLoad } from "../../common.jsx";
import { hubAvailable, hubBlobUrl } from "../api.js";
import { Janela } from "./Janela.jsx";

/** Imagem protegida: vem pelo servidor, aparece só dentro da página e não oferece download nem clique com o botão direito. */
export function ImagemProtegida({ itemId, idx = 0, alt }) {
  const { backend } = useSession();
  const [url, setUrl] = React.useState(null);
  const [falha, setFalha] = React.useState(false);
  React.useEffect(() => {
    if (!hubAvailable(backend)) return undefined;
    let vivo = true;
    let blob = null;
    hubBlobUrl(backend, `/unit-materials/${itemId}/file/${idx}`).then(
      (u) => {
        blob = u;
        vivo ? setUrl(u) : URL.revokeObjectURL(u);
      },
      () => vivo && setFalha(true)
    );
    return () => {
      vivo = false;
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [backend, itemId, idx]);
  if (!url)
    return (
      <div style={{ minHeight: 120, display: "grid", placeItems: "center", background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", color: "var(--text-tertiary)", font: "var(--type-body-sm)", padding: 16, textAlign: "center" }}>
        {falha ? "O arquivo ainda não foi enviado ao depósito protegido (etapa de envio dos arquivos da aula)." : hubAvailable(backend) ? "Carregando a imagem…" : "A imagem aparece quando o servidor está ligado."}
      </div>
    );
  return <img src={url} alt={alt} draggable={false} onContextMenu={(e) => e.preventDefault()} style={{ width: "100%", height: "auto", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", userSelect: "none" }} />;
}

/** Player só dentro do sistema: iframe de YouTube (sem cookies) ou Vimeo, sem link para o arquivo. */
export function Player({ m }) {
  const audio = m.tipo === "audio";
  return (
    <figure data-media={m.tipo} style={{ margin: "16px 0", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: audio ? undefined : "16 / 9", height: audio ? 120 : undefined, borderRadius: "var(--radius-md)", overflow: "hidden", background: "#000" }}>
        <iframe
          title={m.titulo}
          src={m.embed_url}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="encrypted-media; picture-in-picture"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      </div>
      <figcaption style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        <strong>{m.titulo}</strong> · {audio ? "Áudio" : "Vídeo"}
        {m.duracao_segundos ? ` · ${Math.floor(m.duracao_segundos / 60)}:${String(m.duracao_segundos % 60).padStart(2, "0")}` : ""}
        {m.legenda && <div>{m.legenda}</div>}
      </figcaption>
      {m.transcricao && (
        <details>
          <summary style={{ cursor: "pointer", font: "var(--type-body-sm)" }}>Transcrição</summary>
          <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", font: "var(--type-body-sm)" }}>{m.transcricao}</p>
        </details>
      )}
    </figure>
  );
}

function Tabela({ t }) {
  return (
    <div style={{ overflowX: "auto", margin: "16px 0" }} data-tabela>
      <strong style={{ display: "block", marginBottom: 6 }}>{t.titulo}</strong>
      <table style={{ borderCollapse: "collapse", width: "100%", font: "var(--type-body-sm)" }}>
        <thead>
          <tr>
            {(t.headers ?? []).map((h, i) => (
              <th key={i} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "2px solid var(--border-default)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(t.rows ?? []).map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} style={{ padding: "6px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Texto como o aluno lê: seção por seção, com mídias e tabelas na posição escolhida (0 antes, n depois da seção n, 99 no fim). */
export function PaginaDaAula({ p }) {
  const pos = (n) => [
    ...(p.midias ?? []).filter((m) => Number(m.posicao) === n).map((m, i) => <Player key={`m${n}${i}`} m={m} />),
    ...(p.tabelas ?? []).filter((t) => Number(t.posicao) === n).map((t, i) => <Tabela key={`t${n}${i}`} t={t} />),
  ];
  const fim = [...(p.midias ?? []), ...(p.tabelas ?? [])].filter((x) => Number(x.posicao) >= (p.secoes ?? []).length + 1 || Number(x.posicao) === 99);
  return (
    <article style={{ display: "flex", flexDirection: "column", gap: 4 }} aria-label="Página da aula, como o aluno vê">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {p.tema && <Badge tone="brand">{p.tema}</Badge>}
        {p.area && <Badge>{p.area}</Badge>}
      </div>
      <h2 style={{ margin: "8px 0 4px", font: "var(--type-h2, var(--type-h3))" }}>{p.titulo}</h2>
      <p style={{ margin: 0, font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{p.cabecalho}</p>
      {pos(0)}
      {(p.secoes ?? []).map((s, i) => (
        <section key={i} id={`sec-${i + 1}`}>
          <h3 style={{ margin: "18px 0 6px", font: "var(--type-h4)", color: "var(--text-brand)" }}>{s.titulo}</h3>
          {(s.paragrafos ?? []).map((t, j) => (
            <p key={j} style={{ margin: "0 0 10px", lineHeight: 1.55 }}>
              {t}
            </p>
          ))}
          {pos(i + 1)}
        </section>
      ))}
      {fim.length > 0 && <div>{[...(p.midias ?? []).filter((m) => fim.includes(m)).map((m, i) => <Player key={`f${i}`} m={m} />), ...(p.tabelas ?? []).filter((t) => fim.includes(t)).map((t, i) => <Tabela key={`ft${i}`} t={t} />)]}</div>}
      {(p.pontos_chave ?? []).length > 0 && (
        <section id="pontos-chave">
          <h3 style={{ margin: "18px 0 6px", font: "var(--type-h4)" }}>Pontos-chave</h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {p.pontos_chave.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      )}
      {p.revisao_aula && (
        <section id="revisao-da-aula">
          <h3 style={{ margin: "18px 0 6px", font: "var(--type-h4)" }}>Revisão da Aula</h3>
          <ImagemProtegida itemId={p.revisao_aula.item_id} alt={p.revisao_aula.texto_alternativo || "Página de revisão da aula"} />
        </section>
      )}
      {p.flashcards && (
        <section id="flashcards">
          <h3 style={{ margin: "18px 0 6px", font: "var(--type-h4)" }}>Flashcards ({(p.flashcards.cartoes ?? []).length})</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
            {(p.flashcards.cartoes ?? []).map((c, i) => (
              <div key={i} style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 10 }}>
                <strong>{c.frente}</strong>
                <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>{c.verso}</div>
              </div>
            ))}
          </div>
        </section>
      )}
      {p.questoes && (
        <section id="questoes">
          <h3 style={{ margin: "18px 0 6px", font: "var(--type-h4)" }}>Questões de fixação</h3>
          {(p.questoes.itens ?? []).map((q, i) => (
            <div key={i} style={{ margin: "0 0 14px" }}>
              <Badge size="sm" tone="brand">
                {q.rotulo ?? "Questão StaziaMed"}
              </Badge>
              <p style={{ margin: "6px 0" }}>{q.enunciado}</p>
              {(q.alternativas ?? []).map((o) => (
                <div key={o.id} style={{ font: "var(--type-body-sm)" }}>
                  {o.id}) {o.text}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </article>
  );
}

export function PreviaAluno({ versionId, onClose }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_unit_student_preview", { p_version_id: versionId }), [backend, versionId]);
  return (
    <Janela titulo="Pré-visualizar como aluno" onClose={onClose}>
      <Banner tone="warning" icon="eye" title="Prévia: ainda não publicado">
        É assim que a página da aula fica para o aluno. Esta aula não chega ao aluno antes da aprovação médica e do portão de atualidade. Materiais só da equipe (PDFs, cards, story, A6) não aparecem aqui.
      </Banner>
      {error ? <LoadError error={error} retry={reload} /> : !data ? <Loading /> : <PaginaDaAula p={data} />}
    </Janela>
  );
}
