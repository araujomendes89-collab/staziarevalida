// Grandes Temas: os 100 Grandes Temas Prioritários do StaziaMed, nas 7 áreas, com a contagem REAL de questões oficiais
// catalogadas (Revalida e ENAMED) ligadas a cada tema. Seleção pedagógica, não é ranking do Inep nem previsão de prova.
// Os dados vêm de app_grandes_temas (migração 9960); o treino do tema usa o filtro grande_tema do sorteio de questões.
import React from "react";
import { Banner, EmptyState, TextField } from "../../ds";
import { AreaBloco, AreaFiltro, Recolhivel } from "./casca.jsx";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { LoadError, Loading, useDebounced, useLoad } from "../admin/common.jsx";
import { TemaAula } from "./TemaAula.jsx";
import { TemaCartao } from "./TemaCartao.jsx";
import { useInRouterContext, useSearchParams } from "react-router-dom";
import "./temas.css";

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
  // Progresso real da aula (seções estudadas), que a própria aula calcula quando é aberta; fica guardado enquanto a tela vive.
  const [progresso, setProgresso] = React.useState({});
  const onProgresso = React.useCallback((id, pct) => setProgresso((p) => (p[id] === pct ? p : { ...p, [id]: pct })), []);
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
    return <TemaAula tema={aulaTema} mobile={mobile} onBack={() => setAberta(null)} go={{ train, flash: () => go("flash") }} onProgresso={onProgresso} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Recolhivel titulo="Como contamos">
        {data.method} Hoje o catálogo tem {plural(data.official_total, "questão oficial", "questões oficiais")} (fora as {data.annulled} anuladas):{" "}
        {data.linked} {data.linked === 1 ? "está ligada" : "estão ligadas"} a algum dos 100 temas e {data.unlinked} ainda não {data.unlinked === 1 ? "tem" : "têm"} tema,
        porque o assunto delas fica fora dos 100 temas ou não tem uma casa clara.
      </Recolhivel>
      <div className="ap-busca"><TextField icon="search" aria-label="Buscar" placeholder="Buscar tema, subárea ou área" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <AreaFiltro valor={area} onChange={setArea} itens={[{ id: "", label: "Todas", k: "todas" }, ...data.areas.map((a) => ({ id: a.id, label: a.name, k: a.id }))]} />
      {startError && <Banner tone="warning">{startError}</Banner>}
      <div className="ap-conta">{plural(themes.length, "tema", "temas")}</div>
      {themes.length === 0 && <EmptyState icon="search" title="Nada encontrado" description="Tente outra busca ou outra área." />}
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`gt-${g.id}`} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="ap-grupo">
            <AreaBloco k={g.id} tamanho={40} />
            <div className="ap-grupo-tx">
              <h2 id={`gt-${g.id}`} className="ap-grupo-nome">
                {g.name}
                <span className="ap-grupo-sub">{plural(g.themes, "tema", "temas")} · {plural(g.questions, "questão ligada", "questões ligadas")}</span>
              </h2>
            </div>
          </div>
          <div className="gt-grade">
            {g.items.map((t) => (
              <TemaCartao
                key={t.id}
                t={t}
                aula={temAula.has(t.id)}
                progresso={progresso[t.id]}
                starting={starting === t.id}
                onAbrir={() => openAula(t)}
                onTreinar={() => train(t)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
