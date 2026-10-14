// Portão de atualidade dos 100 Grandes Temas (pedido do dono, 13/10/2026): "nenhum conteúdo vai ao aluno com fonte desatualizada".
// Mostra, por tema, "Em dia / Atenção / Desatualizado / Sem dossiê", os motivos em português simples, as fontes do dossiê com a
// evidência de cada vínculo, a lista do que falta cadastrar e o botão "Marcar conferido" (nome de quem conferiu e a data). As fontes
// vêm como PROPOSTA por correspondência de texto: só valem depois que a equipe confere. Só a equipe vê; o aluno nunca vê.
import React from "react";
import { Badge, Banner, Button, SegmentedControl, TextField } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { LoadError, Loading, useLoad } from "../../common.jsx";
import { isMissingFunction } from "../AiRequests.jsx";
import { Section, useAction } from "../ui.jsx";
import { AvisoFaltaBanco, chamar, escolher, legenda, linkSeguro, plural, quando, texto } from "./comum.jsx";

export const NIVEL_TEMA = {
  em_dia: ["Em dia", "success", "shield-check"],
  atencao: ["Atenção", "warning", "triangle-alert"],
  desatualizado: ["Desatualizado", "danger", "file-diff"],
  sem_dossie: ["Sem dossiê", "neutral", "folder-x"],
};
const FILTROS = [
  { value: "todos", label: "Todos" },
  { value: "desatualizado", label: "Desatualizado" },
  { value: "atencao", label: "Atenção" },
  { value: "em_dia", label: "Em dia" },
  { value: "sem_dossie", label: "Sem dossiê" },
];
const MODOS = [
  { value: "desligado", label: "Desligado" },
  { value: "aviso", label: "Só avisar" },
  { value: "bloqueia", label: "Bloquear" },
];
const PAPEL = { principal: "principal", complementar: "complementar", historica: "histórica" };
const TIPO_EVIDENCIA = { titulo: "termo no título", temas: "termo nos temas do documento", texto: "termo no texto do PDF", versao_anterior_de: "versão anterior de", equipe: "escolhida pela equipe" };

const evidencia = (e) => {
  if (!e) return "";
  const base = TIPO_EVIDENCIA[e.tipo] ?? e.tipo;
  if (e.tipo === "texto") return `${base} “${e.termo}” em ${e.paginas} páginas (ex.: ${(e.exemplos ?? []).join(", ")})${e.paginas_ocr?.length ? ", algumas lidas por OCR (baixa confiança)" : ""}`;
  return e.termo ? `${base} “${e.termo}”` : base;
};

function Lista({ itens, vazio }) {
  if (!Array.isArray(itens) || itens.length === 0) return vazio ? <span style={legenda}>{vazio}</span> : null;
  return <ul style={{ margin: "4px 0 0", paddingLeft: 18, ...texto }}>{itens.map((m, i) => <li key={i}>{m}</li>)}</ul>;
}

