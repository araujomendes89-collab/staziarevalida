// Vigilância por tema (pedido do dono, 13/10/2026): "um motor de busca de atualizações sobre cada tema". Cartão por tema com a
// situação da evidência (em dia, vencida, mudança pendente, sem dossiê), os motivos, as fontes do dossiê e o que depende do tema;
// e o modo do portão (desligado, aviso, bloqueia), que só o administrador muda. Só a equipe vê; o aluno nunca vê motivo nenhum.
import React from "react";
import { Badge, Banner, Button, SegmentedControl, TextField } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { LoadError, Loading, useLoad } from "../../common.jsx";
import { isMissingFunction } from "../AiRequests.jsx";
import { Section, useAction } from "../ui.jsx";
import { AvisoFaltaBanco, chamar, escolher, legenda, linkSeguro, plural, quando, STATUS_FONTE, texto } from "./comum.jsx";

/** Situação do tema: [rótulo, tom, ícone]. */
export const SITUACAO_TEMA = {
  ok: ["Evidência em dia", "success", "shield-check"],
  vencido: ["Conferência vencida", "warning", "clock-alert"],
  mudanca_pendente: ["Mudança pendente", "danger", "file-diff"],
  sem_dossie: ["Sem dossiê", "neutral", "folder-x"],
};
const PAPEL = { principal: "principal", complementar: "complementar", historica: "histórica" };
const MODOS = [
  { value: "desligado", label: "Desligado" },
  { value: "aviso", label: "Só avisar" },
  { value: "bloqueia", label: "Bloquear" },
];
const MODO_TEXTO = {
  desligado: "O portão está desligado: a situação do tema aparece só aqui.",
  aviso: "Na importação de aula e na prévia da publicação, a equipe vê o motivo; nada é travado.",
  bloqueia: "Tema fora de “em dia” trava a importação de aula e a publicação até a equipe resolver.",
};

/** Selo da situação do tema (usado também no detalhe da unidade). */
export function SeloTema({ situacao, size = "sm" }) {
  const s = escolher(SITUACAO_TEMA, situacao?.status);
  if (!s) return null;
  return <Badge size={size} tone={s[1]} icon={s[2]}>{s[0]}</Badge>;
}

function Motivos({ motivos }) {
  if (!Array.isArray(motivos) || motivos.length === 0) return null;
  return (
    <ul style={{ margin: "4px 0 0", paddingLeft: 18, ...texto }}>
      {motivos.map((m, i) => <li key={i}>{m}</li>)}
    </ul>
  );
}

