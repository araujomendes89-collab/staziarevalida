// Preferências do Tutor (aluno): o jeito da Durona e do Durão (17/10/2026: o Durão é a mesma mecânica, no masculino; a escolha do aluno
// vale para os dois). Decisão do dono de 16/10 ("ativo para todos"): quem escolhe a Durona (ou o Durão) começa
// no N3 Estressada, com gritos e palavrões ligados; aqui o aluno baixa ou sobe o nível e desliga gritos e/ou palavrões.
// N3 e N4 dependem da declaração de 18+ e de médico feita no aceite do Termo (o banco confere; nada é perguntado de novo).
// O banco grava só a escolha do próprio aluno (app_tutor_save_explosiva_preferences); o servidor do Tutor lê de lá, nunca do navegador.
import React from "react";
import { Banner, Button, Switch } from "../../ds";
import { useSession } from "../session.jsx";
import { explainError as messageOf } from "../../../shared/errors/explicarErro";
import "./explosivaPreferences.css";

export const EXPLOSIVA_LEVELS = [
  { id: "n1", name: "N1 · Direta", line: "Cobra firme e seca, sem palavrão.", sample: "Não. Lê de novo o comando." },
  { id: "n2", name: "N2 · Sarcástica", line: "Ironia e deboche do erro, palavrão só leve.", sample: "Corticoide primeiro? Que coragem." },
  { id: "n3", name: "N3 · Estressada", line: "Impaciente, solta palavrão de vez em quando e levanta a voz às vezes.", sample: "Pelo amor de Deus! Lê o enunciado!", standard: true },
  { id: "n4", name: "N4 · Explosiva", line: "Teatral e ácida: palavrão espontâneo, grito na indignação, zomba do erro.", sample: "Porra, corticoide primeiro? É apagar incêndio com regador!" },
];
const ADULT_ONLY = new Set(["n3", "n4"]);
/** Os mesmos níveis no masculino, para o Durão. */
const NOME_MASCULINO = { n1: "N1 · Direto", n2: "N2 · Sarcástico", n3: "N3 · Estressado", n4: "N4 · Explosivo" };

