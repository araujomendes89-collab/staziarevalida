// Reações de voz do Tutor (administração, aba Configurações, junto das personalidades). Regra do dono (15/10): "EU ESCOLHO". Para cada professor e
// cada nível da Durona Explosiva, o dono marca quais reações (risada, suspiro, grito…) podem ser usadas e com que frequência
// máxima. O servidor só deixa passar o que está marcado aqui E o que o provedor de voz ativo entende; o resto é tirado do texto
// antes de virar voz. Nada nasce marcado. O banco confere o administrador e exige o motivo (app_admin_tutor_save_voice_reactions).
import React from "react";
import { Badge, Banner, Button, Checkbox, SelectField, Switch, Tabs } from "../../ds";
import { useSession } from "../session.jsx";
import { LoadError, Loading, TextArea, messageOf, useLoad } from "./common.jsx";
import { DEFAULT_FREQUENCY, REACTIONS, REACTION_PROFILES, VOICE_PROVIDERS, profileKey } from "../../../shared/tutor/voiceReactions";
import "./voiceReactions.css";

const PER_REPLY = ["1", "2", "3"].map((v) => ({ value: v, label: `${v} por fala` }));
const PER_10 = Array.from({ length: 10 }, (_, i) => String(i + 1)).map((v) => ({ value: v, label: `${v} a cada 10 falas` }));
const cellKey = (profile, reaction) => `${profile}|${reaction}`;

function fromRules(rules) {
  const out = {};
  for (const r of rules ?? []) {
    out[cellKey(profileKey(r.personality, r.level), r.reaction)] = { allowed: Boolean(r.allowed), max_per_reply: Number(r.max_per_reply) || 1, max_per_10: Number(r.max_per_10) || 2 };
  }
  return out;
}

function toRules(cells) {
  const out = [];
  for (const p of REACTION_PROFILES) {
    for (const r of REACTIONS) {
      const c = cells[cellKey(p.key, r.id)];
      if (c?.allowed) out.push({ personality: p.personality, level: p.level, reaction: r.id, allowed: true, max_per_reply: c.max_per_reply, max_per_10: c.max_per_10 });
    }
  }
  return out;
}

/** Quem entende a reação: as marcações dos provedores que leem texto; os ao vivo nunca (só orientação de tom). */
function Support({ reaction }) {
  return (
    <span className="voice-reactions__support">
      {VOICE_PROVIDERS.map((p) => {
        const tag = reaction.support[p.id];
        return (
          <Badge key={p.id} size="sm" tone={tag ? "success" : "neutral"}>
            {p.label}: {tag ? tag : "não"}
          </Badge>
        );
      })}
    </span>
  );
}

