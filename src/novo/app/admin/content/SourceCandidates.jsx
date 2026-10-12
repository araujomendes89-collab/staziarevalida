// Fontes oficiais com IA, parte 2: os achados da busca para o dono conferir, aprovar ou rejeitar.
// Nada entra sozinho: o servidor já baixou e conferiu o arquivo; aqui o administrador vê o trecho, o arquivo guardado e o
// site oficial, ajusta os dados e decide. Aprovar cria a fonte vigente (e a leitura do documento entra na fila).
import React from "react";
import { Badge, Banner, Button, Checkbox, SelectField, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { useMobile } from "../../Shell.jsx";
import { AREAS } from "../../practice/format.js";
import { PROVIDER_NAME } from "../ai/aiApi.js";
import { LoadError, Loading, useLoad } from "../common.jsx";
import { hubOpenFile, hubPost } from "./api.js";
import { AUTHORITY, CANDIDATE_STATUS, DOMAIN_KIND, SOURCE_KIND, SOURCE_TYPE } from "./labels.js";
import { BASIS, currencyBadge, isOlder, olderWarning } from "./sourceCurrency.js";
import { KeyValue, Label, Pre, Section, shortHash, StatusBadge, useAction, when } from "./ui.jsx";

const caption = { font: "var(--type-caption)", color: "var(--text-tertiary)" };
const LEVELS = Object.entries(AUTHORITY).filter(([k]) => k !== "E"); // nível E nunca entra pela busca
const FILTERS = [
  ["aguardando", "Aguardando"],
  ["aprovado", "Aprovados"],
  ["rejeitado", "Rejeitados"],
];

/** "2024-05-10" vira "10/05/2024"; só o ano vira "Ano: 2024" (nada de inventar o dia); outro texto fica como veio. */
const day = (v) => {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  if (/^\d{4}$/.test(s)) return `Ano: ${s}`;
  return s;
};
const isoDay = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : "");
const megabytes = (bytes) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Number(bytes ?? 0) / 1048576)} MB`;
const httpsOnly = (url) => (typeof url === "string" && /^https:\/\//i.test(url) ? url : null);

export function SourceCandidates({ onDecided }) {
  const { backend } = useSession();
  const [filter, setFilter] = React.useState("aguardando");
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_source_candidates", { p_status: filter }), [backend, filter]);
  const [notices, setNotices] = React.useState([]);
  const items = Array.isArray(data?.items) ? data.items : [];
  const counts = data?.counts ?? {};
  const waiting = Number(counts.aguardando ?? 0);
  const decided = (notice) => {
    setNotices((list) => [notice, ...list.filter((n) => n.key !== notice.key)]);
    reload();
    onDecided?.();
  };
  const dismiss = (key) => setNotices((list) => list.filter((n) => n.key !== key));
  return (
    <Section
      title={data ? `Fontes encontradas — aguardando sua conferência (${waiting})` : "Fontes encontradas — aguardando sua conferência"}
      action={
        <div style={{ minWidth: 200 }}>
          <SelectField label="Mostrar" value={filter} onChange={(e) => setFilter(e.target.value)} options={FILTERS.map(([value, label]) => ({ value, label: data ? `${label} (${Number(counts[value] ?? 0)})` : label }))} />
        </div>
      }
    >
      <div data-testid="source-candidates" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {notices.map((n) => (
          <DecisionNotice key={n.key} notice={n} onChange={decided} onClose={() => dismiss(n.key)} />
        ))}
        {error && <LoadError error={error} retry={reload} />}
        {!data && !error && <Loading />}
        {data && items.length === 0 && <p style={{ margin: 0, ...caption }}>{EMPTY[filter]}</p>}
        {items.map((c) => (
          <CandidateCard key={c.id} candidate={c} onDecided={decided} />
        ))}
      </div>
    </Section>
  );
}

const EMPTY = {
  aguardando: "Nenhuma fonte aguardando a sua conferência.",
  aprovado: "Nenhuma fonte encontrada pela busca foi aprovada ainda.",
  rejeitado: "Nenhuma fonte encontrada pela busca foi rejeitada.",
};

/** Resultado de uma decisão (fica na tela mesmo depois que o cartão sai da lista). Com erro na leitura, oferece "Ler de novo". */
function DecisionNotice({ notice: n, onChange, onClose }) {
  const { backend } = useSession();
  const act = useAction();
  const again = () =>
    act.run(() => hubPost(backend, `/source-candidates/${n.candidateId}/read`)).then((r) => {
      if (r) onChange({ key: n.key, tone: "success", lines: ["A leitura entrou na fila."] });
    });
  return (
    <Banner tone={n.tone} action={<Button size="sm" variant="secondary" onClick={onClose}>Fechar</Button>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {n.lines.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
        {n.readError && (
          <div>
            <Button size="sm" variant="secondary" icon="refresh-cw" loading={act.busy} onClick={again}>
              Ler de novo
            </Button>
          </div>
        )}
        {act.error && <span>{act.error}</span>}
      </div>
    </Banner>
  );
}

function CandidateCard({ candidate: c, onDecided }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const edited = c.edited ?? {};
  const open = c.status === "aguardando";
  const [f, setF] = React.useState(() => ({
    institution: edited.institution ?? c.ai_institution ?? c.site_institution ?? "",
    title: edited.title ?? c.ai_title ?? "",
    version: edited.version ?? "",
    // só a data COMPROVADA pela conferência (no texto do documento ou declarada pela página) vem preenchida; a que só a IA disse não vira
    // data da fonte sozinha (o administrador digita, se quiser)
    published_on: edited.published_on ?? isoDay(c.currency_date),
    kind: edited.kind ?? c.suggested_kind ?? c.ai_kind ?? "final",
    nature: edited.nature ?? c.suggested_nature ?? "",
    level: edited.level ?? c.suggested_level ?? "",
    area: edited.area ?? c.search?.area ?? "",
    theme: edited.theme ?? c.search?.theme ?? "",
    valid_until: edited.valid_until ?? "",
  }));
  const set = (patch) => setF((v) => ({ ...v, ...patch }));
  const [checked, setChecked] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [preview, setPreview] = React.useState(false);
  const save = useAction();
  const decide = useAction();
  const file = useAction();

  const fields = () => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v ?? "").trim() === "" ? null : String(v).trim()]));
  const canApprove = open && checked && /^[A-D]$/.test(f.level) && f.title.trim() !== "" && f.institution.trim() !== "";
  const site = httpsOnly(c.final_url);
  const web = c.file_kind === "html";
  const older = open && isOlder(c);
  const [currencyLabel, currencyTone] = currencyBadge(c.currency);
  const info = c.currency_info ?? {};
  const untilIso = isoDay(c.ai_valid_until);
  const page = web ? "página web" : c.quote_page != null ? `página ${c.quote_page}` : null;

  const approve = () =>
    decide
      .run(async () => {
        const send = (extra) => hubPost(backend, `/source-candidates/${c.id}/approve`, { fields: { ...fields(), checked: true, ...extra } });
        // versão mais antiga que a da biblioteca (ou que outra achada): confirmação PRÓPRIA, que diz o que a aprovação faz
        if (older && !window.confirm(olderWarning(c))) throw new Error("Aprovação cancelada: a versão mais antiga não foi confirmada.");
        try {
          return await send(older ? { confirm_older: true } : {});
        } catch (e) {
          if (/^Confirme a versão (mais antiga|sem data comparável)/.test(e?.message ?? "")) {
            if (!window.confirm(`${e.message} Aprovar mesmo assim?`)) throw new Error("Aprovação cancelada: a versão não foi confirmada.");
            return send({ confirm_older: true });
          }
          if (!/^Confirme a substituição/.test(e?.message ?? "")) throw e;
          if (!window.confirm(e.message)) throw new Error("Aprovação cancelada: a substituição não foi confirmada.");
          return send({ confirm_replace: true });
        }
      }, null)
      .then((r) => {
        if (!r) return;
        const name = f.title.trim();
        onDecided({
          key: `approve-${c.id}`,
          candidateId: c.id,
          tone: r.read_error ? "warning" : "success",
          readError: Boolean(r.read_error),
          lines: [`Fonte aprovada: ${name}.`, ...(older ? ["Você confirmou a aprovação de uma versão mais antiga."] : []), ...(r.superseded ? ["A fonte vigente anterior ficou substituída."] : []), r.read_error ? r.read_error : "A leitura do documento entrou na fila."],
        });
      });

  const reject = () =>
    decide.run(() => hubPost(backend, `/source-candidates/${c.id}/reject`, { reason: reason.trim() }), null).then((r) => {
      if (r) onDecided({ key: `reject-${c.id}`, candidateId: c.id, tone: "success", lines: [`Candidato rejeitado: ${f.title.trim() || c.ai_title || "sem título"}. O arquivo guardado foi apagado e este arquivo não volta a ser sugerido (se o conteúdo deste link mudar, a versão nova pode aparecer como outro candidato).`] });
    });

  const grid = { display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 12 };
  const kind = DOMAIN_KIND[c.site_kind] ?? c.site_kind;
  const level = LEVELS.find(([k]) => k === c.suggested_level);
  const levelHint = c.ai_level ? `sugestão da IA: ${c.ai_level}` : level ? `padrão pelo tipo do site: ${level[0]}` : undefined;

  return (
    <div data-testid={`candidate-${c.id}`} style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <strong>{edited.title ?? c.ai_title ?? "Sem título"}</strong>
        <StatusBadge map={CANDIDATE_STATUS} value={c.status} />
        <Badge size="sm" tone={currencyTone}>{currencyLabel}</Badge>
        {c.ai_kind && <Badge size="sm" tone={c.ai_kind === "final" ? "neutral" : "warning"}>{SOURCE_KIND[c.ai_kind] ?? c.ai_kind}</Badge>}
      </div>
      <div style={{ display: "flex", gap: 6, flexDirection: "column", font: "var(--type-body-sm)" }}>
        <span>{edited.institution ?? c.ai_institution ?? c.site_institution}</span>
        <span style={{ color: "var(--text-secondary)" }}>{`${c.site_address} · ${kind}`}</span>
        {c.search?.theme && <span style={caption}>{`Pedido: ${c.search.theme}${c.search.provider ? ` · ${PROVIDER_NAME[c.search.provider] ?? c.search.provider} ${c.search.model ?? ""}`.trimEnd() : ""} · ${when(c.search.created_at)}`}</span>}
      </div>
      {c.ai_reason && (
        <>
          <Label>Por que a IA indicou</Label>
          <span style={{ font: "var(--type-body-sm)" }}>{c.ai_reason}</span>
        </>
      )}
      {older && <Banner tone="danger" title="Versão mais antiga">{`${info.note ? `${info.note} ` : ""}${c.currency === "versao_mais_antiga" ? "Não é oferecida como substituta: aprovar vai trocar a fonte mais nova pela mais antiga, e o sistema pede a sua confirmação." : "Aprovar esta não traz a versão mais nova; o sistema pede a sua confirmação."}`}</Banner>}
      {!older && c.replaces && <Banner tone="warning">{`Vai substituir a fonte vigente: ${c.replaces.title} (versão ${c.replaces.version ?? "—"}).`}</Banner>}
      {!older && info.note && c.currency && <span style={caption}>{info.note}</span>}
      {(info.notes ?? []).map((n) => (
        <span key={n} style={caption}>{n}</span>
      ))}
      {c.quote && (
        <>
          <Label>Trecho encontrado no arquivo</Label>
          <Pre tone="brand">{c.quote}</Pre>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {page && <Badge size="sm" tone="info">{page}</Badge>}
            <Badge size="sm" tone={c.seen_in_search ? "success" : "neutral"}>{`visto na busca: ${c.seen_in_search ? "sim" : "não"}`}</Badge>
          </div>
        </>
      )}
      <KeyValue
        items={[
          ["Título segundo a IA", c.ai_title ?? "—"],
          ["Título achado no arquivo", c.file_title ?? "não encontrado"],
          ["Data segundo a IA", day(c.ai_published) ?? "—"],
          ["Data achada no arquivo", day(c.file_date) ?? "não encontrada"],
          ["Data comprovada", c.currency_date ? `${day(c.currency_date)} (${BASIS[info.basis] ?? "comprovada"})` : "não comprovada no documento"],
          ...(c.ai_valid_until ? [["Vigência segundo a IA", `${untilIso ? day(untilIso) : c.ai_valid_until}${info.valid_until_proven ? " (comprovada no texto do documento)" : " (não encontrada no documento)"}`]] : []),
          ["Arquivo", [web ? "Página web" : "PDF", c.page_count ? `${c.page_count} páginas` : null, megabytes(c.size_bytes)].filter(Boolean).join(" · ")],
          ["SHA-256", c.sha256 ? <code key="h">{shortHash(c.sha256)}</code> : null],
          ...(c.status !== "aguardando" ? [["Decidido em", when(c.decided_at)], ...(c.decision_reason ? [["Motivo", c.decision_reason]] : [])] : []),
        ]}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!web && c.status !== "rejeitado" && (
          <Button size="sm" variant="secondary" icon="file-text" loading={file.busy} onClick={() => file.run(() => hubOpenFile(backend, `/source-candidates/${c.id}/file`), null)}>
            Abrir arquivo guardado
          </Button>
        )}
        {site && (
          <a className="sm-btn sm-btn--secondary sm-btn--sm" href={site} target="_blank" rel="noopener noreferrer">
            Abrir no site oficial
          </a>
        )}
        {c.preview && (
          <Button size="sm" variant="secondary" icon="eye" onClick={() => setPreview((v) => !v)}>
            Prévia do texto
          </Button>
        )}
      </div>
      {file.feedback}
      {preview && (
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "var(--type-body-sm)", background: "var(--surface-sunken)", borderRadius: "var(--radius-sm)", padding: "8px 10px", maxHeight: 320, overflow: "auto" }}>{c.preview}</pre>
      )}
      {open && (
        <>
          <Label>Dados da fonte (você pode ajustar antes de aprovar)</Label>
          <div style={grid}>
            <TextField label="Instituição" value={f.institution} onChange={(e) => set({ institution: e.target.value })} />
            <TextField label="Título" value={f.title} onChange={(e) => set({ title: e.target.value })} />
            <TextField label="Versão" value={f.version} onChange={(e) => set({ version: e.target.value })} />
            <TextField label="Data de publicação" type="date" value={f.published_on} onChange={(e) => set({ published_on: e.target.value })} />
            <SelectField label="Tipo" value={f.kind} onChange={(e) => set({ kind: e.target.value })} options={Object.entries(SOURCE_KIND).map(([value, label]) => ({ value, label }))} />
            <SelectField label="Natureza" value={f.nature} onChange={(e) => set({ nature: e.target.value })} options={[{ value: "", label: "Não informada" }, ...Object.entries(SOURCE_TYPE).map(([value, label]) => ({ value, label }))]} />
            <SelectField label="Nível" hint={levelHint} value={f.level} onChange={(e) => set({ level: e.target.value })} options={[{ value: "", label: "Escolher…" }, ...LEVELS.map(([value, label]) => ({ value, label }))]} />
            <SelectField label="Área" value={f.area} onChange={(e) => set({ area: e.target.value })} options={[{ value: "", label: "Não informada" }, ...AREAS.map((a) => ({ value: a.id, label: a.label }))]} />
            <TextField label="Tema" value={f.theme} onChange={(e) => set({ theme: e.target.value })} />
            <TextField label="Vigência até" type="date" value={f.valid_until} onChange={(e) => set({ valid_until: e.target.value })} />
          </div>
          {save.feedback}
          <div>
            <Button size="sm" variant="secondary" icon="save" loading={save.busy} onClick={() => save.run(() => backend.rpc("app_ch_source_candidate_save", { p_candidate_id: c.id, p_fields: fields() }), "Dados salvos.")}>
              Salvar dados
            </Button>
          </div>
          <Checkbox label="Conferi o documento no arquivo guardado" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          {decide.error && <Banner tone="danger">{decide.error}</Banner>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button icon="check" variant={older ? "danger" : undefined} disabled={!canApprove} loading={decide.busy} onClick={approve}>
              {older ? "Aprovar versão mais antiga" : "Aprovar"}
            </Button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <TextField label="Motivo da rejeição" value={reason} onChange={(e) => setReason(e.target.value)} hint="Pelo menos 10 caracteres. O mesmo arquivo não volta a ser sugerido; se o conteúdo do link mudar, a versão nova pode aparecer." />
            </div>
            <Button variant="secondary" icon="x" disabled={reason.trim().length < 10} loading={decide.busy} onClick={reject}>
              Rejeitar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
