// Nexus: o professor particular do aluno para a 1ª fase do Revalida. Mesma disposição da tela "Tutor" do protótipo
// (prototype/More.jsx): sessões de estudo à esquerda, conversa à direita. Três professores (Tranquilo, Direto, Durona) e quatro modos
// (Questões, Meus erros, Me teste, Perguntar ao Tutor). O professor muda só o jeito; o conteúdo passa por validação no servidor
// antes de aparecer. Por voz, a conversa é em tempo real (GPT-Live ou OpenAI Realtime) na tela cheia do Stazia Voice Mode
// (voice/StaziaVoiceMode.jsx) quando o servidor tem a voz ligada; sem ela, vale a voz do aparelho (modo antigo).
import React from "react";
import { AnswerOption, Badge, Banner, Button, Card, Chip, EmptyState, Icon, IconButton, IconTile, SelectField, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { examLabel, splitStatement } from "../practice/format.js";
import { TutorConsentCard } from "./TutorConsentCard.jsx";
import { tutorAvailable, tutorServerStatus, tutorSpeech, tutorTurn } from "./api.js";
import { AREA_OPTIONS, CONFIDENCE, ERROR_CLASS, GROUNDING, LEVEL, MODES, modeLabel } from "./labels.js";
import { chooseNeural, chooseVoice, chosenVoiceName, neuralChosen, portugueseVoices, useVoice, voiceSupport } from "./useVoice.js";
import { useRealtimeVoice } from "./useRealtimeVoice.js";
import { StaziaVoiceMode, voiceQuotaText } from "./voice/StaziaVoiceMode.jsx";
import { unlockAudio } from "./voice/audioUnlock.js";
import { micErrorMessage, parseVoiceCommand, questionSpeech } from "./voiceCommands.js";
import { Report } from "./ReportScreen.jsx";

const R = { borderRadius: 24 };
const messageOf = (error) => error?.message || "Não foi possível concluir. Tente de novo.";
const minutes = (s) => Math.max(0, Math.floor((s ?? 0) / 60));

export function TutorScreen({ go, initialView = "start" }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const [status, setStatus] = React.useState(null);
  const [sessions, setSessions] = React.useState([]);
  const [session, setSession] = React.useState(null);
  const [view, setView] = React.useState("loading"); // loading | start | chat | report
  const [error, setError] = React.useState(null);
  const [server, setServer] = React.useState({ neural: false, realtime: false, live: false, hint: null }); // vozes ligadas no servidor

  const refresh = React.useCallback(async () => {
    const [st, list] = await Promise.all([backend.rpc("app_tutor_status"), backend.rpc("app_tutor_sessions", { p_limit: 20 })]);
    setStatus(st);
    setSessions(list ?? []);
    return st;
  }, [backend]);

  React.useEffect(() => {
    let alive = true;
    refresh().then(
      () => alive && setView(initialView === "report" ? "report" : "start"),
      (e) => alive && (setError(messageOf(e)), setView("start"))
    );
    return () => {
      alive = false;
    };
  }, [refresh]);

  React.useEffect(() => {
    if (!status?.available || !status.voice_enabled || !tutorAvailable(backend)) return undefined;
    let alive = true;
    tutorServerStatus(backend).then(
      (s) => alive && setServer({ neural: Boolean(s?.neural_voice), realtime: Boolean(s?.realtime_voice), live: Boolean(s?.live_voice), hint: s?.voice_hint ?? null }),
      () => {}
    );
    return () => {
      alive = false;
    };
  }, [backend, status?.available, status?.voice_enabled]);

  const open = async (id) => {
    setError(null);
    try {
      setSession(await backend.rpc("app_tutor_session", { p_session_id: id }));
      setView("chat");
    } catch (e) {
      setError(messageOf(e));
    }
  };
  const start = async ({ mode, topic, context, firstMessage, voice = false }) => {
    setError(null);
    try {
      const s = await backend.rpc("app_tutor_start", { p_mode: mode, p_topic: topic || null, p_question_id: null, p_context: context ?? null });
      // "Conversar com o Tutor": a conversa já abre no modo de voz (a primeira pergunta, se houver, vai falada pelo aluno)
      setSession(voice ? { ...s, voiceFirst: true } : firstMessage ? { ...s, firstMessage } : s);
      setView("chat");
      refresh().catch(() => {});
      return s;
    } catch (e) {
      setError(messageOf(e));
      return null;
    }
  };

  if (view === "loading") return <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;
  if (!status) return <Banner tone="danger">{error ?? "Não foi possível carregar o Tutor."}</Banner>;
  if (!status.enabled) {
    return <EmptyState icon="sparkles" title="O Tutor ainda não está ligado" description="O professor de IA entra no ar quando a equipe StaziaMed ligar. Enquanto isso, as questões, o caderno de erros e a revisão seguem funcionando." />;
  }
  if (status.consent_required) {
    return <TutorConsentCard version={status.consent_version} onAccepted={() => refresh().catch(() => {})} onOutdated={() => refresh()} />;
  }
  if (!status.available) {
    const expired = status.entitlement?.block_reason === "trial_expired";
    return (
      <EmptyState
        icon="lock"
        title={expired ? "Seu teste grátis do Tutor terminou" : "O Tutor faz parte dos planos pagos"}
        description="Com um plano ativo você conversa com o professor por texto ou por voz, com as suas questões, os seus erros e os seus temas."
        action={<Button iconRight="arrow-right" onClick={() => go("perfil")}>Ver planos</Button>}
      />
    );
  }
  if (!tutorAvailable(backend)) return <Banner tone="warning" title="Servidor necessário">O Tutor responde pelo servidor. Entre de novo na sua conta.</Banner>;

  const side = (
    <Card style={R} padding={16}>
      <Button fullWidth icon="plus" variant="secondary" onClick={() => (setSession(null), setView("start"))}>
        Nova sessão
      </Button>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 2 }}>
        {sessions.length === 0 && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", padding: "4px 8px" }}>Nenhuma sessão ainda.</span>}
        {sessions.map((s) => (
          <button key={s.id} type="button" className="sm-nav__item" aria-current={session?.id === s.id && view === "chat" ? "page" : undefined} style={{ height: "auto", minHeight: 44, padding: "6px 8px", alignItems: "flex-start", fontWeight: 500 }} onClick={() => open(s.id)}>
            <span aria-hidden="true" style={{ width: 16, textAlign: "center", paddingTop: 2 }}>{s.personality}</span>
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0, textAlign: "left" }}>
              <span className="sm-nav__label" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
              <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                {s.questions > 0 ? `${s.questions} ${s.questions === 1 ? "questão" : "questões"}` : `${s.minutes ?? 1} min`}{s.persona ? ` · ${s.persona}` : ""}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        <Button fullWidth size="sm" variant="ghost" icon="chart-no-axes-combined" onClick={() => setView("report")}>Meu relatório</Button>
      </div>
      <div style={{ marginTop: 16 }}>
        <TutorQuota status={status} realtime={server.realtime} />
      </div>
    </Card>
  );

  let body;
  if (view === "report") body = <Report onBack={() => setView(session ? "chat" : "start")} />;
  else if (view === "chat" && session)
    body = (
      <Chat key={session.id} session={session} setSession={setSession} status={status} neural={server.neural} realtime={server.realtime} live={server.live} voiceHint={server.hint}
        onUsage={(used) => setStatus((s) => ({ ...s, used_today: used, entitlement: s.entitlement ? { ...s.entitlement, text: { ...s.entitlement.text, used, remaining: Math.max(0, (s.entitlement.text?.limit ?? 0) - used) } } : s.entitlement }))}
        onChanged={() => refresh().catch(() => {})} onConsent={() => refresh().catch(() => {})} mobile={mobile} />
    );
  else body = <StartPanel status={status} onStart={start} onChanged={() => refresh().catch(() => {})} realtime={server.realtime} neural={server.neural} />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "260px minmax(0,1fr)", gap: 20, alignItems: "stretch" }}>
      {!mobile && side}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        {mobile && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Button size="sm" icon="plus" variant="secondary" onClick={() => (setSession(null), setView("start"))}>Nova sessão</Button>
            <Button size="sm" variant="ghost" icon="chart-no-axes-combined" onClick={() => setView("report")}>Relatório</Button>
            <TutorQuota status={status} realtime={server.realtime} compact />
          </div>
        )}
        {error && <Banner tone="danger">{error}</Banner>}
        {body}
      </div>
    </div>
  );
}

