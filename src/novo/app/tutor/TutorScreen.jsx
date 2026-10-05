// Stazia Tutor: o professor de IA do aluno. Mesma disposição da tela "Tutor" do protótipo (prototype/More.jsx): conversas à
// esquerda, conversa à direita, sugestões e campo de mensagem embaixo. O texto fixo do protótipo saiu: tudo aqui vem do banco
// e do servidor. A personalidade muda só o jeito de falar; o conteúdo passa por validação no servidor antes de aparecer
// (ou de ser falado). Embaixo de cada resposta o aluno vê de onde ela veio.
import React from "react";
import { AnswerOption, Badge, Banner, Button, Card, Chip, EmptyState, Icon, IconButton, IconTile, SegmentedControl, SelectField, Switch, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { examLabel, splitStatement } from "../practice/format.js";
import { tutorAvailable, tutorTurn } from "./api.js";
import { CONFIDENCE, ERROR_CLASS, EXPLANATION, GROUNDING, HUMOR, INTENSITY, LEVEL, MODES, PROFANITY, STRICTNESS, modeLabel } from "./labels.js";
import { chooseVoice, chosenVoiceName, isPauseWord, portugueseVoices, useVoice, voiceSupport } from "./useVoice.js";

const R = { borderRadius: 24 };
const messageOf = (error) => error?.message || "Não foi possível concluir. Tente de novo.";

export function TutorScreen({ go }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const [status, setStatus] = React.useState(null);
  const [sessions, setSessions] = React.useState([]);
  const [session, setSession] = React.useState(null);
  const [view, setView] = React.useState("loading"); // loading | setup | start | chat | report
  const [error, setError] = React.useState(null);

  const refresh = React.useCallback(async () => {
    const [st, list] = await Promise.all([backend.rpc("app_tutor_status"), backend.rpc("app_tutor_sessions", { p_limit: 20 })]);
    setStatus(st);
    setSessions(list ?? []);
    return st;
  }, [backend]);

  React.useEffect(() => {
    let alive = true;
    refresh().then(
      (st) => alive && setView(st.preferences.chosen ? "start" : "setup"),
      (e) => alive && (setError(messageOf(e)), setView("start"))
    );
    return () => {
      alive = false;
    };
  }, [refresh]);

  const open = async (id) => {
    setError(null);
    try {
      setSession(await backend.rpc("app_tutor_session", { p_session_id: id }));
      setView("chat");
    } catch (e) {
      setError(messageOf(e));
    }
  };
  const start = async (mode, topic) => {
    setError(null);
    try {
      const s = await backend.rpc("app_tutor_start", { p_mode: mode, p_topic: topic || null, p_question_id: null });
      setSession(s);
      setView("chat");
      refresh().catch(() => {});
    } catch (e) {
      setError(messageOf(e));
    }
  };

  if (view === "loading") return <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;
  if (!status) return <Banner tone="danger">{error ?? "Não foi possível carregar o Tutor."}</Banner>;
  if (!status.enabled) {
    return <EmptyState icon="sparkles" title="O Tutor ainda não está ligado" description="O professor de IA entra no ar quando a equipe StaziaMed ligar. Enquanto isso, as questões, o caderno de erros e a revisão seguem funcionando." />;
  }
  if (!status.available) {
    return <EmptyState icon="lock" title="O Tutor faz parte dos planos pagos" description="Com um plano ativo você conversa com o professor de IA, por texto ou por voz." action={<Button iconRight="arrow-right" onClick={() => go("perfil")}>Ver planos</Button>} />;
  }
  if (!tutorAvailable(backend)) return <Banner tone="warning" title="Servidor necessário">O Tutor responde pelo servidor. Entre de novo na sua conta.</Banner>;

  const side = (
    <Card style={R} padding={16}>
      <Button fullWidth icon="plus" variant="secondary" onClick={() => (setSession(null), setView("start"))}>
        Nova conversa
      </Button>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 2 }}>
        {sessions.length === 0 && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", padding: "4px 8px" }}>Nenhuma conversa ainda.</span>}
        {sessions.map((s) => (
          <button key={s.id} type="button" className="sm-nav__item" aria-current={session?.id === s.id && view === "chat" ? "page" : undefined} style={{ height: 40, fontWeight: 500 }} onClick={() => open(s.id)}>
            <span aria-hidden="true" style={{ width: 16, textAlign: "center" }}>{s.personality}</span>
            <span className="sm-nav__label" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        <Button fullWidth size="sm" variant="ghost" icon="chart-no-axes-combined" onClick={() => setView("report")}>Meu relatório</Button>
        <Button fullWidth size="sm" variant="ghost" icon="user-round-cog" onClick={() => setView("setup")}>Trocar professor</Button>
      </div>
      <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: "var(--surface-subtle)", font: "var(--type-caption)", color: "var(--text-secondary)" }}>
        {status.used_today} de {status.daily_limit} mensagens hoje
        {status.reviews_due > 0 ? ` · ${status.reviews_due} revisão(ões) na hora` : ""}
      </div>
    </Card>
  );

  let body;
  if (view === "setup") body = <ProfessorPicker status={status} onSaved={() => refresh().then(() => setView(session ? "chat" : "start"))} />;
  else if (view === "report") body = <Report onBack={() => setView(session ? "chat" : "start")} />;
  else if (view === "chat" && session) body = <Chat key={session.id} session={session} setSession={setSession} status={status} onUsage={(used) => setStatus((s) => ({ ...s, used_today: used }))} mobile={mobile} />;
  else body = <StartPanel status={status} onStart={start} onSetup={() => setView("setup")} />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "260px minmax(0,1fr)", gap: 20, alignItems: "stretch" }}>
      {!mobile && side}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        {mobile && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" icon="plus" variant="secondary" onClick={() => (setSession(null), setView("start"))}>Nova conversa</Button>
            <Button size="sm" variant="ghost" icon="chart-no-axes-combined" onClick={() => setView("report")}>Relatório</Button>
            <Button size="sm" variant="ghost" icon="user-round-cog" onClick={() => setView("setup")}>Professor</Button>
          </div>
        )}
        {error && <Banner tone="danger">{error}</Banner>}
        {body}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- escolha do professor