function CartaoTema({ tema, aberto, abrir, aoMudar }) {
  const { backend } = useSession();
  const [nota, setNota] = React.useState("");
  const acao = useAction();
  const conferir = () => acao.run(() => chamar(backend, "app_admin_topic_verified", { p_theme_node_id: tema.tema_id, p_note: nota.trim() }).then(() => { setNota(""); det.reload(); aoMudar?.(); }), "Dossiê marcado como conferido.");
  const det = useLoad(() => (aberto ? backend.rpc("app_admin_topic", { p_theme_node_id: tema.tema_id }) : Promise.resolve(null)), [backend, aberto, tema.tema_id]);
  const d = det.data;
  return (
    <div role="group" aria-label={`Tema ${tema.tema}`} style={{ border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong>{tema.tema}</strong>
        <SeloTema situacao={tema.situacao} />
        <span style={legenda}>{plural((tema.fontes ?? []).length, "fonte", "fontes")} · {plural(Number(tema.pendencias) || 0, "aviso aberto", "avisos abertos")}</span>
      </div>
      <Motivos motivos={tema.situacao?.motivos} />
      <span style={legenda}>Última conferência do dossiê: {quando(tema.verificado_em, "nunca")}</span>
      <div>
        <Button size="sm" variant="ghost" icon={aberto ? "chevron-up" : "chevron-down"} onClick={abrir}>{aberto ? "Fechar" : "Ver fontes e o que depende"}</Button>
      </div>
      {aberto && det.error && <LoadError error={det.error} retry={det.reload} />}
      {aberto && !d && !det.error && <Loading />}
      {aberto && d && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <ul style={{ margin: 0, paddingLeft: 18, ...texto }}>
            {(d.fontes ?? []).map((f) => {
              const st = escolher(STATUS_FONTE, f.status);
              const url = linkSeguro(f.url);
              return (
                <li key={f.id}>
                  {url ? <a href={url} target="_blank" rel="noreferrer">{f.titulo}</a> : f.titulo} ({PAPEL[f.papel] ?? "fonte"}{st ? `, ${st[0].toLowerCase()}` : ""}; link conferido {quando(f.ultima_conferencia, "ainda não")})
                </li>
              );
            })}
          </ul>
          <span style={texto}>
            Depende deste tema: {plural((d.depende?.unidades ?? []).length, "unidade", "unidades")}, {plural(Number(d.depende?.flashcards) || 0, "conjunto de flashcards", "conjuntos de flashcards")}, {plural(Number(d.depende?.questoes) || 0, "questão", "questões")}.
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px" }}>
              <TextField label="O que foi conferido (pelo menos 10 caracteres)" value={nota} onChange={(e) => setNota(e.target.value)} />
            </div>
            <Button size="sm" variant="secondary" icon="check" disabled={nota.trim().length < 10} loading={acao.busy} onClick={conferir}>Marcar dossiê conferido</Button>
          </div>
          {acao.feedback}
        </div>
      )}
    </div>
  );
}

export function TemasVigiados() {
  const { backend } = useSession();
  const lista = useLoad(() => backend.rpc("app_admin_topics"), [backend]);
  const [aberto, setAberto] = React.useState(null);
  const acao = useAction();
  if (isMissingFunction(lista.error)) return <AvisoFaltaBanco titulo="Vigilância por tema ainda indisponível" />;
  const d = lista.data;
  const mudarModo = (modo) => acao.run(() => chamar(backend, "app_admin_vigilance_set_gate", { p_mode: modo }).then(() => lista.reload()), "Modo do portão salvo.");
  return (
    <Section title="Temas vigiados">
      {lista.error && <LoadError error={lista.error} retry={lista.reload} />}
      {!d && !lista.error && <Loading />}
      {d && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* só o administrador grava: para o editor, a recusa do banco aparece logo abaixo */}
            <SegmentedControl label="Portão por tema" value={d.modo_portao} onChange={mudarModo} options={MODOS} />
          </div>
          <span style={legenda}>{MODO_TEXTO[d.modo_portao] ?? MODO_TEXTO.desligado} Só o administrador muda o modo.</span>
          {acao.error && <Banner tone="danger">{acao.error}</Banner>}
          {(d.temas ?? []).length === 0 && <span style={texto}>Nenhum tema com dossiê ainda.</span>}
          {(d.temas ?? []).map((t) => (
            <CartaoTema key={t.tema_id} tema={t} aberto={aberto === t.tema_id} abrir={() => setAberto(aberto === t.tema_id ? null : t.tema_id)} aoMudar={lista.reload} />
          ))}
        </div>
      )}
    </Section>
  );
}

/** No detalhe de uma unidade: situação do tema dela (só a equipe vê). Sem a função no banco, não mostra nada. */
export function TemaDaUnidade({ unitId }) {
  const { backend } = useSession();
  const r = useLoad(() => (unitId ? backend.rpc("app_admin_unit_topic", { p_unit_id: unitId }) : Promise.resolve(null)), [backend, unitId]);
  const g = r.data;
  if (!g || r.error || !g.status) return null;
  const tom = escolher(SITUACAO_TEMA, g.status)?.[1] ?? "neutral";
  return (
    <Banner tone={tom === "success" ? "success" : tom === "danger" ? "warning" : "info"} icon="radar" title={`Evidência do tema${g.tema ? ` “${g.tema}”` : ""}: ${escolher(SITUACAO_TEMA, g.status)?.[0] ?? ""}`}>
      <Motivos motivos={g.motivos} />
      {g.modo === "bloqueia" && g.status !== "ok" && <p style={{ margin: "4px 0 0" }}>O portão está em “Bloquear”: a publicação fica travada até a equipe resolver.</p>}
    </Banner>
  );
}