/** `professor`: a personalidade escolhida ({ id: "durao" } ou { id: "durona" }); sem ela, a Durona de sempre. */
export function ExplosivaPreferences({ compact = false, professor = null }) {
  const { backend } = useSession();
  const durao = professor?.id === "durao";
  const jeito = durao ? "Jeito do Durão" : "Jeito da Durona";
  const nomeDe = durao ? "o Durão" : "a Durona";
  const ele = durao ? "Ele" : "Ela";
  const niveis = durao ? EXPLOSIVA_LEVELS.map((l) => ({ ...l, name: NOME_MASCULINO[l.id] })) : EXPLOSIVA_LEVELS;
  const [data, setData] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [state, setState] = React.useState({ loading: true, saving: false, error: null, done: null });

  const apply = React.useCallback((value) => {
    setData(value);
    setForm(value?.choice ? { level: value.choice.level, shouts: value.choice.shouts, profanity: value.choice.profanity } : null);
  }, []);
  React.useEffect(() => {
    let alive = true;
    backend.rpc("app_tutor_explosiva_preferences")
      .then((v) => { if (alive) { apply(v); setState((s) => ({ ...s, loading: false })); } })
      .catch((e) => { if (alive) setState((s) => ({ ...s, loading: false, error: messageOf(e) })); });
    return () => { alive = false; };
  }, [backend, apply]);

  if (state.loading) return <p className="explosiva-prefs__muted">Carregando o {durao ? "jeito do Durão" : "jeito da Durona"}…</p>;
  if (!data) return state.error ? <Banner tone="danger">{state.error}</Banner> : null;
  if (!data.available) {
    return (
      <section className="explosiva-prefs" aria-labelledby="explosiva-prefs-title">
        <h3 id="explosiva-prefs-title">{jeito}</h3>
        <p className="explosiva-prefs__muted">Os níveis {durao ? "do Durão estão desligados" : "da Durona estão desligados"} no momento. {ele} fala do jeito de sempre.</p>
      </section>
    );
  }

  const adult = Boolean(data.adult_declared);
  const effective = ADULT_ONLY.has(form.level) && !adult ? "n2" : form.level;
  const changed = form.level !== data.choice.level || form.shouts !== data.choice.shouts || form.profanity !== data.choice.profanity;
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setState((s) => ({ ...s, error: null, done: null })); };
  const save = async (level) => {
    setState((s) => ({ ...s, saving: true, error: null, done: null }));
    try {
      const v = await backend.rpc("app_tutor_save_explosiva_preferences", { p_level: level, p_shouts: level ? form.shouts : null, p_profanity: level ? form.profanity : null });
      apply(v);
      setState((s) => ({ ...s, saving: false, done: level ? `Pronto: ${nomeDe} vai falar assim a partir da próxima fala.` : "Voltou ao padrão: N3, com gritos e palavrões." }));
    } catch (e) {
      setState((s) => ({ ...s, saving: false, error: messageOf(e) }));
    }
  };

  return (
    <section className={`explosiva-prefs${compact ? " explosiva-prefs--compact" : ""}`} aria-labelledby="explosiva-prefs-title">
      <div className="explosiva-prefs__head">
        <h3 id="explosiva-prefs-title">{jeito}</h3>
        <p className="explosiva-prefs__muted">Humor adulto e palavrão já vêm ligados: todo aluno aqui é médico e maior de 18. Escolha o quanto quer de pressão.</p>
      </div>

      <fieldset className="explosiva-prefs__levels">
        <legend>Nível</legend>
        {niveis.map((l) => {
          const locked = ADULT_ONLY.has(l.id) && !adult;
          return (
            <label key={l.id} className={`explosiva-prefs__level${form.level === l.id ? " is-on" : ""}${locked ? " is-locked" : ""}`}>
              <input type="radio" name="explosiva-level" value={l.id} checked={form.level === l.id} disabled={locked} onChange={() => set({ level: l.id })} />
              <span className="explosiva-prefs__level-text">
                <span className="explosiva-prefs__level-name">{l.name}{l.standard ? <span className="explosiva-prefs__tag">padrão</span> : null}</span>
                <span>{l.line}</span>
                <span className="explosiva-prefs__sample">«{l.sample}»</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {!adult && (
        <p className="explosiva-prefs__notice" role="note">
          Os níveis 3 e 4 ficam liberados depois do aceite do Termo com a declaração de que você é médico(a) e maior de 18. Até lá, {nomeDe} fala no N2.
        </p>
      )}

      <div className="explosiva-prefs__switches">
        <Switch label="Gritos" description={`${ele} pode levantar a voz numa palavra ou frase curta, na indignação ou na comemoração.`} checked={form.shouts} onChange={(e) => set({ shouts: e.target.checked })} />
        <Switch label="Palavrões" description={`Desligado, ${ele.toLowerCase()} continua exigente, só com palavra limpa.`} checked={form.profanity} onChange={(e) => set({ profanity: e.target.checked })} />
      </div>

      <p className="explosiva-prefs__rules">
        Em qualquer nível, a bronca é sobre o erro, nunca sobre você: sem ofensa pessoal, sem preconceito, sem ameaça. Se você disser que não está bem,
        {ele.toLowerCase()} fica calm{durao ? "o" : "a"}. E {ele.toLowerCase()} nunca entrega a resposta antes da hora nem ajuda em simulado que não permite ajuda.
      </p>
      <p className="explosiva-prefs__muted" aria-live="polite">
        Agora: <strong>{niveis.find((l) => l.id === effective).name}</strong>, gritos {form.shouts && effective !== "n1" && effective !== "n2" ? "ligados" : "desligados"}, palavrões {form.profanity ? (effective === "n1" ? "desligados (o N1 não usa)" : effective === "n2" ? "só leves" : "ligados") : "desligados"}.
      </p>

      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.done && <Banner tone="success">{state.done}</Banner>}
      <div className="explosiva-prefs__actions">
        {!data.choice.is_default && <Button variant="ghost" size="sm" onClick={() => save(null)} disabled={state.saving}>Voltar ao padrão</Button>}
        <Button size="sm" onClick={() => save(form.level)} loading={state.saving} disabled={state.saving || !changed}>Salvar</Button>
      </div>
    </section>
  );
}
