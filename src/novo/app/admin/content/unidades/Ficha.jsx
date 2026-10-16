// Ficha do revisor médico: decisões, pontos a conferir, notas das questões, o que ficou fora. Lida do arquivo importado
// (para-o-revisor-medico.md); a decisão de cada item é do revisor e fica registrada com quem, quando e a observação.
import React from "react";
import { CampoTexto } from "../../../textoRico/CampoTexto.jsx";
import { TextoRico } from "../../../textoRico/TextoRico.jsx";
import { Badge, Banner, Button } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { lerFicha } from "../../../../../shared/aulas/fichaRevisor.js";
import { LoadError, Loading, useLoad } from "../../common.jsx";
import { useAction } from "../ui.jsx";
import { dataHora, ehObjeto } from "./rotulos.js";

/** **negrito** e `código` do arquivo original viram marcação de verdade (sem HTML cru). */
export function Rico({ texto }) {
  const partes = String(texto ?? "").split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : <React.Fragment key={i}>{p}</React.Fragment>
      )}
    </>
  );
}

const ROTULO = { de_acordo: "De acordo", mudar: "Pede mudança" };

function Decisao({ d, atual, podeDecidir, versionId, onChanged }) {
  const { backend } = useSession();
  const act = useAction();
  const [nota, setNota] = React.useState(atual?.note ?? "");
  const grava = (decision) => act.run(() => backend.rpc("app_ch_review_decide", { p_version_id: versionId, p_n: d.n, p_decision: decision, p_note: nota }), null).then((r) => r && onChanged());
  return (
    <li style={{ listStyle: "none", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 12, display: "flex", flexDirection: "column", gap: 8 }} data-decisao={d.n}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "space-between" }}>
        <strong style={{ flex: "1 1 240px" }}>
          {d.n}. {d.titulo}
        </strong>
        {atual ? <Badge tone={atual.decision === "de_acordo" ? "success" : "warning"}>{ROTULO[atual.decision]}</Badge> : <Badge tone="neutral">Sem decisão</Badge>}
      </div>
      {d.pergunta && (
        <p style={{ margin: 0, font: "var(--type-body-sm)" }}>
          <Rico texto={d.pergunta} />
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, font: "var(--type-body-sm)" }}>
        <div>
          <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", textTransform: "uppercase" }}>Como está agora</div>
          <Rico texto={d.como_esta} />
        </div>
        <div>
          <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", textTransform: "uppercase" }}>Onde</div>
          <Rico texto={d.onde} />
        </div>
      </div>
      {atual && (
        <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
          {ROTULO[atual.decision]} por {atual.por}, em {dataHora(atual.em)}.{atual.note ? <> Observação: <TextoRico texto={atual.note} /></> : ""}
        </span>
      )}
      {podeDecidir && (
        <>
          <CampoTexto modo="linha" label="Observação (opcional)" value={nota} onChange={setNota} minRows={2} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" icon="check" loading={act.busy} onClick={() => grava("de_acordo")}>
              De acordo
            </Button>
            <Button size="sm" variant="secondary" icon="pencil" loading={act.busy} onClick={() => grava("mudar")}>
              Pedir mudança
            </Button>
          </div>
        </>
      )}
      {act.feedback}
    </li>
  );
}

function Lista({ itens }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 20, font: "var(--type-body-sm)", display: "flex", flexDirection: "column", gap: 6 }}>
      {itens.map((x, i) => (
        <li key={i}>
          <Rico texto={x} />
        </li>
      ))}
    </ul>
  );
}

function Importar({ versionId, onDone }) {
  const { backend } = useSession();
  const act = useAction();
  const input = React.useRef(null);
  const escolher = async (file) => {
    if (!file) return;
    const r = await act.run(async () => {
      const ficha = lerFicha(await file.text());
      return backend.rpc("app_ch_review_sheet_import", { p_version_id: versionId, p_sheet: ficha, p_origin_name: file.name });
    }, "Ficha importada.");
    if (input.current) input.current.value = "";
    if (r) onDone();
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input ref={input} type="file" accept=".md,text/markdown,text/plain" style={{ display: "none" }} onChange={(e) => escolher(e.target.files?.[0])} />
      <Button size="sm" variant="secondary" icon="file-up" loading={act.busy} onClick={() => input.current?.click()}>
        Importar a ficha (para-o-revisor-medico.md)
      </Button>
      {act.feedback}
    </div>
  );
}