/** Quanto o aluno ainda pode usar hoje (e no teste). Os números vêm do servidor; aqui só se mostram. */
export function TutorQuota({ status, realtime, compact = false }) {
  const e = status.entitlement;
  if (!e) return <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{status.used_today} de {status.daily_limit} interações hoje</span>;
  const trial = e.mode === "trial";
  const head = trial
    ? e.trial.state === "active" ? `Teste grátis · Dia ${e.trial.day} de ${e.trial.days}` : `Teste grátis de ${e.trial.days} dias: começa no primeiro uso`
    : e.staff ? "Acesso da equipe" : e.is_paid ? "Plano ativo" : "Acesso liberado";
  const text = `Texto ${e.text.used}/${e.text.limit} interações hoje`;
  const voice = realtime && e.voice?.enabled
    ? `Voz ${minutes(e.voice.remaining_today_s)} min disponíveis hoje${e.voice.remaining_total_s != null ? ` · ${minutes(e.voice.remaining_total_s)} min restantes no teste` : ""}`
    : null;
  const qs = e.questions?.limit != null ? `Questões ${e.questions.used}/${e.questions.limit} hoje` : null;
  if (compact) return <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{head} · {text}</span>;
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "var(--surface-subtle)", font: "var(--type-caption)", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 3 }} aria-label="Uso do Tutor">
      <b style={{ color: "var(--text-primary)" }}>{head}</b>
      <span>{text}</span>
      {voice && <span>{voice}</span>}
      {qs && <span>{qs}</span>}
      {e.text.remaining > 0 && e.text.remaining <= 3 && <span style={{ color: "var(--text-warning, var(--text-secondary))" }}>Restam {e.text.remaining} interações de texto hoje.</span>}
      {status.reviews_due > 0 && <span>{status.reviews_due} revisão(ões) na hora</span>}
    </div>
  );
}