export function VoiceReactionsPanel() {
  const { backend } = useSession();
  const { data, error, loading, reload, setData } = useLoad(() => backend.rpc("app_admin_tutor_voice_reactions"), [backend]);
  const [cells, setCells] = React.useState({});
  const [explosiva, setExplosiva] = React.useState(false);
  const [profile, setProfile] = React.useState(REACTION_PROFILES[0].key);
  const [reason, setReason] = React.useState("");
  const [state, setState] = React.useState({ saving: false, error: null, done: false });

  React.useEffect(() => {
    if (!data) return;
    setCells(fromRules(data.rules));
    setExplosiva(Boolean(data.explosiva_enabled));
  }, [data]);

  if (error) return <LoadError error={error} retry={reload} />;
  if (loading && !data) return <Loading />;

  const current = REACTION_PROFILES.find((p) => p.key === profile);
  const update = (reaction, patch) => {
    setState({ saving: false, error: null, done: false });
    setCells((all) => {
      const key = cellKey(profile, reaction);
      const prev = all[key] ?? { allowed: false, ...DEFAULT_FREQUENCY };
      return { ...all, [key]: { ...prev, ...patch } };
    });
  };
  const countOf = (key) => REACTIONS.filter((r) => cells[cellKey(key, r.id)]?.allowed).length;
  const save = async () => {
    if (reason.trim().length < 10) {
      setState({ saving: false, error: "Escreva o motivo da mudança (pelo menos 10 letras).", done: false });
      return;
    }
    setState({ saving: true, error: null, done: false });
    try {
      const fresh = await backend.rpc("app_admin_tutor_save_voice_reactions", { p_rules: toRules(cells), p_explosiva_enabled: explosiva, p_reason: reason.trim() });
      setData(fresh);
      setReason("");
      setState({ saving: false, error: null, done: true });
    } catch (e) {
      setState({ saving: false, error: messageOf(e), done: false });
    }
  };

  return (
    <section className="voice-reactions" aria-labelledby="voice-reactions-title">
      <header>
        <span className="voice-reactions__eyebrow">TUTOR DE VOZ · VOCÊ ESCOLHE</span>
        <h2 id="voice-reactions-title">Reações de voz por professor</h2>
        <p>
          Marque o que cada professor pode fazer com a voz (rir, suspirar, gritar…) e quantas vezes no máximo. O que não estiver marcado
          o servidor tira do texto antes de virar voz, mesmo que a IA escreva. Nada vem marcado: você decide. Em sofrimento ou crise do aluno,
          nenhuma reação passa, em nenhum professor.
        </p>
      </header>

      <div className="voice-reactions__explosiva">
        <Switch
          label="Durona Explosiva (e Durão) disponível para os alunos"
          description="Ligada para todos (todos são médicos maiores de 18). Quem escolhe a Durona ou o Durão começa no N3 Estressada, com gritos e palavrões; N3 e N4 dependem da declaração de 18+ no aceite do Termo. O aluno pode baixar o nível e desligar gritos e palavrões nas preferências."
          checked={explosiva}
          onChange={(e) => { setExplosiva(e.target.checked); setState({ saving: false, error: null, done: false }); }}
        />
      </div>

      <Tabs wrap label="Professor e nível" value={profile} onChange={setProfile} tabs={REACTION_PROFILES.map((p) => ({ value: p.key, label: p.label, count: countOf(p.key) || undefined }))} />
      <p className="voice-reactions__note" role="note">
        <strong>{current.label}</strong>: {current.note}.
        {current.level !== "padrao" && !explosiva ? " A Durona Explosiva está desligada (vale também para o Durão): estas escolhas ficam guardadas e só valem depois de ligar." : ""}
      </p>

      <ul className="voice-reactions__list" aria-label={`Reações de ${current.label}`}>
        {REACTIONS.map((r) => {
          const c = cells[cellKey(profile, r.id)] ?? { allowed: false, ...DEFAULT_FREQUENCY };
          return (
            <li key={r.id} className="voice-reactions__item" data-on={c.allowed ? "true" : "false"}>
              <div className="voice-reactions__what">
                <Checkbox
                  checked={c.allowed}
                  aria-label={`${r.label} (${current.label})`}
                  onChange={(e) => update(r.id, { allowed: e.target.checked })}
                  label={<span><strong>{r.label}</strong> <code>{r.tag}</code></span>}
                />
                <span className="voice-reactions__hint">{r.hint}{r.shout ? " · obedece ao “desligar gritos” do aluno" : ""}</span>
                <Support reaction={r} />
              </div>
              {c.allowed && (
                <div className="voice-reactions__freq">
                  <SelectField label="No máximo por fala" value={String(c.max_per_reply)} options={PER_REPLY} onChange={(e) => update(r.id, { max_per_reply: Number(e.target.value) })} />
                  <SelectField label="Frequência máxima" value={String(c.max_per_10)} options={PER_10} onChange={(e) => update(r.id, { max_per_10: Number(e.target.value) })} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <details className="voice-reactions__providers">
        <summary>O que cada serviço de voz entende</summary>
        <ul>
          {VOICE_PROVIDERS.map((p) => <li key={p.id}><strong>{p.label}</strong>: {p.note}.</li>)}
        </ul>
        <p>A qualidade dessas reações em português do Brasil ainda não foi confirmada pela documentação: ouça antes de marcar.</p>
      </details>

      <table className="voice-reactions__summary">
        <caption>Resumo: reações marcadas</caption>
        <thead><tr><th scope="col">Professor e nível</th><th scope="col">Marcadas</th></tr></thead>
        <tbody>
          {REACTION_PROFILES.map((p) => (
            <tr key={p.key}><th scope="row">{p.label}</th><td>{countOf(p.key) ? REACTIONS.filter((r) => cells[cellKey(p.key, r.id)]?.allowed).map((r) => r.label).join(", ") : "nenhuma"}</td></tr>
          ))}
        </tbody>
      </table>

      <TextArea label="Motivo da mudança" value={reason} onChange={setReason} rows={2} maxLength={300} hint="Fica no registro da Administração." />
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.done && <Banner tone="success">Reações salvas. Valem para as próximas falas em até 15 segundos.</Banner>}
      <div className="voice-reactions__actions">
        <Button onClick={save} loading={state.saving} disabled={state.saving}>Salvar reações</Button>
      </div>
    </section>
  );
}