export function FichaRevisor({ versionId, refresh, podeDecidir, podeImportar, onChanged }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_review_sheet", { p_version_id: versionId }), [backend, versionId, refresh]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!ehObjeto(data)) return data === null ? <Loading /> : null;
  const depois = () => {
    reload();
    onChanged?.();
  };
  if (!data.existe)
    return (
      <section className="sm-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }} aria-label="Ficha do revisor médico">
        <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Ficha do revisor médico</h3>
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Esta versão ainda não tem ficha. A ficha lista o que o revisor decide e confere antes de aprovar.</p>
        {podeImportar && <Importar versionId={versionId} onDone={depois} />}
      </section>
    );
  const f = data.ficha;
  const por = new Map((data.decisoes ?? []).map((x) => [x.n, x]));
  const marcadas = f.decisoes.filter((d) => por.get(d.n)?.decision === "de_acordo").length;
  return (
    <section className="sm-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }} aria-label="Ficha do revisor médico">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: 0, font: "var(--type-h3)" }}>Ficha do revisor médico</h3>
          <p style={{ margin: "4px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            Arquivo "{data.origem ?? "ficha"}", importado em {dataHora(data.importada_em)}. A aprovação médica é do administrador ou do revisor, não da equipe de conteúdo.
          </p>
        </div>
        <Badge tone={marcadas === f.decisoes.length ? "success" : "warning"}>
          {marcadas} de {f.decisoes.length} decisões "de acordo"
        </Badge>
      </div>
      <Banner tone="info" icon="info">
        {(f.intro ?? []).filter((l) => !/^[-#]/.test(l)).slice(0, 2).map((l, i) => (
          <div key={i}>
            <Rico texto={l} />
          </div>
        ))}
      </Banner>
      <h4 style={{ margin: 0, font: "var(--type-h4)" }}>{f.decisoes.length} decisões que são do revisor</h4>
      <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {f.decisoes.map((d) => (
          <Decisao key={d.n} d={d} atual={por.get(d.n)} podeDecidir={podeDecidir} versionId={versionId} onChanged={depois} />
        ))}
      </ul>
      <details>
        <summary style={{ cursor: "pointer", font: "var(--type-label)" }}>Pontos para conferir no documento original ({(f.pontos ?? []).length})</summary>
        <ol style={{ margin: "10px 0 0", paddingLeft: 20, font: "var(--type-body-sm)", display: "flex", flexDirection: "column", gap: 8 }}>
          {(f.pontos ?? []).map((p) => (
            <li key={p.n}>
              <Rico texto={p.texto} />
              {p.onde && <div style={{ color: "var(--text-tertiary)" }}>Onde: {p.onde}</div>}
            </li>
          ))}
        </ol>
      </details>
      <details>
        <summary style={{ cursor: "pointer", font: "var(--type-label)" }}>Questões de fixação (notas)</summary>
        <div style={{ marginTop: 10 }}>
          {f.fixacao_instrucao && <p style={{ margin: "0 0 6px", font: "var(--type-body-sm)" }}>{f.fixacao_instrucao}</p>}
          <Lista itens={f.fixacao ?? []} />
        </div>
      </details>
      <details>
        <summary style={{ cursor: "pointer", font: "var(--type-label)" }}>Fora da aula, por falta de fonte validada ou de escopo ({(f.fora ?? []).length})</summary>
        <div style={{ marginTop: 10 }}>
          <Lista itens={f.fora ?? []} />
        </div>
      </details>
      <details>
        <summary style={{ cursor: "pointer", font: "var(--type-label)" }}>O que mudou só na forma (apresentação v2)</summary>
        <div style={{ marginTop: 10 }}>
          <Lista itens={f.apresentacao ?? []} />
        </div>
      </details>
      {podeImportar && <Importar versionId={versionId} onDone={depois} />}
    </section>
  );
}