function CartaoGt({ tema, aberto, abrir, aoMudar }) {
  const { backend } = useSession();
  const [nome, setNome] = React.useState("");
  const [nota, setNota] = React.useState("");
  const acao = useAction();
  const det = useLoad(() => (aberto ? backend.rpc("app_admin_gt", { p_tema_id: tema.tema_id }) : Promise.resolve(null)), [backend, aberto, tema.tema_id]);
  const d = det.data;
  const n = escolher(NIVEL_TEMA, tema.nivel) ?? NIVEL_TEMA.sem_dossie;
  const conferir = () => acao.run(() => chamar(backend, "app_admin_gt_verified", { p_tema_id: tema.tema_id, p_name: nome.trim(), p_note: nota.trim() }).then(() => { setNota(""); det.reload(); aoMudar?.(); }), "Tema marcado como conferido.");
  const tirar = (f) => acao.run(() => chamar(backend, "app_admin_gt_set_source", { p_tema_id: tema.tema_id, p_catalogo_id: f.catalogo_id, p_role: null }).then(() => { det.reload(); aoMudar?.(); }), "Fonte tirada do dossiê.");
  return (
    <div role="group" aria-label={`Tema ${tema.titulo}`} style={{ border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong>{tema.tema_id} · {tema.titulo}</strong>
        <Badge size="sm" tone={n[1]} icon={n[2]}>{n[0]}</Badge>
        <span style={legenda}>{tema.area} · {plural(Number(tema.n_principais_cadastradas) || 0, "fonte principal cadastrada", "fontes principais cadastradas")} de {Number(tema.n_principais) || 0} indicadas</span>
      </div>
      <Lista itens={tema.motivos} />
      <Lista itens={tema.avisos} />
      <span style={legenda}>{tema.verificado_em ? `Conferido por ${tema.verificado_nome ?? "—"} em ${quando(tema.verificado_em)}` : "Nunca conferido pela equipe."}{tema.prazo_dias ? ` Prazo: ${tema.prazo_dias} dias.` : ""}</span>
      <div><Button size="sm" variant="ghost" icon={aberto ? "chevron-up" : "chevron-down"} onClick={abrir}>{aberto ? "Fechar" : "Ver fontes e conferir"}</Button></div>
      {aberto && det.error && <LoadError error={det.error} retry={det.reload} />}
      {aberto && !d && !det.error && <Loading />}
      {aberto && d && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(d.faltam ?? []).length > 0 && <Banner tone="warning" title="Falta cadastrar na biblioteca"><Lista itens={d.faltam} /></Banner>}
          <ul style={{ margin: 0, paddingLeft: 18, ...texto }}>
            {(d.fontes ?? []).filter((f) => !f.removida).map((f) => {
              const url = linkSeguro(f.url);
              return (
                <li key={f.catalogo_id}>
                  {url ? <a href={url} target="_blank" rel="noreferrer">{f.titulo}</a> : f.titulo} ({PAPEL[f.papel] ?? "fonte"}{f.ano ? `, ${f.ano}` : ""}; {f.cadastrada ? "cadastrada na biblioteca" : "ainda não cadastrada"})
                  <div style={legenda}>Por que está aqui: {(f.evidencia ?? []).map(evidencia).join("; ") || "—"}{f.ajuste ? ` · Ajuste: ${f.ajuste}` : ""}</div>
                  <Button size="sm" variant="ghost" icon="x" onClick={() => tirar(f)}>Tirar do dossiê</Button>
                </li>
              );
            })}
          </ul>
          {(d.fontes ?? []).length === 0 && <span style={texto}>Nenhuma fonte com evidência encontrada para este tema: ele fica “sem dossiê” até a equipe indicar a fonte oficial.</span>}
          <span style={legenda}>Palavras-chave da busca de documento novo: {(d.palavras_chave ?? []).join(", ") || "—"}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}><TextField label="Quem conferiu (nome)" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div style={{ flex: "2 1 260px" }}><TextField label="O que foi conferido (pelo menos 10 caracteres)" value={nota} onChange={(e) => setNota(e.target.value)} /></div>
            <Button size="sm" variant="secondary" icon="check" disabled={nome.trim().length < 3 || nota.trim().length < 10} loading={acao.busy} onClick={conferir}>Marcar conferido</Button>
          </div>
          {acao.feedback}
        </div>
      )}
    </div>
  );
}

export function GrandesTemasAtualidade() {
  const { backend } = useSession();
  const lista = useLoad(() => backend.rpc("app_admin_gt_list"), [backend]);
  const [filtro, setFiltro] = React.useState("todos");
  const [aberto, setAberto] = React.useState(null);
  const acao = useAction();
  if (isMissingFunction(lista.error)) return <AvisoFaltaBanco titulo="Portão de atualidade dos 100 temas ainda indisponível" />;
  const d = lista.data;
  const mudarModo = (modo) => acao.run(() => chamar(backend, "app_admin_vigilance_set_gate", { p_mode: modo }).then(() => lista.reload()), "Modo do portão salvo.");
  const temas = (d?.temas ?? []).filter((t) => filtro === "todos" || t.nivel === filtro);
  const r = d?.resumo ?? {};
  return (
    <Section title="Atualidade dos 100 Grandes Temas">
      {lista.error && <LoadError error={lista.error} retry={lista.reload} />}
      {!d && !lista.error && <Loading />}
      {d && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Banner tone="info" icon="radar" title="Portão de atualidade">
            <p style={{ margin: 0 }}>Aula, questão inédita e explicação só vão ao aluno com fonte em dia. As fontes abaixo são uma proposta feita por comparação de texto: confira e clique em “Marcar conferido”. O gabarito oficial nunca é mexido por aqui.</p>
          </Banner>
          <div style={{ display: "flex", gap: "4px 16px", flexWrap: "wrap", ...texto }}>
            <span>{plural(Number(r.em_dia) || 0, "tema em dia", "temas em dia")}</span>
            <span>{plural(Number(r.atencao) || 0, "com atenção", "com atenção")}</span>
            <span>{plural(Number(r.desatualizado) || 0, "desatualizado", "desatualizados")}</span>
            <span>{plural(Number(r.sem_dossie) || 0, "sem dossiê", "sem dossiê")}</span>
          </div>
          <SegmentedControl label="Portão" value={d.modo_portao} onChange={mudarModo} options={MODOS} />
          <span style={legenda}>Recomendação: “Só avisar” até os dossiês estarem completos; depois “Bloquear” para aula e questão. Só o administrador muda o modo.</span>
          {acao.error && <Banner tone="danger">{acao.error}</Banner>}
          <SegmentedControl label="Mostrar" value={filtro} onChange={setFiltro} options={FILTROS} />
          {temas.length === 0 && <span style={texto}>Nenhum tema nesta situação.</span>}
          {temas.map((t) => <CartaoGt key={t.tema_id} tema={t} aberto={aberto === t.tema_id} abrir={() => setAberto(aberto === t.tema_id ? null : t.tema_id)} aoMudar={lista.reload} />)}
        </div>
      )}
    </Section>
  );
}
