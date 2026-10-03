// Peças comuns das telas de administração.
import React from "react";
import { Banner } from "../../ds";

export const ROLE_LABEL = { student: "Aluno", editor: "Editor", admin: "Administrador" };
export const PLAN_LABEL = { trial: "Teste grátis", pro: "Pro", elite: "Elite" };
export const SUB_STATUS_LABEL = { trialing: "Em teste", active: "Ativo", past_due: "Pagamento pendente", canceled: "Cancelado", expired: "Expirado" };
export const QUESTION_STATUS_LABEL = { valid: "Válida", annulled: "Anulada", changed_after_appeal: "Alterada após recurso" };

export const dateBR = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "—");
export const dateTimeBR = (iso) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
/** ISO → valor de <input type="date"> (data local). */
export const toDateInput = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA") : "");
/** <input type="date"> → fim daquele dia, em ISO. */
export const fromDateInput = (value) => (value ? new Date(`${value}T23:59:59`).toISOString() : null);

/**
 * Mensagem do banco para mostrar na tela: as funções de administração devolvem frases prontas
 * ("Informe o tema."). Erros técnicos viram a mensagem genérica.
 */
export function messageOf(error, fallback = "Não foi possível concluir. Tente de novo.") {
  const message = String(error?.message ?? "").trim();
  if (/permission|syntax|violates|column|relation|function|null value|duplicate key|fetch/i.test(message)) return fallback;
  return /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ].{3,240}[.!?]$/.test(message) ? message : fallback;
}

/** Carrega dados de uma função do banco e permite recarregar. */
export function useLoad(load, deps) {
  const [state, setState] = React.useState({ data: null, error: null, loading: true });
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState((s) => ({ ...s, error, loading: false })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((n) => n + 1), setData: (data) => setState((s) => ({ ...s, data })) };
}

export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function Loading() {
  return <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;
}

export function LoadError({ error, retry }) {
  return (
    <Banner tone="danger" action={retry && <button type="button" className="sm-btn sm-btn--secondary sm-btn--sm" onClick={retry}>Tentar de novo</button>}>
      {messageOf(error, "Não foi possível carregar. Tente de novo.")}
    </Banner>
  );
}

/** Caixa de texto com várias linhas no estilo dos campos do design system. */
export function TextArea({ label, value, onChange, rows = 3, maxLength, hint, placeholder, id: given, disabled }) {
  const auto = React.useId();
  const id = given ?? auto;
  return (
    <div className="sm-field">
      {label && (
        <label className="sm-field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="sm-input" style={{ height: "auto" }}>
        <textarea
          id={id}
          rows={rows}
          maxLength={maxLength}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", resize: "vertical", padding: "12px 16px", font: "400 15px/1.5 var(--font-sans)", color: "var(--text-primary)" }}
        />
      </div>
      {hint && <span className="sm-field__hint">{hint}</span>}
    </div>
  );
}

/** Linha de lista clicável (mesmo visual de .sm-row do design system). */
export function ListRow({ children, onClick, label }) {
  return (
    <button type="button" className="sm-row" onClick={onClick} aria-label={label} style={{ alignItems: "flex-start" }}>
      {children}
    </button>
  );
}

/** Baixa um texto como arquivo. */
export function downloadText(filename, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
