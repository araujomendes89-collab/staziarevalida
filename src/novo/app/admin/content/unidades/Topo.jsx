// Topo da página da Unidade: cabeçalho (lido do banco) e "Caminho até publicar" com passos e estados reais.
import React from "react";
import { Badge, Button } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { AREA_LABEL, UNIT_STATUS } from "../labels.js";
import { StatusBadge } from "../ui.jsx";
import { curto, dataCurta, dataHora, ehObjeto } from "./rotulos.js";

/** Lê a visão geral da unidade; sem a função nova no banco (ou resposta que não é a esperada), devolve nulo e a tela não mostra o bloco. */
export function useVisaoGeral(versionId, refresh) {
  const { backend } = useSession();
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    let vivo = true;
    backend
      .rpc("app_ch_unit_overview", { p_version_id: versionId })
      .then((d) => vivo && setData(ehObjeto(d) && d.unit ? d : null))
      .catch(() => vivo && setData(null));
    return () => {
      vivo = false;
    };
  }, [backend, versionId, refresh]);
  return data;
}

export function CabecalhoUnidade({ o }) {
  const { unit, version } = o;
  const cam = unit.caminho ?? {};
  const area = cam.area ?? AREA_LABEL[cam.area_code] ?? "";
  return (
    <section className="sm-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }} aria-label="Cabeçalho da unidade">
      <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Administração › Central de Conteúdo › Unidades</div>
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, font: "var(--type-h3)", overflowWrap: "anywhere" }}>
            {unit.title} {unit.code && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{unit.code}</span>}
          </h2>
        </div>
        <StatusBadge map={UNIT_STATUS} value={version.status} size="md" />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Badge>{[area, cam.subarea].filter(Boolean).join(" › ") || "Sem área"}</Badge>
        <Badge>
          Versão {version.version} · {dataCurta(version.date)}
        </Badge>
        {o.questoes_ligadas != null && <Badge tone="brand">{o.questoes_ligadas} questões ligadas</Badge>}
        <Badge>{o.palavras.toLocaleString("pt-BR")} palavras para o aluno</Badge>
        <Badge tone={o.afirmacoes.validadas === o.afirmacoes.total && o.afirmacoes.total > 0 ? "success" : "warning"}>
          {o.afirmacoes.validadas} de {o.afirmacoes.total} afirmações validadas
        </Badge>
      </div>
    </section>
  );
}

function Passo({ n, estado, titulo, children, agora }) {
  const cores = {
    feito: ["var(--success-bg)", "var(--success-text)", "var(--success-border)"],
    aviso: ["var(--warning-bg)", "var(--warning-text)", "var(--warning-border)"],
    pendente: ["var(--surface-sunken)", "var(--text-secondary)", "var(--border-default)"],
  }[estado];
  return (
    <li style={{ display: "flex", gap: 12, alignItems: "flex-start", listStyle: "none" }} data-estado={estado}>
      <span aria-hidden style={{ flex: "none", width: 28, height: 28, borderRadius: 999, background: cores[0], color: cores[1], border: `2px solid ${cores[2]}`, display: "grid", placeItems: "center", font: "var(--type-label)" }}>
        {estado === "feito" ? "✓" : n}
      </span>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>{titulo}</strong>
          {agora && <Badge tone="warning" size="sm">agora</Badge>}
        </div>
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{children}</span>
      </div>
    </li>
  );
}