function ProfessorPicker({ status, onSaved }) {
  const { backend } = useSession();
  const [prefs, setPrefs] = React.useState(() => ({ ...status.preferences, humor: status.preferences.humor == null ? "" : String(status.preferences.humor) }));
  const [state, setState] = React.useState({ saving: false, error: null });
  const set = (patch) => setPrefs((p) => ({ ...p, ...patch }));
  const chosen = status.personalities.find((p) => p.id === prefs.personality_id);
  const profanityOptions = PROFANITY.filter((o) => PROFANITY.findIndex((x) => x.value === o.value) <= PROFANITY.findIndex((x) => x.value === status.max_profanity));
  const save = async () => {
    setState({ saving: true, error: null });
    try {
      await backend.rpc("app_tutor_save_preferences", {
        p_prefs: { personality_id: prefs.personality_id, intensity: prefs.intensity, humor: prefs.humor === "" ? null : Number(prefs.humor), explanation: prefs.explanation, strictness: prefs.strictness, profanity: chosen?.swears ? prefs.profanity : "off", adaptive: prefs.adaptive },
      });
      onSaved();
    } catch (e) {
      setState({ saving: false, error: messageOf(e) });
    }
  };
  return (
    <Card style={R} padding={28}>
      <h3 style={{ margin: 0, font: "600 18px var(--font-sans)" }}>Escolha seu professor</h3>
      <p style={{ margin: "6px 0 16px", color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>O professor muda o jeito de ensinar. O conteúdo, o gabarito e as fontes são sempre os mesmos.</p>
      <div role="radiogroup" aria-label="Professor" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 10 }}>
        {status.personalities.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={p.id === prefs.personality_id} onClick={() => set({ personality_id: p.id })}
            style={{ all: "unset", cursor: "pointer", boxSizing: "border-box", padding: 12, borderRadius: 14, border: `2px solid var(${p.id === prefs.personality_id ? "--border-brand" : "--border-subtle"})`, background: p.id === prefs.personality_id ? "var(--surface-brand-soft)" : "var(--surface-card)" }}>
            <div style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">{p.emoji}</div>
            <div style={{ font: "600 14px var(--font-sans)", marginTop: 6 }}>{p.name.replace(/^Professor /, "")}</div>
            <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{p.tagline}</div>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
        <SegmentedControl label="Qual intensidade?" value={String(prefs.intensity)} onChange={(v) => set({ intensity: Number(v) })} options={INTENSITY.map((label, i) => ({ value: String(i + 1), label: `${i + 1} · ${label}` }))} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          <SelectField label="Explicação" value={prefs.explanation} onChange={(e) => set({ explanation: e.target.value })} options={EXPLANATION} />
          <SelectField label="Cobrança" value={prefs.strictness} onChange={(e) => set({ strictness: e.target.value })} options={STRICTNESS} />
          <SelectField label="Humor" value={prefs.humor} onChange={(e) => set({ humor: e.target.value })} options={HUMOR} />
          {chosen?.swears && profanityOptions.length > 1 && <SelectField label="Palavrões" hint="Só como ênfase bem-humorada, nunca contra você." value={prefs.profanity} onChange={(e) => set({ profanity: e.target.value })} options={profanityOptions} />}
        </div>
        <Switch label="Tutor Inteligente" description="Ajusta a intensidade por um tempo quando você trava ou embala, e sempre avisa. O professor escolhido não muda." checked={prefs.adaptive} onChange={(e) => set({ adaptive: e.target.checked })} />
        {status.voice_enabled && <VoicePicker voice={chosen?.voice} />}
        {state.error && <Banner tone="danger">{state.error}</Banner>}
        <div>
          <Button icon="check" loading={state.saving} onClick={save}>Salvar professor</Button>
        </div>
      </div>
    </Card>
  );
}

/** Voz do aparelho: lista as vozes em português (a mais natural primeiro) e deixa ouvir antes de escolher. */
function VoicePicker({ voice }) {
  const [voices, setVoices] = React.useState(() => portugueseVoices());
  const [name, setName] = React.useState(() => chosenVoiceName());
  React.useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) return undefined;
    const refresh = () => setVoices(portugueseVoices());
    refresh();
    synth.addEventListener?.("voiceschanged", refresh);
    return () => synth.removeEventListener?.("voiceschanged", refresh);
  }, []);
  if (voices.length === 0) return null;
  const listen = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance("Oi. É assim que eu vou falar com você. Se ficar estranho, escolhe outra voz.");
    const v = voices.find((x) => x.name === name) ?? voices[0];
    u.voice = v;
    u.lang = v.lang;
    u.rate = Number(voice?.rate) || 1;
    u.pitch = Number(voice?.pitch) || 1;
    synth.speak(u);
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 220, maxWidth: 420 }}>
        <SelectField
          label="Voz do professor (deste aparelho)"
          hint="As vozes vêm do seu aparelho e do navegador. As marcadas como natural, neural ou aprimorada soam menos robóticas."
          value={name}
          onChange={(e) => (setName(e.target.value), chooseVoice(e.target.value))}
          options={[{ value: "", label: `A mais natural (${voices[0].name})` }, ...voices.map((v) => ({ value: v.name, label: v.name }))]}
        />
      </div>
      <Button size="sm" variant="secondary" icon="volume-2" onClick={listen}>Ouvir</Button>
    </div>
  );
}