// ---------------------------------------------------------------- professor
/** Três professores. Trocar salva na hora; só muda o jeito de ensinar, nunca o conteúdo. */
function PersonaPicker({ status, onChanged }) {
  const { backend } = useSession();
  const [current, setCurrent] = React.useState(status.preferences.personality_id);
  const [error, setError] = React.useState(null);
  const pick = async (id) => {
    if (id === current) return;
    const before = current;
    setCurrent(id);
    setError(null);
    try {
      await backend.rpc("app_tutor_save_preferences", { p_prefs: { personality_id: id } });
      onChanged?.();
    } catch (e) {
      setCurrent(before);
      setError(messageOf(e));
    }
  };
  return (
    <div>
      <div role="radiogroup" aria-label="Professor" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        {status.personalities.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={p.id === current} onClick={() => pick(p.id)}
            style={{ all: "unset", cursor: "pointer", boxSizing: "border-box", padding: 12, borderRadius: 14, border: `2px solid var(${p.id === current ? "--border-brand" : "--border-subtle"})`, background: p.id === current ? "var(--surface-brand-subtle, var(--surface-subtle))" : "transparent" }}>
            <div style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">{p.emoji}</div>
            <div style={{ font: "600 14px var(--font-sans)", marginTop: 6 }}>{p.name}</div>
            <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{p.tagline}</div>
          </button>
        ))}
      </div>
      {error && <div style={{ marginTop: 8 }}><Banner tone="danger">{error}</Banner></div>}
    </div>
  );
}


function VoicePicker({ voice, personalityId, neural }) {
  const { backend } = useSession();
  const [voices, setVoices] = React.useState(() => portugueseVoices());
  const [name, setName] = React.useState(() => (neural && neuralChosen() ? NEURAL : chosenVoiceName()));
  const [state, setState] = React.useState({ busy: false, error: null });
  const player = React.useRef(null);
  React.useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) return undefined;
    const refresh = () => setVoices(portugueseVoices());
    refresh();
    synth.addEventListener?.("voiceschanged", refresh);
    return () => synth.removeEventListener?.("voiceschanged", refresh);
  }, []);
  React.useEffect(() => {
    if (neural && neuralChosen()) setName(NEURAL);
  }, [neural]);
  React.useEffect(() => () => player.current?.pause?.(), []);
  if (voices.length === 0 && !neural) return null;
  const pick = (value) => {
    setName(value);
    setState({ busy: false, error: null });
    if (value === NEURAL) chooseNeural(true);
    else {
      chooseNeural(false);
      chooseVoice(value);
    }
  };
  const listen = async () => {
    window.speechSynthesis?.cancel();
    player.current?.pause?.();
    if (name === NEURAL) {
      setState({ busy: true, error: null });
      try {
        const blob = await tutorSpeech(backend, { kind: "phrase", phrase: "sample", personality_id: personalityId });
        player.current = new Audio(URL.createObjectURL(blob));
        await player.current.play();
        setState({ busy: false, error: null });
      } catch (e) {
        setState({ busy: false, error: messageOf(e) });
      }
      return;
    }
    const u = new SpeechSynthesisUtterance("Oi. É assim que eu vou falar com você. Se ficar estranho, escolhe outra voz.");
    const v = voices.find((x) => x.name === name) ?? voices[0];
    u.voice = v;
    u.lang = v.lang;
    u.rate = Number(voice?.rate) || 1;
    u.pitch = Number(voice?.pitch) || 1;
    window.speechSynthesis.speak(u);
  };
  const options = [
    ...(neural ? [{ value: NEURAL, label: "Voz natural do professor (recomendada)" }] : []),
    ...(voices.length ? [{ value: "", label: `A mais natural do aparelho (${voices[0].name})` }, ...voices.map((v) => ({ value: v.name, label: v.name }))] : []),
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220, maxWidth: 420 }}>
          <SelectField
            label="Voz do professor"
            hint={neural ? "A voz natural é gerada no servidor, com o jeito de cada professor. As do aparelho são a reserva." : "As vozes vêm do seu aparelho e do navegador. As marcadas como natural, neural ou aprimorada soam menos robóticas."}
            value={name}
            onChange={(e) => pick(e.target.value)}
            options={options}
          />
        </div>
        <Button size="sm" variant="secondary" icon="volume-2" loading={state.busy} disabled={name === NEURAL && !personalityId} onClick={listen}>Ouvir</Button>
      </div>
      {state.error && <span style={{ font: "var(--type-caption)", color: "var(--text-danger)" }}>{state.error}</span>}
    </div>
  );
}
const NEURAL = "__voz_natural__";

