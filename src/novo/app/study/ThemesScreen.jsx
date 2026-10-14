// Grandes Temas: os 100 Grandes Temas Prioritários do StaziaMed, nas 7 áreas, com a contagem REAL de questões oficiais
// catalogadas (Revalida e ENAMED) ligadas a cada tema. Seleção pedagógica, não é ranking do Inep nem previsão de prova.
// Os dados vêm de app_grandes_temas (migração 9960); o treino do tema usa o filtro grande_tema do sorteio de questões.
import React from "react";
import { Badge, Banner, Button, Card, EmptyState, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { LoadError, Loading, useDebounced, useLoad } from "../admin/common.jsx";
import { TutorButton } from "../tutor/TutorDrawer.jsx";
import { temaVars } from "./temaCores.js";
import { TemaAula } from "./TemaAula.jsx";
import { useInRouterContext, useSearchParams } from "react-router-dom";
import "./temas.css";

/** Situação do conteúdo de cada tema (o que o aluno pode esperar encontrar). */
const STATUS = {
  aula_pronta_aguardando_revisao: { label: "Aula pronta, aguardando revisão médica", tone: "info", icon: "clock" },
  roteiro_em_validacao: { label: "Roteiro em validação", tone: "neutral", icon: "clock" },
};

// Sem acento e em minúsculas, para a busca achar "ginecologia" em "Ginecologia" e "pre natal" em "pré-natal".
const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Qual aula está aberta: guardado no endereço (?aula=ordem, sem código interno) para o botão Voltar do navegador funcionar; sem roteador (testes), em memória. */
function useAulaAberta() {
  const inRouter = useInRouterContext();
  const local = React.useState(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const url = inRouter ? useSearchParams() : null;
  if (!url) return local;
  const [params, setParams] = url;
  const value = params.get("aula");
  return [value ? Number(value) : null, (next) => setParams(next ? { aula: String(next) } : {}, { replace: false })];
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function ThemesScreen({ go }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const [area, setArea] = React.useState("");
  const [search, setSearch] = React.useState("");
  const q = fold(useDebounced(search, 200));
  const [aberta, setAberta] = useAulaAberta();
  const scroll = React.useRef(null);
  const [starting, setStarting] = React.useState(null);
  const [startError, setStartError] = React.useState(null);
  const { data, error, reload } = useLoad(() => backend.rpc("app_grandes_temas"), [backend]);
  // Temas com aula PUBLICADA (só o aluno vê o botão nesses). Se a função ainda não existe no banco, simplesmente não há botão.
  const { data: comAula } = useLoad(() => backend.rpc("app_temas_com_aula").catch(() => []), [backend]);
  const temAula = React.useMemo(() => new Set(Array.isArray(comAula) ? comAula : []), [comAula]);
  // Ao voltar da aula, a lista volta para o mesmo ponto (filtro e busca ficam guardados porque esta tela não é desmontada).
  React.useLayoutEffect(() => {
    if (aberta == null && scroll.current != null) window.scrollTo({ top: scroll.current, behavior: "instant" });
  }, [aberta]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;

  const openAula = (t) => {
    scroll.current = window.scrollY;
    setAberta(t.order);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const themes = data.themes.filter(
    (t) => (!area || t.area === area) && (!q || fold(`${t.title} ${t.subarea ?? ""} ${t.area_name}`).includes(q))
  );
  const max = Math.max(1, ...data.themes.map((t) => t.total));
  const groups = data.areas.map((a) => ({ ...a, items: themes.filter((t) => t.area === a.id) })).filter((g) => g.items.length > 0);

  const train = async (t) => {
    setStarting(t.id);
    setStartError(null);
    try {
      const started = await backend.rpc("app_start_session", { p_kind: "questoes", p_filters: { grande_tema: t.id }, p_count: 20 });
      go("sessao", { s: started.session_id });
    } catch (e) {
      setStartError("Não há questões disponíveis nesse tema agora.");
      setStarting(null);
    }
  };

  const aulaTema = aberta != null ? data.themes.find((t) => t.order === aberta && temAula.has(t.id)) : null;
  if (aulaTema) {
    return <TemaAula tema={aulaTema} mobile={mobile} onBack={() => setAberta(null)} go={{ train, flash: () => go("flash") }} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Banner tone="info" icon="chart-column" title="Como contamos">
        {data.method} Hoje o catálogo tem {plural(data.official_total, "questão oficial", "questões oficiais")} (fora as {data.annulled} anuladas):{" "}
        {data.linked} {data.linked === 1 ? "está ligada" : "estão ligadas"} a algum dos 100 temas e {data.unlinked} ainda não {data.unlinked === 1 ? "tem" : "têm"} tema,
        porque o assunto delas fica fora dos 100 temas ou não tem uma casa clara.
      </Banner>
      <TextField icon="search" aria-label="Buscar" placeholder="Buscar tema, subárea ou área" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Grande área">
        {[{ id: "", name: "Todas", themes: data.themes.length }, ...data.areas].map((a) => (
          <button
            key={a.id}
            type="button"
            className={`sm-chip gt-chip-area${area === a.id ? " is-selected" : ""}`}
            style={a.id ? temaVars(`area-${a.id}`, a.id) : undefined}
            aria-pressed={area === a.id}
            onClick={() => setArea(a.id)}
          >
            {a.id && <span className="gt-dot" aria-hidden="true" />}
            {a.name}
          </button>
        ))}
      </div>
      {startError && <Banner tone="warning">{startError}</Banner>}
      <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{plural(themes.length, "tema", "temas")}</div>
      {themes.length === 0 && <EmptyState icon="search" title="Nada encontrado" description="Tente outra busca ou outra área." />}
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`gt-${g.id}`} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 id={`gt-${g.id}`} style={{ margin: 0, font: "var(--type-h4)", display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            {g.name}
            <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", fontWeight: 400 }}>
              {plural(g.themes, "tema", "temas")} · {plural(g.questions, "questão ligada", "questões ligadas")}
            </span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
            {g.items.map((t) => {
              const exams = Object.entries(t.by_exam).sort(([a], [b]) => a.localeCompare(b));
              const aula = temAula.has(t.id);
              const status = aula ? { label: "Aula disponível", tone: "success", icon: "check" } : STATUS[t.status] ?? STATUS.roteiro_em_validacao;
              return (
                <Card key={t.id} className="gt-card" padding={20} style={{ borderRadius: 20, display: "flex", flexDirection: "column", gap: 10, ...temaVars(t.id, t.area) }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Badge size="sm" tone={status.tone} icon={status.icon}>
                      {status.label}
                    </Badge>
                    <Badge size="sm" tone={t.total > 0 ? "brand" : "neutral"}>
                      {t.total > 0 ? `${plural(t.total, "questão", "questões")} · ${plural(exams.length, "prova", "provas")}` : "0 questões"}
                    </Badge>
                  </div>
                  <div style={{ font: "600 16px/1.35 var(--font-sans)", overflowWrap: "anywhere" }}>{t.title}</div>
                  <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                    Tema {t.order}
                    {t.subarea ? ` · ${t.subarea}` : ""}
                  </div>
                  <div className="gt-bar" aria-hidden="true">
                    <span style={{ width: `${t.total > 0 ? Math.max((t.total / max) * 100, 4) : 0}%` }} />
                  </div>
                  {t.total === 0 && <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>Ainda não há questão oficial catalogada ligada a este tema.</div>}
                  <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {aula && (
                        <Button variant="primary" size="sm" iconRight="chevron-right" onClick={() => openAula(t)}>
                          Abrir a aula
                        </Button>
                      )}
                      {t.total > 0 && (
                        <Button variant="link" size="sm" iconRight="chevron-right" loading={starting === t.id} onClick={() => train(t)}>
                          Treinar este tema
                        </Button>
                      )}
                      <TutorButton request={{ mode: "perguntas", topic: t.title, context: { type: "theme", id: t.id, label: t.title, area: t.area_name } }} label="Me teste" variant="ghost" />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
