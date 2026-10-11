// Uma função da Central de IAs: modo, IA principal, reserva, conferentes (linha) ou membros (comitê), cuidado.
import React from "react";
import { Badge, Banner, Button, SelectField, TextField } from "../../../ds";
import { aiSend, PROVIDER_NAME } from "./aiApi.js";

const MODES = [
  { value: "sozinha", label: "Sozinha" },
  { value: "linha", label: "Linha de produção" },
  { value: "comite", label: "Comitê" },
];
const CARES = [
  { value: "rapido", label: "Rápido" },
  { value: "caprichado", label: "Caprichado" },
];
const EMPTY = { provider: "", model: "" };
/** Busca de fontes oficiais (Fontes › Buscar com IA): só modo sozinha, só IAs que buscam na internet, com máximo de buscas por pedido. */
const SEARCH_FN = "busca_fontes";
const DEFAULT_MAX_SEARCHES = 5;
const MAX_SEARCHES_PROBLEM = "Máximo de buscas por pedido: de 1 a 10.";
const validMax = (t) => t.trim() === "" || (/^\d+$/.test(t.trim()) && Number(t) >= 1 && Number(t) <= 10);
const MAX_OTHERS = { linha: 3, comite: 3 };
const toRef = (r) => (r && r.provider && r.model ? { provider: r.provider, model: String(r.model).trim() } : null);
const asDraft = (r) => (r ? { provider: r.provider ?? "", model: r.model ?? "" } : { ...EMPTY });

/**
 * IA + modelo: lista da IA quando houver; senão, o id digitado. A IA que não roda em nenhum servidor publicado
 * (checks[id].blocks: Ollama no site publicado) aparece como indisponível e desabilitada, exceto se já for a escolhida aqui
 * ou uma das salvas neste lugar (a pessoa precisa conseguir ver, trocar e voltar; nos conferentes e membros vale pela lista
 * salva, não pela posição, porque remover uma linha desloca as outras). Chave ausente só neste servidor (o site) não
 * bloqueia: o processamento da Central roda no Cloud Run com as chaves de lá; a opção continua escolhível, com o rótulo.
 */
function ModelPicker({ title, fn, value, onChange, providers, checks, savedProviders = [] }) {
  const info = providers.find((p) => p.id === value.provider);
  const models = Array.isArray(info?.models) ? info.models : [];
  const missing = value.model && models.length > 0 && !models.some((m) => m.id === value.model);
  const options = [{ value: "", label: "Escolha o modelo" }, ...models.map((m) => ({ value: m.id, label: m.label || m.id })), ...(missing ? [{ value: value.model, label: value.model }] : [])];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "start" }}>
      <SelectField
        label="IA"
        aria-label={`${title}: IA — ${fn}`}
        value={value.provider}
        onChange={(e) => onChange({ provider: e.target.value, model: "" })}
        options={[
          { value: "", label: "Escolha a IA" },
          ...providers.map((p) => {
            const { pending, blocks } = checks?.[p.id] ?? {};
            // o que não roda em servidor publicado manda; senão, desligada e sem chave aparecem juntas
            const parts = blocks === true ? ["indisponível"] : [!p.enabled && "desligada", pending && "sem chave no site"].filter(Boolean);
            const note = parts.length ? ` (${parts.join(", ")})` : "";
            return { value: p.id, label: PROVIDER_NAME[p.id] + note, disabled: blocks === true && p.id !== value.provider && !savedProviders.includes(p.id) };
          }),
        ]}
      />
      {models.length > 0 ? (
        <SelectField label="Modelo" aria-label={`${title}: modelo — ${fn}`} value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} options={options} hint={missing ? "modelo não está mais na lista" : undefined} />
      ) : (
        <TextField label="Modelo (id)" aria-label={`${title}: modelo (id) — ${fn}`} value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} hint="Atualize a lista da IA para escolher" disabled={!value.provider} />
      )}
    </div>
  );
}

const subtle = { font: "var(--type-caption)", color: "var(--text-tertiary)" };