// ---------------------------------------------------------------- começar
function StartPanel({ status, onStart, onChanged, realtime, neural }) {
  const [mode, setMode] = React.useState("questao");
  const [area, setArea] = React.useState("");
  const [focus, setFocus] = React.useState("weak"); // Me teste: weak | topic | area
  const [topic, setTopic] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const chosen = status.personalities.find((p) => p.id === status.preferences.personality_id);
  const ready = mode !== "perguntas" || focus === "weak" || (focus === "topic" ? topic.trim().length >= 3 : Boolean(area));
  const go = async (voice = false) => {
    if (voice) unlockAudio(); // gesto do aluno: Safari libera o áudio da voz agora
    setBusy(voice ? "voice" : "text");
    let request;
    if (mode === "questao" || mode === "erros") request = { mode, context: area ? { type: "area", area } : null };
    else if (mode === "perguntas")
      request = focus === "weak" ? { mode, context: { type: "weak_points" } }
        : focus === "topic" ? { mode, topic: topic.trim(), context: { type: "theme", label: topic.trim() } }
        : { mode, context: { type: "area", area, label: AREA_OPTIONS.find((a) => a.value === area)?.label } };
    else request = { mode, context: { type: "free" }, firstMessage: question.trim() || null };
    await onStart({ ...request, voice });
    setBusy(false);
  };
  return (
    <Card style={R} padding={28}>
      <h3 style={{ margin: 0, font: "600 20px var(--font-sans)" }}>Nexus</h3>
      <p style={{ margin: "4px 0 16px", color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>Seu professor particular para o Revalida.</p>
      <div className="sm-overline" style={{ marginBottom: 8 }}>Professor</div>
      <PersonaPicker status={status} onChanged={onChanged} />
      {status.voice_enabled && !realtime && <div style={{ marginTop: 12 }}><VoicePicker voice={chosen?.voice} personalityId={chosen?.id} neural={neural} /></div>}

      <h4 style={{ margin: "24px 0 10px", font: "600 16px var(--font-sans)" }}>O que vamos estudar agora?</h4>
      <div role="radiogroup" aria-label="Modo de estudo" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 10 }}>
        {MODES.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={x.id === mode} onClick={() => setMode(x.id)}
            style={{ all: "unset", cursor: "pointer", boxSizing: "border-box", padding: 14, borderRadius: 14, display: "flex", gap: 10, alignItems: "flex-start", border: `2px solid var(${x.id === mode ? "--border-brand" : "--border-subtle"})`, background: x.id === mode ? "var(--surface-brand-subtle, var(--surface-subtle))" : "transparent" }}>
            <Icon name={x.icon} size={18} />
            <span>
              <span style={{ display: "block", font: "600 14px var(--font-sans)", textTransform: "uppercase", letterSpacing: ".02em" }}>
                {x.label}
                {x.id === "erros" && status.reviews_due > 0 ? ` (${status.reviews_due})` : ""}
              </span>
              <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{x.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 14, maxWidth: 520, display: "flex", flexDirection: "column", gap: 10 }}>
        {(mode === "questao" || mode === "erros") && <SelectField label="Área (opcional)" value={area} onChange={(e) => setArea(e.target.value)} options={AREA_OPTIONS} />}
        {mode === "perguntas" && (
          <>
            <div role="radiogroup" aria-label="Sobre o quê" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Chip selected={focus === "weak"} onClick={() => setFocus("weak")}>Meus pontos fracos</Chip>
              <Chip selected={focus === "topic"} onClick={() => setFocus("topic")}>Um tema</Chip>
              <Chip selected={focus === "area"} onClick={() => setFocus("area")}>Uma área</Chip>
            </div>
            {focus === "topic" && <TextField label="Tema" placeholder="ex.: pré-eclâmpsia, sepse, calendário vacinal" value={topic} maxLength={120} onChange={(e) => setTopic(e.target.value)} />}
            {focus === "area" && <SelectField label="Área" value={area} onChange={(e) => setArea(e.target.value)} options={AREA_OPTIONS.filter((a) => a.value)} />}
          </>
        )}
        {mode === "livre" && <TextField label="Sua pergunta (opcional)" placeholder="ex.: Explique pré-eclâmpsia. Qual a diferença entre…?" value={question} maxLength={2000} onChange={(e) => setQuestion(e.target.value)} />}
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button iconRight="arrow-right" loading={busy === "text"} disabled={!ready || Boolean(busy)} onClick={() => go(false)}>Começar</Button>
        {realtime && status.voice_enabled && (
          <Button variant="secondary" icon="audio-lines" loading={busy === "voice"} disabled={!ready || Boolean(busy)} onClick={() => go(true)}>Conversar com o Tutor</Button>
        )}
      </div>
      {realtime && status.voice_enabled && status.entitlement?.voice?.enabled && (
        <p style={{ margin: "8px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Tutor por voz: {voiceQuotaText(status.entitlement)}.</p>
      )}
      <p style={{ margin: "14px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
        O professor muda o jeito de ensinar; o conteúdo, o gabarito e as fontes são sempre os mesmos. Valores, doses e diretrizes só com base conferida.
      </p>
    </Card>
  );
}


// ---------------------------------------------------------------- conversa
export function Chat({ session, setSession, status, neural, realtime = false, live: liveVoice = false, voiceHint = null, onUsage, onChanged, onConsent, mobile, compact = false }) {
  const { backend } = useSession();
  const [messages, setMessages] = React.useState(session.messages);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [voiceOn, setVoiceOn] = React.useState(false); // conversa por voz: o professor fala e volta a ouvir sozinho
  const [voiceNote, setVoiceNote] = React.useState(null); // aviso curto do modo voz (não é fala do professor)
  const [picked, setPickedState] = React.useState(null); // alternativa escolhida, por clique ou por voz
  const [gate, setGate] = React.useState(session.gate ?? null); // "explain": o professor quer o raciocínio antes da próxima questão
  // para o motor de personalidade: quanto tempo levou e qual foi a primeira alternativa marcada (troca de certa para errada)
  const shownAt = React.useRef(Date.now());
  const firstPick = React.useRef(null);
  const setPicked = (id) => {
    if (id && !firstPick.current) firstPick.current = id;
    setPickedState(id);
  };
  const [confidence, setConfidence] = React.useState(null);
  const interrupted = React.useRef(null);
  const endRef = React.useRef(null);
  const support = React.useMemo(voiceSupport, []);
  const voiceAllowed = status.voice_enabled && (realtime || support.speak || support.listen || neural);
  const [closing, setClosing] = React.useState(false);
  // voz em tempo real (tela cheia): a fala dos dois lados aparece como mensagem (transcrição); o servidor grava e confere
  const [voiceMode, setVoiceMode] = React.useState(false);
  const [voiceAvatar, setVoiceAvatar] = React.useState(null); // emoção calculada pelo servidor, para a esfera
  const textInput = React.useRef(null);
  const rt = useRealtimeVoice({
    backend,
    sessionId: session.id,
    live: liveVoice,
    hint: voiceHint,
    onTranscript: (role, said) => setMessages((m) => [...m, { id: `rt-${Date.now()}-${m.length}`, role, content: said, grounding: role === "tutor" ? "general" : null, voice: true }]),
    onWarning: (w) => setVoiceNote(w),
    onAvatar: setVoiceAvatar,
  });
  // o servidor recusou a voz por falta do aceite do Tutor (ex.: aceite retirado no meio da sessão): volta ao cartão
  React.useEffect(() => {
    if (rt.error?.code === "tutor_consent") onConsent?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt.error]);
  // a voz chama de volta fora do ciclo de desenho: estas referências sempre apontam para o estado e as ações mais recentes
  const live = React.useRef({});
  const actions = React.useRef({});

  const voice = useVoice({
    onUtterance: (said) => actions.current.heard?.(said),
    onSilence: () => live.current.voiceOn && setVoiceNote("Não ouvi nada. Toque no microfone quando quiser falar."),
  });

  React.useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, voice.interim]);
  React.useEffect(() => {
    setPickedState(null);
    setConfidence(null);
    firstPick.current = null;
    shownAt.current = Date.now();
  }, [session.question?.id]);
  // "Perguntar ao Tutor" com a pergunta já escrita na tela inicial: vai sozinha
  const firstSent = React.useRef(false);
  React.useEffect(() => {
    if (session.firstMessage && !firstSent.current) {
      firstSent.current = true;
      send({ action: "message", text: session.firstMessage });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listenAgain = () => live.current.voiceOn && support.listen && voice.listen();
  /** Voz natural: busca no servidor o áudio de um texto que ele já validou (nunca texto livre). Sem ela, a voz é a do aparelho. */
  const wantsNeural = () => Boolean(live.current.neural) && neuralChosen();
  const neuralLoad = (body) => (body && wantsNeural() ? () => tutorSpeech(backend, body).catch((e) => {
    if (e?.code === "tutor_consent") onConsent?.();
    throw e;
  }) : null);
  const canSpeak = () => support.speak || wantsNeural();

  /** Fala algo do aplicativo (aviso ou leitura da questão), que não é resposta do professor, e volta a ouvir. */
  const say = (textToSay, note = textToSay, body = null, thenListen = true) => {
    setVoiceNote(note);
    if (!canSpeak()) {
      if (thenListen) listenAgain();
      return Promise.resolve(false);
    }
    return voice.speak(textToSay, live.current.session.personality.voice, "system", neuralLoad(body)).then((finished) => {
      if (finished && thenListen) listenAgain();
      return finished;
    });
  };
  /** Lê a questão (antes, a fala de abertura do professor, quando há). Com a voz natural, são dois áudios em sequência. */
  const readQuestion = (s = live.current.session, lead = null) => {
    if (!s.question) return listenAgain();
    const note = "Lendo a questão. Toque em Interromper para pular.";
    const text = questionSpeech(s.question, splitStatement(s.question.statement));
    if (!wantsNeural()) return say(`${lead?.content ?? ""} ${text}`.trim(), note);
    const first = lead && typeof lead.id === "number" ? say(lead.content, note, { kind: "message", session_id: s.id, message_id: lead.id }, false) : Promise.resolve(true);
    return first.then((ok) => ok && say(text, note, { kind: "question", session_id: s.id }));
  };

  const reload = async () => {
    const fresh = await backend.rpc("app_tutor_session", { p_session_id: session.id });
    setSession(fresh);
    return fresh;
  };

  const send = async ({ action, text: said, byVoice = false }) => {
    if (live.current.sending) return;
    const spoken = byVoice || live.current.voiceOn;
    setError(null);
    setVoiceNote(null);
    setSending(true);
    live.current.sending = true;
    const mine = action === "message" ? said : action === "hint" ? (session.hint_level === 0 ? "Me dá uma ajuda aqui." : "Me ajuda mais um pouco.") : action === "reveal" ? "Me mostra a resolução." : null;
    if (mine) setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "student", content: mine }]);
    try {
      const r = await tutorTurn(backend, { session_id: session.id, action, text: said, voice: spoken, interrupted: interrupted.current });
      interrupted.current = null;
      setMessages((m) => [...m, r.message]);
      if ("gate" in r) setGate(r.gate ?? null);
      onUsage(r.used_today);
      if (action === "hint" || action === "reveal" || r.question_state !== session.question_state) await reload();
      if (spoken && canSpeak()) {
        // a fala não segura a conversa: o aluno pode interromper e mandar outra mensagem
        voice.speak(r.message.spoken, session.personality.voice, "reply", neuralLoad({ kind: "message", session_id: session.id, message_id: r.message.id })).then((finished) => {
          if (finished && (byVoice || live.current.voiceOn) && support.listen) voice.listen(); // conversa por voz: volta a ouvir quando termina de falar
        });
      } else if (spoken) listenAgain();
    } catch (e) {
      if (mine) setMessages((m) => m.slice(0, -1));
      if (e?.code === "tutor_consent" && onConsent) onConsent(); // falta o aceite: a tela relê o status e mostra o cartão
      else setError(messageOf(e));
    } finally {
      setSending(false);
      live.current.sending = false;
    }
  };

  const submit = (event) => {
    event.preventDefault();
    const said = text.trim();
    if (!said) return;
    setText("");
    send({ action: "message", text: said });
  };

  /** Microfone: se o professor está falando, interrompe (e guarda o ponto); depois ouve o aluno. */
  const mic = () => {
    if (wantsNeural()) voice.unlock();
    if (voice.listening) return voice.stopListening();
    if (voice.speaking) interrupted.current = voice.interrupt();
    setVoiceOn(true);
    live.current.voiceOn = true;
    setVoiceNote(null);
    voice.listen();
  };

  /** Abre a tela cheia de voz e a ligação (no próprio toque do aluno: o Safari só libera o áudio assim). */
  const openVoiceMode = () => {
    unlockAudio();
    setVoiceNote(null);
    setVoiceMode(true);
    rt.start();
  };
  /** Fecha a tela de voz: encerra a ligação; numa conversa que nasceu por voz, encerra a sessão (resumo e estado salvos). */
  const closeVoiceMode = async () => {
    setVoiceMode(false);
    if (rt.active) await rt.stop();
    if (session.voiceFirst && session.status === "active" && messages.some((m) => m.voice)) await closeSession();
  };
  /** Voz falhou: segue a mesma conversa por texto. */
  const textFallback = async () => {
    setVoiceMode(false);
    if (rt.active) await rt.stop();
    setTimeout(() => textInput.current?.focus?.(), 0);
  };
  // conversa aberta por "Conversar com o Tutor": já entra no modo de voz
  const autoVoice = React.useRef(false);
  React.useEffect(() => {
    if (session.voiceFirst && realtime && !autoVoice.current && session.status === "active") {
      autoVoice.current = true;
      openVoiceMode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtime]);

  /** Liga ou desliga a conversa por voz. Em tempo real, abre a tela cheia; no modo antigo, o professor lê a questão e depois ouve. */
  const toggleVoice = () => {
    if (realtime) {
      if (rt.active || voiceMode) closeVoiceMode();
      else openVoiceMode();
      return;
    }
    if (voiceOn) {
      setVoiceOn(false);
      live.current.voiceOn = false;
      voice.interrupt();
      voice.stopListening();
      setVoiceNote(null);
      return;
    }
    if (wantsNeural()) voice.unlock();
    setVoiceOn(true);
    live.current.voiceOn = true;
    if (session.question_state === "open") readQuestion(session);
    else {
      setVoiceNote(null);
      voice.listen();
    }
  };

  const answer = async (option, conf) => {
    setError(null);
    setVoiceNote(null);
    setSending(true);
    live.current.sending = true;
    try {
      await backend.rpc("app_tutor_answer", {
        p_session_id: session.id, p_option: option, p_confidence: conf,
        p_response_ms: Math.max(0, Date.now() - shownAt.current), p_first_pick: firstPick.current && firstPick.current !== option ? firstPick.current : null,
      });
      const fresh = await reload();
      setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "student", content: `Marquei a ${option}.` }]);
      setSending(false);
      live.current.sending = false;
      if (fresh.question_state === "answered") await send({ action: "react" });
    } catch (e) {
      setError(messageOf(e));
      setSending(false);
      live.current.sending = false;
    }
  };

  const nextQuestion = async () => {
    setError(null);
    try {
      const fresh = await backend.rpc("app_tutor_next_question", { p_session_id: session.id });
      setSession(fresh);
      setMessages(fresh.messages);
      if (live.current.voiceOn) readQuestion(fresh, fresh.messages[fresh.messages.length - 1] ?? null);
    } catch (e) {
      setError(messageOf(e));
      listenAgain();
    }
  };

  /** O que o aluno falou: comando (marcar, confirmar, ajuda, próxima, repetir, parar) ou fala para o professor. */
  const heard = (said) => {
    const s = live.current.session;
    const cmd = parseVoiceCommand(said, {
      questionOpen: s.question_state === "open",
      picked: live.current.picked,
      canNext: ["questao", "erros"].includes(s.mode) && s.question_state !== "open" && s.status === "active",
    });
    switch (cmd.type) {
      case "pause":
        return setVoiceNote("Tô te esperando. Toque no microfone quando quiser falar.");
      case "answer":
        setPicked(cmd.option);
        return say(`Marquei a ${cmd.option}. Diga confirmo para responder, ou fale outra alternativa.`, `Marquei a ${cmd.option}. Diga “confirmo” para responder, ou fale outra alternativa.`, { kind: "phrase", phrase: "marked", letter: cmd.option, personality_id: s.personality.id });
      case "confirm":
        return answer(live.current.picked, live.current.confidence);
      case "cancel":
        setPicked(null);
        return say("Desmarquei. Qual você escolhe?", undefined, { kind: "phrase", phrase: "unmarked", personality_id: s.personality.id });
      case "hint":
        return send({ action: "hint", byVoice: true });
      case "next":
        return nextQuestion();
      case "repeat":
        return readQuestion();
      case "message":
        return send({ action: "message", text: cmd.text, byVoice: true });
      default:
        return listenAgain();
    }
  };

  live.current = { ...live.current, session, voiceOn, picked, confidence, sending, neural };
  actions.current = { heard };

  const last = messages[messages.length - 1];
  const suggestions = last?.role === "tutor" ? (last.suggested ?? []) : [];
  const limitReached = status.entitlement ? !status.entitlement.can_text : status.used_today >= status.daily_limit;
  const closed = session.status !== "active";
  const closeSession = async () => {
    setClosing(true);
    try {
      if (rt.active) await rt.stop();
      if (voiceOn) toggleVoice();
      await backend.rpc("app_tutor_close", { p_session_id: session.id });
      await reload();
      onChanged?.();
    } catch (e) {
      setError(messageOf(e));
    }
    setClosing(false);
  };
  const micProblem = micErrorMessage(voice.error);
  const voiceState = voice.listening ? "listening" : voice.speaking ? "speaking" : sending ? "thinking" : "idle";

  return (
    <Card style={{ ...R, display: "flex", flexDirection: "column", minHeight: mobile ? 520 : 600 }} padding={0}>
      <div style={{ padding: mobile ? "12px 18px" : "14px 28px", borderBottom: "1px solid var(--border-subtle)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 20 }} aria-hidden="true">{session.personality.emoji}</span>
        <strong style={{ font: "600 15px var(--font-sans)" }}>{session.personality.name}</strong>
        <Badge size="sm" tone="brand">{modeLabel(session.mode)}</Badge>
        {!compact && <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{session.title}</span>}
        <span style={{ flex: 1 }} />
        {voiceAllowed && !closed && (
          <Button size="sm" variant={voiceOn || rt.active ? "primary" : "secondary"} icon={voiceOn || rt.active ? "phone-off" : "audio-lines"} onClick={toggleVoice} disabled={!realtime && limitReached}>
            {voiceOn || rt.active ? "Encerrar voz" : "Conversar por voz"}
          </Button>
        )}
        {!closed && <Button size="sm" variant="ghost" icon="square" loading={closing} onClick={closeSession}>Encerrar sessão</Button>}
      </div>

      <div style={{ flex: 1, padding: mobile ? 18 : 28, display: "flex", flexDirection: "column", gap: 14 }} aria-live="polite">
        {session.question && (
          <QuestionCard session={session} busy={sending} picked={picked} onPick={setPicked} confidence={confidence} onConfidence={setConfidence} onAnswer={answer} onHint={() => send({ action: "hint" })} onReveal={() => send({ action: "reveal" })} onNext={nextQuestion} limitReached={limitReached} gate={gate} />
        )}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {sending && <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", paddingLeft: 42 }}>O professor está pensando…</div>}
        {voice.listening && <div style={{ alignSelf: "flex-end", font: "var(--type-body-sm)", color: "var(--text-secondary)", fontStyle: "italic" }}>{voice.interim || "Ouvindo…"}</div>}
        <div ref={endRef} />
      </div>

      <div style={{ padding: mobile ? 14 : 20, borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 10 }}>
        {error && <Banner tone="danger">{error}</Banner>}
        {micProblem && <Banner tone="warning">{micProblem}</Banner>}
        {limitReached && <Banner tone="warning">Você chegou ao limite de {status.entitlement?.text?.limit ?? status.daily_limit} interações de texto de hoje{status.entitlement?.mode === "trial" ? " no teste grátis" : ""}. O acesso é renovado amanhã.</Banner>}
        {closed && session.summary && <SummaryCard summary={session.summary} />}
        {closed && <Banner tone="info">Esta sessão foi encerrada. Abra uma nova para continuar.</Banner>}
        {voiceMode && (
          <StaziaVoiceMode rt={rt} persona={session.personality} messages={messages} avatar={voiceAvatar} entitlement={status.entitlement} note={voiceNote} onClose={closeVoiceMode} onTextFallback={textFallback} />
        )}
        {(voiceOn || voice.speaking || voice.listening) && !closed && (
          <div role="status" style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderRadius: 14, background: "var(--surface-subtle)" }}>
            <Icon name={voiceState === "listening" ? "mic" : voiceState === "speaking" ? "volume-2" : "audio-lines"} size={18} />
            <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", flex: 1, minWidth: 0 }}>
              {voiceState === "listening"
                ? `Ouvindo você… ${voice.interim}`
                : voiceState === "speaking"
                  ? (voiceNote ?? "O professor está falando.")
                  : voiceState === "thinking"
                    ? "O professor está pensando…"
                    : (voiceNote ?? "Toque no microfone para falar.")}
            </span>
            {voice.speaking && <Button size="sm" variant="secondary" icon="square" onClick={() => ((interrupted.current = voice.interrupt()), setVoiceNote(null), listenAgain())}>Interromper</Button>}
          </div>
        )}
        {voiceOn && session.question_state === "open" && (
          <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Você pode dizer: “alternativa B”, “confirmo”, “me dá uma ajuda”, “repete a questão”. Ou converse sobre o caso.</span>
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
            <TextField ref={textInput} aria-label="Mensagem" placeholder={voice.listening ? "Ouvindo…" : "Pergunte ao tutor…"} value={text} maxLength={2000} disabled={closed || limitReached} onChange={(e) => setText(e.target.value)} />
          </div>
          {voiceAllowed && !realtime && (
            <IconButton icon={voice.listening ? "mic-off" : "mic"} label={voice.listening ? "Parar de ouvir" : voice.speaking ? "Interromper e falar" : "Falar com o professor"} variant={voice.listening ? "primary" : "secondary"} onClick={mic} disabled={closed || limitReached || sending} />
          )}
          <Button type="submit" icon="arrow-up" aria-label="Enviar" loading={sending} disabled={closed || limitReached || !text.trim()}>
            {mobile ? "" : "Enviar"}
          </Button>
        </form>
      </div>
    </Card>
  );
}

/** Resumo da sessão (feito pelo servidor a partir dos dados, sem IA). */
function SummaryCard({ summary: s }) {
  const list = (x) => (Array.isArray(x) ? x.filter(Boolean) : []);
  return (
    <div style={{ padding: 14, borderRadius: 14, border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 6, font: "var(--type-body-sm)" }}>
      <b>Resumo da sessão</b>
      {s.questions_answered > 0 && <span>{s.correct} de {s.questions_answered} questões certas.</span>}
      {list(s.concepts_mastered).length > 0 && <span>Firmou: {list(s.concepts_mastered).join(", ")}.</span>}
      {list(s.errors_detected).length > 0 && <span>Erros: {[...new Set(list(s.errors_detected).map((e) => ERROR_CLASS[e.error_type] ?? e.error_type))].join(", ")}.</span>}
      {list(s.recurrent_errors).length > 0 && <span>Erros que já se repetiram: {list(s.recurrent_errors).map((e) => ERROR_CLASS[e] ?? e).join(", ")}.</span>}
      {list(s.needs_review).length > 0 && <span>Volta em revisão: {list(s.needs_review).join(", ")}.</span>}
      {list(s.next_recommended_topics).length > 0 && <span>Próximos temas sugeridos: {list(s.next_recommended_topics).join(", ")}.</span>}
    </div>
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
function QuestionCard({ session, busy, picked: selected, onPick: setSelected, confidence, onConfidence: setConfidence, onAnswer, onHint, onReveal, onNext, limitReached, gate }) {
  const q = session.question;
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
            <Button variant="ghost" icon="eye" disabled={busy || limitReached} onClick={onReveal}>Ver resolução</Button>
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
          {["questao", "erros"].includes(session.mode) && session.status === "active" && <Button size="sm" iconRight="arrow-right" disabled={busy || gate === "explain"} onClick={onNext}>Próxima questão</Button>}
          {gate === "explain" && <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>Antes da próxima: explique ao professor o seu raciocínio nesta questão.</span>}
        </div>
      )}
    </div>
  );
}