// ---------------------------------------------------------------- começar
function StartPanel({ status, onStart, onSetup }) {
  const [mode, setMode] = React.useState("questao");
  const [topic, setTopic] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const m = MODES.find((x) => x.id === mode);
  const chosen = status.personalities.find((p) => p.id === status.preferences.personality_id);
  const go = async () => {
    setBusy(true);
    await onStart(mode, m.topic ? topic.trim() : null);
    setBusy(false);
  };
  return (
    <Card style={R} padding={28}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 30, lineHeight: 1 }} aria-hidden="true">{chosen?.emoji}</div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <h3 style={{ margin: 0, font: "600 18px var(--font-sans)" }}>{chosen?.name}</h3>
          <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>Intensidade {status.preferences.intensity} · {INTENSITY[status.preferences.intensity - 1]}</div>
        </div>
        <Button size="sm" variant="ghost" icon="user-round-cog" onClick={onSetup}>Trocar</Button>
      </div>
      <h4 style={{ margin: "20px 0 10px", font: "600 15px var(--font-sans)" }}>Como você quer estudar agora?</h4>
      <div role="radiogroup" aria-label="Modo de estudo" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 10 }}>
        {MODES.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={x.id === mode} onClick={() => setMode(x.id)}
            style={{ all: "unset", cursor: "pointer", boxSizing: "border-box", padding: 12, borderRadius: 14, display: "flex", gap: 10, alignItems: "flex-start", border: `2px solid var(${x.id === mode ? "--border-brand" : "--border-subtle"})`, background: x.id === mode ? "var(--surface-brand-soft)" : "var(--surface-card)" }}>
            <Icon name={x.icon} size={18} />
            <span>
              <span style={{ display: "block", font: "600 14px var(--font-sans)" }}>
                {x.label}
                {x.id === "erros" && status.reviews_due > 0 ? ` (${status.reviews_due})` : ""}
              </span>
              <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{x.hint}</span>
            </span>
          </button>
        ))}
      </div>
      {m.topic && (
        <div style={{ marginTop: 14, maxWidth: 480 }}>
          <TextField label="Tema" placeholder="ex.: pré-eclâmpsia, sepse, calendário vacinal" value={topic} maxLength={120} onChange={(e) => setTopic(e.target.value)} />
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <Button iconRight="arrow-right" loading={busy} disabled={m.topic && topic.trim().length < 3} onClick={go}>Começar</Button>
      </div>
      <p style={{ margin: "14px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
        O Tutor só afirma valores, doses e diretrizes que estiverem na base conferida. Quando não estiverem, ele diz que não encontrou confirmação.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------- conversa
function Chat({ session, setSession, status, onUsage, mobile }) {
  const { backend } = useSession();
  const [messages, setMessages] = React.useState(session.messages);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [voiceOn, setVoiceOn] = React.useState(false);
  const interrupted = React.useRef(null);
  const endRef = React.useRef(null);
  const support = React.useMemo(voiceSupport, []);
  const voiceAllowed = status.voice_enabled && (support.speak || support.listen);

  const sendRef = React.useRef(null);
  const voice = useVoice({
    onUtterance: (said) => {
      if (isPauseWord(said)) return; // "espera": o professor já parou; fica aguardando o aluno
      sendRef.current?.({ action: "message", text: said, byVoice: true });
    },
  });

  React.useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, voice.interim]);

  const reload = async () => {
    const fresh = await backend.rpc("app_tutor_session", { p_session_id: session.id });
    setSession(fresh);
    return fresh;
  };

  const send = async ({ action, text: said, byVoice = false }) => {
    if (sending) return;
    const spoken = byVoice || voiceOn;
    setError(null);
    setSending(true);
    const mine = action === "message" ? said : action === "hint" ? (session.hint_level === 0 ? "Me dá uma ajuda aqui." : "Me ajuda mais um pouco.") : null;
    if (mine) setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "student", content: mine }]);
    try {
      const r = await tutorTurn(backend, { session_id: session.id, action, text: said, voice: spoken, interrupted: interrupted.current });
      interrupted.current = null;
      setMessages((m) => [...m, r.message]);
      onUsage(r.used_today);
      if (action === "hint" || r.question_state !== session.question_state) await reload();
      if (spoken && support.speak) {
        // a fala não segura a conversa: o aluno pode interromper e mandar outra mensagem
        voice.speak(r.message.spoken, session.personality.voice).then((finished) => {
          if (finished && byVoice && support.listen) voice.listen(); // conversa por voz: volta a ouvir quando termina de falar
        });
      }
    } catch (e) {
      setError(messageOf(e));
      if (mine) setMessages((m) => m.slice(0, -1));
    } finally {
      setSending(false);
    }
  };
  sendRef.current = send;

  const submit = (event) => {
    event.preventDefault();
    const said = text.trim();
    if (!said) return;
    setText("");
    send({ action: "message", text: said });
  };

  /** Microfone: se o professor está falando, interrompe (e guarda o ponto); depois ouve o aluno. */
  const mic = () => {
    if (voice.listening) return voice.stopListening();
    if (voice.speaking) interrupted.current = voice.interrupt();
    setVoiceOn(true);
    voice.listen();
  };

  const answer = async (option, confidence) => {
    setError(null);
    setSending(true);
    try {
      await backend.rpc("app_tutor_answer", { p_session_id: session.id, p_option: option, p_confidence: confidence });
      const fresh = await reload();
      setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "student", content: `Marquei a ${option}.` }]);
      setSending(false);
      if (fresh.question_state === "answered") await send({ action: "react" });
    } catch (e) {
      setError(messageOf(e));
      setSending(false);
    }
  };

  const nextQuestion = async () => {
    setError(null);
    try {
      const fresh = await backend.rpc("app_tutor_next_question", { p_session_id: session.id });
      setSession(fresh);
      setMessages(fresh.messages);
    } catch (e) {
      setError(messageOf(e));
    }
  };

  const last = messages[messages.length - 1];
  const suggestions = last?.role === "tutor" ? (last.suggested ?? []) : [];
  const limitReached = status.used_today >= status.daily_limit;
  const closed = session.status !== "active";

  return (
    <Card style={{ ...R, display: "flex", flexDirection: "column", minHeight: mobile ? 520 : 600 }} padding={0}>
      <div style={{ padding: mobile ? "12px 18px" : "14px 28px", borderBottom: "1px solid var(--border-subtle)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 20 }} aria-hidden="true">{session.personality.emoji}</span>
        <strong style={{ font: "600 15px var(--font-sans)" }}>{session.personality.name}</strong>
        <Badge size="sm">intensidade {session.intensity}</Badge>
        <Badge size="sm" tone="brand">{modeLabel(session.mode)}</Badge>
        {session.question && <Badge size="sm">nível {session.difficulty_level} de 10</Badge>}
        <span style={{ flex: 1 }} />
        {voiceAllowed && support.speak && <Switch label="Voz" checked={voiceOn} onChange={(e) => (setVoiceOn(e.target.checked), !e.target.checked && voice.interrupt())} />}
      </div>

      <div style={{ flex: 1, padding: mobile ? 18 : 28, display: "flex", flexDirection: "column", gap: 14 }} aria-live="polite">
        {session.question && <QuestionCard session={session} busy={sending} onAnswer={answer} onHint={() => send({ action: "hint" })} onNext={nextQuestion} limitReached={limitReached} />}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {sending && <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", paddingLeft: 42 }}>O professor está pensando…</div>}
        {voice.listening && <div style={{ alignSelf: "flex-end", font: "var(--type-body-sm)", color: "var(--text-secondary)", fontStyle: "italic" }}>{voice.interim || "Ouvindo…"}</div>}
        <div ref={endRef} />
      </div>

      <div style={{ padding: mobile ? 14 : 20, borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 10 }}>
        {error && <Banner tone="danger">{error}</Banner>}
        {limitReached && <Banner tone="warning">Você chegou ao limite de {status.daily_limit} mensagens de hoje. Amanhã tem mais.</Banner>}
        {closed && <Banner tone="info">Esta conversa foi encerrada. Abra uma nova para continuar.</Banner>}
        {voice.speaking && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="volume-2" size={16} />
            <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)", flex: 1 }}>O professor está falando.</span>
            <Button size="sm" variant="secondary" icon="square" onClick={() => (interrupted.current = voice.interrupt())}>Interromper</Button>
          </div>
        )}
        {suggestions.length > 0 && !closed && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {suggestions.map((x) => (
              <Chip key={x} onClick={() => send({ action: "message", text: x })}>{x}</Chip>
            ))}
          </div>
        )}
        <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <TextField aria-label="Mensagem" placeholder={voice.listening ? "Ouvindo…" : "Pergunte ao tutor…"} value={text} maxLength={2000} disabled={closed || limitReached} onChange={(e) => setText(e.target.value)} />
          </div>
          {voiceAllowed && support.listen && (
            <IconButton icon={voice.listening ? "mic-off" : "mic"} label={voice.listening ? "Parar de ouvir" : voice.speaking ? "Interromper e falar" : "Falar com o professor"} variant={voice.listening ? "primary" : "secondary"} onClick={mic} disabled={closed || limitReached || sending} />
          )}
          <Button type="submit" icon="arrow-up" aria-label="Enviar" loading={sending} disabled={closed || limitReached || !text.trim()}>
            {mobile ? "" : "Enviar"}
          </Button>
        </form>
        {voiceAllowed && !support.listen && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Este navegador não ouve por microfone; a leitura em voz alta funciona.</span>}
      </div>
    </Card>
  );
}

