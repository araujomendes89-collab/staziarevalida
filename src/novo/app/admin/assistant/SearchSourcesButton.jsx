// "Buscar fontes com IA" dentro das abas onde falta fonte (assistente de Questões e de Atualizações, Editar atualização, Análise de
// questões). Pede UMA busca de um tema pela mesma função da tela Fontes (app_ch_source_search_start): não existe fila nova.
// A IA só procura nos sites oficiais da lista; o servidor baixa e confere; nada vira fonte sem a aprovação do administrador na aba
// Fontes. Só o administrador pede; os outros veem o aviso. Tela só da Administração: o aluno nunca vê.
import React from "react";
import { Banner, Button, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { AREAS } from "../../practice/format.js";
import { PROVIDER_NAME, usd } from "../ai/aiApi.js";
import { useLoad } from "../common.jsx";
import { hubGet } from "../content/api.js";
import { SEARCH_STATUS } from "../content/labels.js";

/** Custo médio MEDIDO por tema nas buscas reais (US$ 0,38 em 55 temas, 2026-10-12), arredondado: a tela diz "cerca de". */
export const AVERAGE_COST_USD = 0.4;
export const NOTE = "Só entra na biblioteca depois que você aprovar na aba Fontes.";
export const ASK_ADMIN = "Peça ao administrador para buscar fontes deste tema.";
export const OLD_SQL = "O sistema está aguardando uma atualização para liberar esta busca. Avise quem cuida do sistema e tente de novo mais tarde.";
export const GENERIC_ERROR = "Não foi possível concluir agora. Tente de novo; se continuar, avise quem cuida do sistema.";
const ACTIVE = new Set(["na_fila", "buscando", "conferindo"]);
/** Busca parada (teto, função desligada): continua a ser acompanhada, mais devagar, e volta ao andamento quando retoma. */
const WATCHED = new Set([...ACTIVE, "pendente"]);
const SLOW_FACTOR = 3;
const caption = { font: "var(--type-caption)", color: "var(--text-tertiary)", margin: 0 };
/** Sem item aberto (Análise de questões, busca de trechos): o administrador escreve o tema. */
export const OPEN_CONTEXT = { area: null, theme: "", freeText: null };
const AREA_IDS = new Set(AREAS.map((a) => a.id));
const clean = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Área e tema do item aberto na aba (e o texto livre do pedido). Atualizações: tema, subtema e instituição; Questões: tema e subtema. */
export function sourceSearchContext(tab, form) {
  const f = form ?? {};
  const topic = clean(f.topic, 120);
  const sub = clean(f.subtopic, 120);
  const area = AREA_IDS.has(f.area) ? f.area : null;
  const theme = topic || sub;
  const parts = [topic && sub ? `Subtema: ${sub}` : "", tab === "atualizacoes" && clean(f.institution, 100) ? `Instituição: ${clean(f.institution, 100)}` : ""].filter(Boolean);
  return { area, theme, freeText: parts.join(". ").slice(0, 300) || null };
}

/** Texto de erro que o dono pode ler: mensagem do sistema em português passa; erro cru (inglês, nome de função, rede) vira um aviso simples. */
export function friendlyError(error) {
  const raw = String(error?.message ?? error ?? "").trim();
  if (!raw) return GENERIC_ERROR;
  if (/could not find the function|schema cache|PGRST202|42883/i.test(raw)) return OLD_SQL;
  if (/failed to fetch|network|fetch failed|timeout|timed out|ECONN|load failed/i.test(raw)) return "Sem conexão com o servidor agora. Confira a internet e tente de novo.";
  if (/permission denied|not authorized|jwt|forbidden|row-level security/i.test(raw)) return "Você não tem permissão para pedir esta busca.";
  // erro cru do banco, do navegador ou de biblioteca (inglês, nome de função, código): aviso genérico; o português do sistema passa
  const technical = /\b(function|relation|column|syntax|violates|constraint|null value|undefined|exception|failed|invalid input|typeerror|referenceerror|sql|pgrst|schema|public\.|unexpected|cannot|could not|unable|went wrong|not found|internal server error|bad request)\b/i.test(raw) || /^(error|erro \d+)/i.test(raw) || /\b(the|is|was|please)\b/i.test(raw);
  return technical ? GENERIC_ERROR : raw;
}

/** O erro é "a função não existe no banco" (site novo, SQL antigo)? */
export const isMissingFunction = (error) => /could not find the function|schema cache|does not exist|PGRST202|42883/i.test(String(error?.message ?? error ?? ""));

const dayBR = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "");
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function progressOf(search) {
  const found = Number(search.verified_count ?? 0);
  const why = typeof search.message === "string" && search.message.trim() ? friendlyError(search.message) : "";
  switch (search.status) {
    case "na_fila":
      return { tone: "info", busy: true, text: "Na fila: a busca começa em instantes (roda no processamento da Central; pode levar até ~10 minutos)." };
    case "buscando":
      return { tone: "info", busy: true, text: "A IA está buscando nos sites oficiais…" };
    case "conferindo":
      return { tone: "info", busy: true, text: "Conferindo os documentos achados (baixando e comparando com o trecho)…" };
    case "concluida":
      return found > 0
        ? { tone: "success", text: `Concluída com ${plural(found, "candidato", "candidatos")} para você conferir.`, link: true }
        : { tone: "warning", text: `Concluída, mas nenhum achado passou na conferência${Number(search.discarded_count) > 0 ? ` (${plural(Number(search.discarded_count), "descartado", "descartados")})` : ""}.${why ? ` ${why}` : ""}`, link: true };
    case "nada_encontrado":
      return { tone: "warning", text: `Nada encontrado nos sites oficiais.${why ? ` ${why}` : ""}` };
    case "pendente":
      return { tone: "warning", text: `A busca está parada${why ? `: ${why}` : "."} Ela continua quando o problema for resolvido.` };
    case "falhou":
      return { tone: "danger", text: `A busca falhou${why ? `: ${why}` : "."}` };
    default:
      return { tone: "info", busy: true, text: "Acompanhando a busca…" };
  }
}

