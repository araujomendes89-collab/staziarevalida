// Entrada do Nexus (prévia aprovada pelo dono em 2026-10-08): a esfera, "Escolha seu professor" com os três cartões, o modo
// ("Perguntar ao Tutor" já marcado), "Começar com …", a linha de voz do dia e o aviso da Política. Nada começa sem o toque.
// Com `request` (aberta por outra tela), o modo vem travado e só se escolhe o professor.
// 17/10/2026: a esfera deu lugar ao personagem (Stazi ou Stazia), que o aluno escolhe aqui, junto com o professor.
import React from "react";
import { PersonagemTutor } from "../personagens/PersonagemTutor.jsx";
import { EscolhaPersonagem } from "../personagens/EscolhaPersonagem.jsx";
import { gravarPersonagem, lerPersonagem, personagemPadrao, temPersonagemSalvo } from "../personagens/personagens.js";
import { modeLabel } from "../labels.js";
import { TutorQuota } from "../TutorQuota.jsx";

/** Aviso antes do primeiro uso da voz (Política de 07/10, §3), sempre à vista na entrada. */
export const NEXUS_POLICY_NOTICE =
  "Interações com recursos de IA e voz podem ser processadas para responder, sintetizar áudio e adaptar a experiência. Fornecedores de IA recebem somente o necessário para executar a solicitação.";

/** Modos na ordem da entrada (ids do banco). */
export const NEXUS_MODES = ["livre", "questao", "erros", "perguntas"];

/** "a Durona", "o Tranquilo", "o Direto". */
export const withArticle = (p) => `${p?.id === "durona" ? "a" : "o"} ${p?.name ?? "professor"}`;

export function voiceLine(nexus, personalityId) {
  const prof = nexus?.professors?.find((p) => p.id === personalityId);
  if (nexus?.voice_enabled && prof?.eleven) return { text: `Voz hoje: ${nexus.minutes_today} min`, label: "Voz do professor", minutes: true };
  if (nexus?.voice_enabled && nexus.reserve) return { text: `Voz reserva hoje: ${nexus.reserve_minutes} min`, label: "Voz reserva", minutes: true };
  return { text: "Professor por escrito hoje", label: "Por escrito" };
}

// `duronaSettings`: o "Jeito da Durona" (ExplosivaPreferences) aparece embaixo dos cartões quando a Durona está escolhida. Só é
// passado quando a conversa de voz com o Personality Engine for ligada; até lá a entrada fica exatamente como está.
export function NexusLobby({ status, nexus, request = null, busy = false, error = null, onStart, onHistory, onListen, onClose = null, duronaSettings = null }) {
  const professors = status.personalities ?? [];
  const [choice, setChoice] = React.useState(() => (professors.some((p) => p.id === status.preferences?.personality_id) ? status.preferences.personality_id : professors[0]?.id));
  const [mode, setMode] = React.useState("livre");
  // sem escolha salva, o personagem acompanha o professor (Durona → Stazia) até o aluno tocar num deles
  const [pers, setPers] = React.useState(() => (temPersonagemSalvo() ? lerPersonagem() : null));
  const personagem = pers ?? personagemPadrao(choice);
  const escolherPersonagem = (id) => {
    setPers(id);
    gravarPersonagem(id);
  };
  const chosen = professors.find((p) => p.id === choice);
  const line = voiceLine(nexus, choice);

  return (
    <div className="nx-lobby">
      <div className="nx-top">
        {/* na tela do app o topo já diz "Stazia Tutor"; por cima de outra tela, o título fica aqui */}
        {onClose ? (
          <div className="nx-top__title">
            <span className="nx-top__eyebrow">Seu professor particular para o Revalida</span>
            <span className="nx-top__name">Stazia Tutor</span>
          </div>
        ) : <span />}
        <div className="nx-top__actions">
          <button type="button" className="nx-pill" onClick={onHistory}>Histórico</button>
          {onClose && <button type="button" className="nx-pill" onClick={onClose} aria-label="Fechar o Tutor">Fechar</button>}
        </div>
      </div>

      <div className="nx-lobby__body">
        <div className="nx-lobby__orb" aria-hidden="true">
          <PersonagemTutor key={personagem} personagem={personagem} conversationState="ready" emotion="neutral" emotionIntensity={0.3} decorativo />
        </div>
        <div className="nx-lobby__head">
          <span className="nx-overline">Antes de começar</span>
          <h2 className="nx-lobby__title">Escolha seu professor</h2>
        </div>

        <div className="nx-cards">
          {professors.map((p) => {
            const on = p.id === choice;
            const sample = nexus?.professors?.find((x) => x.id === p.id)?.sample;
            return (
              <div key={p.id} className={`nx-card${on ? " nx-card--on" : ""}`}>
                <button type="button" className="nx-card__pick" aria-pressed={on} onClick={() => setChoice(p.id)}>
                  <span className="nx-card__emoji" aria-hidden="true">{p.emoji}</span>
                  <span className="nx-card__text">
                    <span className="nx-card__name">{p.name}</span>{" "}
                    <span className="nx-card__line">{p.tagline}</span>
                  </span>
                </button>
                {sample && (
                  <button type="button" className="nx-listen" aria-label={`Ouvir a voz ${p.id === "durona" ? "da" : "do"} ${p.name}`} onClick={() => onListen(p.id)}>
                    Ouvir
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <EscolhaPersonagem valor={personagem} onEscolher={escolherPersonagem} />

        {duronaSettings && choice === "durona" ? <div className="nx-lobby__durona">{duronaSettings}</div> : null}

        {request ? (
          <p className="nx-locked"><span className="nx-overline">Modo</span> {modeLabel(request.mode)}{request.context?.label ?? request.topic ? ` · ${request.context?.label ?? request.topic}` : ""}</p>
        ) : (
          <div className="nx-modes" role="group" aria-label="Modo">
            <span className="nx-overline" aria-hidden="true">Modo</span>
            {NEXUS_MODES.map((id) => (
              <button key={id} type="button" className={`nx-chip${id === mode ? " nx-chip--on" : ""}`} aria-pressed={id === mode} onClick={() => setMode(id)}>
                {modeLabel(id)}
              </button>
            ))}
          </div>
        )}

        {error}

        <button type="button" className="nx-start" disabled={busy || !chosen} onClick={() => (gravarPersonagem(personagem), onStart(choice, request?.mode ?? mode))}>
          {busy ? "Abrindo…" : `Começar com ${withArticle(chosen)}`}
        </button>

        <div className="nx-lobby__foot">
          <p className="nx-voice-line">
            <span className={line.minutes ? "nx-voice-line__min" : undefined}>{line.text}</span>
            <span className="nx-voice-line__jeito">{line.label}</span>
          </p>
          <TutorQuota status={status} compact />
          <p className="nx-policy">{NEXUS_POLICY_NOTICE}</p>
        </div>
      </div>
    </div>
  );
}