function Bubble({ message: m }) {
  const mine = m.role === "student";
  const [label, tone] = GROUNDING[m.grounding] ?? [null, "neutral"];
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: mine ? "flex-end" : "flex-start" }}>
      {!mine && <IconTile name="sparkles" size={32} bg="var(--ai-bg)" />}
      <div style={{ maxWidth: 560, minWidth: 0 }}>
        <div style={{ padding: "12px 16px", borderRadius: 18, background: mine ? "var(--action-primary)" : "var(--surface-subtle)", color: mine ? "var(--action-on-primary)" : "var(--text-primary)", font: "var(--type-body)", lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {m.content}
        </div>
        {!mine && (label || m.notice || m.hint_level) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            {m.hint_level ? <Badge size="sm">ajuda {m.hint_level} de 5</Badge> : null}
            {label && <Badge size="sm" tone={tone}>{label}</Badge>}
            {(m.sources ?? []).map((s) => (
              <span key={s.ref} style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{s.label}</span>
            ))}
            {m.notice && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{m.notice}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/** A questão da conversa: sem gabarito enquanto aberta; depois da resposta (ou da dica 5) mostra a correta. */
function QuestionCard({ session, busy, onAnswer, onHint, onNext, limitReached }) {
  const q = session.question;
  const [selected, setSelected] = React.useState(null);
  const [confidence, setConfidence] = React.useState(null);
  React.useEffect(() => {
    setSelected(null);
    setConfidence(null);
  }, [q.id]);
  const open = q.state === "open";
  const parts = splitStatement(q.statement);
  const answered = session.last_answer;
  const stateOf = (id) => {
    if (open) return id === selected ? "selected" : "idle";
    if (id === q.correct_option) return "correct";
    if (answered && id === answered.selected) return "incorrect";
    return "dimmed";
  };
  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: 18, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Badge size="sm" tone="brand">{q.exam ? examLabel(q.exam) : "Questão"} · nº {q.number}</Badge>
        <Badge size="sm">{q.topic}</Badge>
      </div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, textWrap: "pretty" }}>{parts.stem}</p>
      {parts.ask && <p style={{ margin: 0, font: "600 15px/1.45 var(--font-sans)" }}>{parts.ask}</p>}
      <div role="radiogroup" aria-label="Alternativas" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.options.map((o) => (
          <AnswerOption key={o.id} letter={o.id} state={stateOf(o.id)} onClick={() => open && setSelected(o.id)}>
            {o.text}
          </AnswerOption>
        ))}
      </div>
      {open && (
        <>
          <div>
            <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)", marginBottom: 6 }}>Qual a sua confiança nessa resposta? (opcional)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CONFIDENCE.map((label, i) => (
                <Chip key={label} selected={confidence === i} onClick={() => setConfidence(confidence === i ? null : i)}>{i} · {label}</Chip>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button icon="check" disabled={!selected || busy} onClick={() => onAnswer(selected, confidence)}>Responder</Button>
            <Button variant="secondary" icon="lightbulb" disabled={busy || limitReached || session.hint_level >= 5} onClick={onHint}>
              {session.hint_level >= 5 ? "Sem mais ajuda" : session.hint_level === 0 ? "Pedir ajuda" : `Pedir mais ajuda (${session.hint_level + 1} de 5)`}
            </Button>
          </div>
          {session.hint_level >= 3 && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Com 3 ajudas ou mais, mesmo acertando a questão volta em revisão.</span>}
        </>
      )}
      {!open && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {q.state === "revealed" && <Badge tone="warning">O professor contou a resposta: não conta no seu histórico</Badge>}
          {answered && <Badge tone={answered.is_correct ? "success" : "danger"}>{answered.is_correct ? "Você acertou" : `Você marcou ${answered.selected}; a correta é ${q.correct_option}`}</Badge>}
          {answered?.lucky_guess && <Badge tone="warning">Provável chute: volta em revisão</Badge>}
          {answered?.heavy_hints && <Badge tone="warning">Com muita ajuda: volta em revisão</Badge>}
          {answered?.outcome === "priority" && <Badge tone="danger">Errou com certeza: prioridade</Badge>}
          {["questao", "erros"].includes(session.mode) && session.status === "active" && <Button size="sm" iconRight="arrow-right" disabled={busy} onClick={onNext}>Próxima questão</Button>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- relatório
function Report({ onBack }) {
  const { backend } = useSession();
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    backend.rpc("app_tutor_report").then((r) => alive && setData(r), (e) => alive && setError(messageOf(e)));
    return () => {
      alive = false;
    };
  }, [backend]);
  if (error) return <Banner tone="danger">{error}</Banner>;
  if (!data) return <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;
  const pct = (x) => (x.attempts ? `${Math.round((100 * x.correct) / x.attempts)}% em ${x.attempts}` : "sem respostas");
  const classes = Object.entries(data.tutor.error_classes ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <Card style={R} padding={28}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, font: "600 18px var(--font-sans)" }}>Meu relatório</h3>
        <Button size="sm" variant="ghost" icon="arrow-left" onClick={onBack}>Voltar</Button>
      </div>
      <div className="sm-overline" style={{ marginTop: 16 }}>Domínio por grande área</div>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {data.mastery.areas.map((a) => {
          const [label, tone] = LEVEL[a.level] ?? [a.level, "neutral"];
          return (
            <div key={a.area} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "8px 12px", border: "1px solid var(--border-subtle)", borderRadius: 12 }}>
              <span>{a.area.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{a.attempts ? `${a.accuracy}% em ${a.attempts}` : "sem respostas"}</span>
                <Badge size="sm" tone={tone}>{label}</Badge>
              </span>
            </div>
          );
        })}
      </div>
      {data.highest_risk_area && <p style={{ margin: "10px 0 0", font: "var(--type-body-sm)" }}>Área com maior risco hoje: <b>{data.highest_risk_area.replace(/_/g, " ").toLowerCase()}</b>.</p>}
      {data.critical_topics.length > 0 && (
        <>
          <div className="sm-overline" style={{ marginTop: 16 }}>Temas críticos</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {data.critical_topics.map((t) => (
              <Badge key={`${t.area}-${t.subarea}`} tone={LEVEL[t.level]?.[1]}>{t.subarea} · {t.accuracy}%</Badge>
            ))}
          </div>
        </>
      )}
      <div className="sm-overline" style={{ marginTop: 16 }}>Evolução</div>
      <p style={{ margin: "6px 0 0", font: "var(--type-body-sm)" }}>Últimos 30 dias: {pct(data.evolution.last_30)}. Os 30 dias anteriores: {pct(data.evolution.previous_30)}.</p>
      <div className="sm-overline" style={{ marginTop: 16 }}>Revisões</div>
      <p style={{ margin: "6px 0 0", font: "var(--type-body-sm)" }}>{data.reviews.due} na hora de rever · {data.reviews.scheduled} agendadas (1, 3, 7, 14 e 30 dias).</p>
      <div className="sm-overline" style={{ marginTop: 16 }}>Com o Tutor</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        <Badge>{data.tutor.correct} acertos em {data.tutor.answers} respostas</Badge>
        {data.tutor.wrong_but_sure > 0 && <Badge tone="danger">{data.tutor.wrong_but_sure} erro(s) com certeza</Badge>}
        {data.tutor.lucky_guesses > 0 && <Badge tone="warning">{data.tutor.lucky_guesses} provável(is) chute(s)</Badge>}
        {data.tutor.with_heavy_hints > 0 && <Badge tone="warning">{data.tutor.with_heavy_hints} com muita ajuda</Badge>}
        <Badge>{data.tutor.avg_hints} ajuda(s) por questão, em média</Badge>
      </div>
      {classes.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {classes.map(([k, n]) => (
              <Badge key={k} tone="warning">{ERROR_CLASS[k] ?? k} · {n}</Badge>
            ))}
          </div>
          <p style={{ margin: "6px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Tipo de erro apontado pelo Tutor (IA) na hora da correção: serve de pista, não é diagnóstico revisado por médico.</p>
        </>
      )}
      <p style={{ margin: "16px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Não há previsão de aprovação aqui: não existe base para prometer isso.</p>
    </Card>
  );
}