/** Passos do caminho, na ordem, cada um com o estado que o banco devolveu. */
export function passosDoCaminho(o) {
  const a = o.afirmacoes;
  const g = o.portao ?? {};
  const med = o.aprovacao_medica ?? {};
  const ed = o.aprovacao_editorial ?? {};
  const nomeStatus = { sem_dossie: "sem dossiê de evidência", vencido: "com a conferência vencida", mudanca_pendente: "com mudança pendente em fonte" };
  const portaoOk = g.status === "ok";
  const motivos = (g.motivos ?? []).join(" ");
  const passos = [
    {
      id: "auditoria",
      titulo: "Auditoria científica",
      estado: o.auditoria.estado === "feita" ? "feito" : o.auditoria.estado === "com_pendencias" ? "aviso" : "pendente",
      texto:
        o.auditoria.estado === "feita"
          ? `Feita${o.auditoria.data ? ` em ${dataCurta(o.auditoria.data)}` : ""}. Cada afirmação foi conferida contra o trecho literal da fonte.`
          : o.auditoria.estado === "com_pendencias"
            ? `${a.sem_validacao} afirmação(ões) ainda sem trecho validado na fonte.`
            : "Ainda não há afirmações com evidência.",
    },
    {
      id: "afirmacoes",
      titulo: `${a.validadas} afirmações validadas`,
      estado: a.total > 0 && a.sem_validacao === 0 && a.criticas_sem_conferencia === 0 ? "feito" : "aviso",
      texto: `Cada uma com fonte, página e citação (lista só da equipe, abaixo).${a.criticas_sem_conferencia ? ` ${a.criticas_sem_conferencia} com dose, tempo ou via ainda esperam a conferência do administrador ou do revisor médico (decisão a revisar: o administrador pode conferir; automação e IA nunca).` : ""}`,
    },
    {
      id: "medica",
      titulo: med.valida ? "Aprovação médica feita" : "Aprovação médica pendente",
      estado: med.valida ? "feito" : "pendente",
      texto: med.valida
        ? `Por ${med.por}, em ${dataHora(med.em)}. Valeu para a versão ${curto(med.hash)}; qualquer mudança depois derruba a aprovação.`
        : "Do administrador ou do revisor médico. A aula não vai ao aluno antes. Ela só vale para esta versão exata.",
    },
    {
      id: "editorial",
      titulo: ed.valida ? "Aprovação editorial feita" : "Aprovação editorial pendente",
      estado: ed.valida ? "feito" : "pendente",
      texto: ed.valida ? `Por ${ed.por}, em ${dataHora(ed.em)}.` : "Do editor ou do administrador. É separada da aprovação médica e da publicação.",
    },
    {
      id: "portao",
      titulo: "Portão de atualidade da vigilância",
      // Segue o MODO GERAL do portão (Vigilância científica): desligado não segura; só avisar mostra o motivo e deixa publicar; bloquear segura.
      estado: portaoOk ? "feito" : g.modo === "bloqueia" ? "aviso" : g.modo === "aviso" ? "aviso" : "feito",
      naoTrava: !portaoOk && g.modo !== "bloqueia",
      texto: portaoOk
        ? `As fontes do tema estão na versão mais recente${g.verificado_em ? ` (dossiê conferido em ${dataCurta(g.verificado_em)})` : ""}.`
        : g.modo === "bloqueia"
          ? `Tema ${nomeStatus[g.status] ?? "sem situação"}. ${motivos} O portão está em "Bloquear": para publicar, o tema precisa estar em ordem (Vigilância científica › Temas).`
          : g.modo === "aviso"
            ? `Atenção: tema ${nomeStatus[g.status] ?? "sem situação"}. ${motivos} O portão está em "Só avisar": isto não impede a publicação.`
            : "O portão de atualidade está desligado na Vigilância científica: não segura a publicação desta unidade.",
    },
  ];
  const publicavel = o.pode?.publicar === true;
  passos.push({
    id: "publicar",
    titulo: o.publicacao.no_ar ? "Publicada ao aluno" : "Publicar",
    estado: o.publicacao.no_ar ? "feito" : "pendente",
    texto: o.publicacao.no_ar ? `No ar desde ${dataHora(o.publicacao.em)}.` : publicavel ? "Tudo pronto: o administrador pode publicar." : "Bloqueado até os passos acima estarem feitos.",
  });
  const primeiro = passos.findIndex((p) => p.estado !== "feito" && !p.naoTrava);
  return passos.map((p, i) => ({ ...p, agora: i === primeiro }));
}

export function CaminhoAtePublicar({ o, onPublish }) {
  const passos = passosDoCaminho(o);
  const podePublicar = o.pode?.publicar === true && !o.publicacao.no_ar;
  const falta = passos.filter((p) => p.estado !== "feito" && !p.naoTrava && p.id !== "publicar").map((p) => p.titulo.toLowerCase());
  const outros = (o.publicacao.problemas ?? []).filter((p) => !/Vigilância científica/.test(p));
  return (
    <section className="sm-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }} aria-label="Caminho até publicar">
      <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Caminho até publicar</h3>
      <ol style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {passos.map((p, i) => (
          <Passo key={p.id} n={i + 1} estado={p.estado} titulo={p.titulo} agora={p.agora}>
            {p.texto}
          </Passo>
        ))}
      </ol>
      {!o.publicacao.no_ar && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
          <Button icon="globe" disabled={!podePublicar} onClick={onPublish}>
            Publicar ao aluno
          </Button>
          {!podePublicar && (
            <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
              Desligado enquanto faltam: {falta.length ? falta.join(", ") : o.pode?.publicar === false && !o.pode?.aprovar_medica ? "a publicação é do administrador" : "as travas de conteúdo abaixo"}.
              {outros.length > 0 && ` Há ${outros.length} trava(s) de conteúdo para resolver.`}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