function CandidatesLink() {
  // abre em outra janela: quem está editando um item não perde o que digitou
  const href = `${typeof window === "undefined" ? "" : window.location.pathname}?aba=conteudo&secao=fontes`;
  return (
    <a className="sm-btn sm-btn--secondary sm-btn--sm" href={href} target="_blank" rel="noopener noreferrer">
      Ver candidatos
    </a>
  );
}

export function SearchSourcesButton({ tab, form = undefined, context = undefined, pollMs = 5000 }) {
  const { backend, boot } = useSession();
  const isAdmin = boot?.role === "admin";
  const base = React.useMemo(() => context ?? sourceSearchContext(tab, form), [context, tab, form]);
  const [typed, setTyped] = React.useState("");
  const theme = base.theme || typed.trim();
  const status = useLoad(() => (isAdmin ? hubGet(backend, "/source-search/status") : Promise.resolve(null)), [backend, isAdmin]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [oldSql, setOldSql] = React.useState(false);
  const [repeat, setRepeat] = React.useState(null);
  const [searchId, setSearchId] = React.useState(null);
  const [search, setSearch] = React.useState(null);
  const [already, setAlready] = React.useState(false);

  const check = (id) => backend.rpc("app_ch_source_search_check", { p_area: base.area, p_theme: theme, ...(id ? { p_search_id: id } : {}) });

  // acompanha a busca pedida até o fim
  React.useEffect(() => {
    if (!searchId) return undefined;
    let alive = true;
    let timer = null;
    const tick = async () => {
      try {
        const r = await check(searchId);
        if (!alive) return;
        if (r?.search) setSearch(r.search);
        // andando: confere de pouco em pouco; parada (pendente): confere mais devagar até retomar ou terminar
        if (!r?.search || WATCHED.has(r.search.status)) timer = setTimeout(tick, r?.search?.status === "pendente" ? pollMs * SLOW_FACTOR : pollMs);
      } catch (e) {
        if (!alive) return;
        if (isMissingFunction(e)) setOldSql(true);
        else timer = setTimeout(tick, pollMs * 2);
      }
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchId, backend]);

  if (!isAdmin) return <p style={caption}>{ASK_ADMIN}</p>;

  const ready = Boolean(status.data?.ready);
  const max = Number(status.data?.max_searches ?? 0);
  const per = status.data?.per_search_usd;
  const ai = status.data?.provider ? `${PROVIDER_NAME[status.data.provider] ?? status.data.provider}${status.data.model ? ` ${status.data.model}` : ""}` : null;
  const estimate = `Custo estimado: cerca de ${usd(AVERAGE_COST_USD)} por tema (média medida nas buscas feitas).${per != null && max ? ` Inclui até ${plural(max, "busca", "buscas")} na internet a ${usd(per)} cada (preço atual da tabela de preços)` : ""}${per != null && max ? `${ai ? ` e o uso do modelo ${ai}` : ""}.` : ""}`;
  const running = busy || (searchId && (!search || ACTIVE.has(search.status)));

  const start = async () => {
    setBusy(true);
    setError(null);
    setRepeat(null);
    try {
      const r = await backend.rpc("app_ch_source_search_start", { p_request: { area: base.area, theme, top_themes: null, free_text: base.freeText } });
      const item = (Array.isArray(r) ? r : r?.searches ?? [])[0];
      if (!item?.id) throw new Error("A busca não foi registrada.");
      setAlready(Boolean(item.duplicate));
      setSearch(null);
      setSearchId(item.id);
    } catch (e) {
      if (isMissingFunction(e)) setOldSql(true);
      else setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    setBusy(true);
    setError(null);
    setRepeat(null);
    try {
      const r = await check(null);
      const recent = Array.isArray(r?.recent) ? r.recent : [];
      const waiting = Number(r?.waiting ?? 0);
      if (recent.length > 0 || waiting > 0) {
        setRepeat({ recent: recent[0] ?? null, waiting });
        setBusy(false);
        return;
      }
    } catch (e) {
      setBusy(false);
      if (isMissingFunction(e)) setOldSql(true);
      else setError(friendlyError(e));
      return;
    }
    await start();
  };

  const progress = search ? progressOf(search) : null;
  return (
    <div data-testid="search-sources" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {oldSql && <Banner tone="warning">{OLD_SQL}</Banner>}
      {!oldSql && (
        <>
          {base.theme ? <p style={{ ...caption, color: "var(--text-secondary)" }}>{`Tema da busca: ${base.theme}`}</p> : <TextField label="Tema para buscar fontes" value={typed} maxLength={120} onChange={(e) => setTyped(e.target.value)} placeholder="ex.: Bronquiolite" />}
          <p style={caption}>A IA procura só nos sites oficiais da lista. {NOTE}</p>
          <p style={caption}>{status.data ? estimate : `Custo estimado: cerca de ${usd(AVERAGE_COST_USD)} por tema (média medida nas buscas feitas).`}</p>
          {status.data && !ready && (status.data.problems ?? []).map((p, i) => <p key={i} style={{ ...caption, color: "var(--warning-text)" }}>{p}</p>)}
          {status.error && <p style={{ ...caption, color: "var(--danger-text)" }}>Não foi possível conferir se a busca está pronta.</p>}
          {repeat && (
            <Banner tone="warning" title="Este tema já foi buscado">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {repeat.recent && <span>{`Busca de ${dayBR(repeat.recent.created_at)}: ${SEARCH_STATUS[repeat.recent.status]?.[0] ?? repeat.recent.status}${Number(repeat.recent.verified_count) > 0 ? `, ${plural(Number(repeat.recent.verified_count), "candidato", "candidatos")}` : ""}.`}</span>}
                {repeat.waiting > 0 && <span>{`${plural(repeat.waiting, "candidato aguarda", "candidatos aguardam")} a sua conferência na aba Fontes.`}</span>}
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {repeat.waiting > 0 && <CandidatesLink />}
                  <Button size="sm" variant="secondary" loading={busy} onClick={start}>
                    Buscar de novo mesmo assim
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRepeat(null)}>
                    Não buscar
                  </Button>
                </span>
              </div>
            </Banner>
          )}
          {error && <Banner tone="danger">{error}</Banner>}
          {!searchId && !repeat && (
            <div>
              <Button size="sm" variant="secondary" icon="search" disabled={!ready || !theme} loading={busy} onClick={ask}>
                Buscar fontes com IA
              </Button>
            </div>
          )}
          {searchId && (
            <Banner tone={progress?.tone ?? "info"}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {already && <span>Já havia uma busca igual na fila; acompanhando a mesma.</span>}
                <span role="status">{progress?.text ?? "Acompanhando a busca…"}</span>
                {progress?.link && (
                  <span>
                    <CandidatesLink />
                  </span>
                )}
                {!running && (
                  <span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSearchId(null);
                        setSearch(null);
                        setAlready(false);
                      }}
                    >
                      Fechar
                    </Button>
                  </span>
                )}
              </div>
            </Banner>
          )}
        </>
      )}
    </div>
  );
}