export function FunctionEditor({ fnKey, label, saved, check, providers: allProviders, providerChecks, backend, onSaved }) {
  const search = fnKey === SEARCH_FN;
  const providers = search ? allProviders.filter((p) => p.id !== "ollama") : allProviders; // o Ollama não busca na internet
  const init = () => ({
    mode: search ? "sozinha" : (saved?.mode ?? "sozinha"),
    maxSearches: saved?.max_searches == null ? "" : String(saved.max_searches),
    care: saved?.care ?? "caprichado",
    primary: asDraft(saved?.primary_ref),
    fallback: asDraft(saved?.fallback_ref),
    others: (saved?.reviewers ?? []).map(asDraft),
  });
  const [draft, setDraft] = React.useState(init);
  const [state, setState] = React.useState({ busy: false, problems: null, error: null, warnings: null });
  const savedKey = JSON.stringify(saved ?? null);
  React.useEffect(() => {
    setDraft(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);
  // conferência nova do servidor (recarregada depois de salvar os tetos, um preço ou uma função): ela manda nos avisos. Os avisos
  // que vieram ao salvar a função ficavam presos na tela (ex.: o do teto por execução, depois de o dono subir o teto) até
  // recarregar a página (rodada final)
  const checkKey = JSON.stringify(check ?? null);
  React.useEffect(() => {
    setState((s) => (s.warnings ? { ...s, warnings: null } : s));
  }, [checkKey]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const others = draft.mode === "sozinha" ? [] : draft.others.length ? draft.others : [{ ...EMPTY }];
  const max = MAX_OTHERS[draft.mode] ?? 0;
  const setOther = (i, v) => set({ others: others.map((o, j) => (j === i ? v : o)) });

  const complete = others.filter((o) => toRef(o));
  const half = others.some((o) => (o.provider || o.model) && !toRef(o));
  const minOthers = draft.mode === "linha" ? 1 : draft.mode === "comite" ? 1 : 0;
  const localProblem = search && !validMax(draft.maxSearches)
    ? MAX_SEARCHES_PROBLEM
    : half
    ? "Complete ou remova o conferente/membro incompleto."
    : draft.mode === "linha" && complete.length < 1
      ? "Linha de produção precisa de pelo menos 1 conferente."
      : draft.mode === "comite" && complete.length < minOthers
        ? "O comitê precisa de pelo menos 2 IAs."
        : null;

  const run = async (fn, after) => {
    setState({ busy: true, problems: null, error: null, warnings: null });
    try {
      const out = await fn();
      setState({ busy: false, problems: null, error: null, warnings: after ? [] : (out?.warnings ?? []) });
      await onSaved();
    } catch (error) {
      setState({ busy: false, problems: error.problems ?? null, error: error.message, warnings: null });
    }
  };
  const save = () =>
    run(() =>
      aiSend(backend, "PUT", `/functions/${fnKey}`, {
        config: {
          mode: draft.mode,
          care: draft.care,
          primary: toRef(draft.primary),
          fallback: toRef(draft.fallback),
          reviewers: complete.map(toRef),
          ...(search ? { max_searches: draft.maxSearches.trim() === "" ? DEFAULT_MAX_SEARCHES : Number(draft.maxSearches) } : {}),
        },
      }),
    );
  const revert = () => {
    // a busca de fontes nunca usa as variáveis do servidor: tirar a configuração só a desliga
    const question = search ? `Desligar "${label}"? A configuração salva será apagada e a função para de rodar.` : `Voltar "${label}" às variáveis do servidor? A configuração salva aqui será apagada.`;
    if (!window.confirm(question)) return;
    run(() => aiSend(backend, "PUT", `/functions/${fnKey}`, { config: null }), true);
  };

  // avisos da última gravação mais os da situação da função (que continuam valendo depois de salvar)
  const warnings = [...new Set([...(state.warnings ?? []), ...(check?.warnings ?? [])])];
  const ref = check?.ref;
  return (
    <div data-testid={`function-${fnKey}`} style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 0", borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ font: "var(--type-label)" }}>{label}</strong>
        {check?.ready ? <Badge size="sm" tone="success">pronta</Badge> : <Badge size="sm" tone="danger">não está pronta</Badge>}
      </div>
      {check?.source === "variaveis" && ref && <div style={subtle}>{`Sem configuração salva: usa as variáveis do servidor (${PROVIDER_NAME[ref.provider] ?? ref.provider} ${ref.model})`}</div>}
      {check && !check.ready && check.problems?.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          {check.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {search ? (
        <div style={{ font: "var(--type-body-sm)" }}>Modo: sozinha (principal e reserva)</div>
      ) : (
        <SelectField label="Modo" aria-label={`Modo — ${label}`} value={draft.mode} onChange={(e) => set({ mode: e.target.value })} options={MODES} />
      )}
      <div>
        <div style={{ ...subtle, marginBottom: 6 }}>IA principal</div>
        <ModelPicker fn={label} title="Principal" value={draft.primary} onChange={(v) => set({ primary: v })} providers={providers} checks={providerChecks} savedProviders={[saved?.primary_ref?.provider]} />
      </div>
      <div>
        <div style={{ ...subtle, marginBottom: 6 }}>Reserva (opcional)</div>
        <ModelPicker fn={label} title="Reserva" value={draft.fallback} onChange={(v) => set({ fallback: v })} providers={providers} checks={providerChecks} savedProviders={[saved?.fallback_ref?.provider]} />
      </div>
      {draft.mode !== "sozinha" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={subtle}>{draft.mode === "linha" ? "Conferentes (1 a 3)" : "Outros membros — a principal também participa; total de 2 a 4"}</div>
          <div style={subtle}>
            {fnKey === "verificacao"
              ? `No processamento só a IA principal e a reserva rodam; ${draft.mode === "linha" ? "os conferentes" : "os membros"} só são usados na conferência de rascunhos feita por comando.`
              : `${draft.mode === "linha" ? "Por enquanto os conferentes não são chamados" : "Por enquanto os membros não são chamados"}: a função usa só a IA principal e a reserva.`}
          </div>
          {others.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 360px" }}>
                <ModelPicker fn={label} title={`${draft.mode === "linha" ? "Conferente" : "Membro"} ${i + 1}`} value={o} onChange={(v) => setOther(i, v)} providers={providers} checks={providerChecks} savedProviders={(saved?.reviewers ?? []).map((r) => r.provider)} />
              </div>
              {others.length > 1 && (
                <Button size="sm" variant="ghost" icon="trash-2" onClick={() => set({ others: others.filter((_, j) => j !== i) })}>
                  Remover
                </Button>
              )}
            </div>
          ))}
          {others.length < max && (
            <div>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => set({ others: [...others, { ...EMPTY }] })}>
                {draft.mode === "linha" ? "Adicionar conferente" : "Adicionar membro"}
              </Button>
            </div>
          )}
        </div>
      )}
      {search && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={subtle}>Só IAs que buscam na internet (Claude, OpenAI, Gemini). Cada busca é cobrada à parte: preencha o preço por busca na tabela de preços.</div>
          <div style={{ maxWidth: 280 }}>
            <TextField
              label="Máximo de buscas por pedido"
              aria-label={`Máximo de buscas por pedido — ${label}`}
              type="number"
              min="1"
              max="10"
              step="1"
              placeholder={String(DEFAULT_MAX_SEARCHES)}
              value={draft.maxSearches}
              onChange={(e) => set({ maxSearches: e.target.value })}
              hint={`De 1 a 10. Sem valor, vale ${DEFAULT_MAX_SEARCHES}.`}
            />
          </div>
        </div>
      )}
      <SelectField label="Cuidado" aria-label={`Cuidado — ${label}`} value={draft.care} onChange={(e) => set({ care: e.target.value })} options={CARES} />
      <div style={subtle}>
        Rápido: menos raciocínio, mais rápido e barato (Claude, Gemini 2.5 e 3 e GPT-5/6; o Gemini 2.5 Flash-Lite deixa de pensar).
        Caprichado: Claude com esforço alto; Gemini e OpenAI no padrão do modelo. Os Gemini 3 Flash-Lite já pensam o mínimo por padrão
        e não mudam; os modelos de imagem do Gemini e o Ollama também não.
      </div>

      {localProblem && <div style={subtle}>{localProblem}</div>}
      {state.error && (
        <Banner tone="danger">
          {state.problems?.length ? state.problems.map((p) => <div key={p}>{p}</div>) : state.error}
        </Banner>
      )}
      {warnings.length > 0 && (
        <Banner tone="warning">
          {warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </Banner>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button size="sm" icon="check" loading={state.busy} disabled={Boolean(localProblem)} onClick={save}>
          Salvar
        </Button>
        {saved && (
          <Button size="sm" variant="secondary" disabled={state.busy} onClick={revert}>
            {search ? "Desligar a função" : "Voltar às variáveis do servidor"}
          </Button>
        )}
      </div>
    </div>
  );
}
