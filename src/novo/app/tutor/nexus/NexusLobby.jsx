// Entrada do Nexus (prévia aprovada pelo dono em 2026-10-08): o personagem, "Escolha seu professor", o modo
// ("Perguntar ao Tutor" já marcado), "Começar com …", a linha de voz do dia e o aviso da Política. Nada começa sem o toque.
// Com `request` (aberta por outra tela), o modo vem travado e só se escolhe o professor.
// 17/10/2026: a esfera deu lugar ao personagem. O aluno escolhe PRIMEIRO o personagem (Stazi ou Stazia) e depois uma das 2
// personalidades dele (Stazi: Durão e Tranquilo; Stazia: Durona e Tranquila). A voz vem do personagem, não é escolhida à parte.
// O personagem fica no perfil do aluno (vale em qualquer aparelho): a tela abre com o do perfil e, ao tocar num personagem, grava no
// perfil sem travar a tela (`onPersonagem`); se falhar, o toque fica pendente no aparelho, separado por conta (`conta`), e a tela
// tenta de novo na próxima vez, só pela mesma conta. A cópia do aparelho (ou a chave da versão antiga) nunca passa por cima do perfil.
import React from "react";
import { PersonagemTutor } from "../personagens/PersonagemTutor.jsx";
import { EscolhaPersonagem } from "../personagens/EscolhaPersonagem.jsx";
import { PERSONAGENS, PERSONALIDADES, artigoDe, gravarPersonagem, marcarNoPerfil, marcarPendente, personagemDe, personagemInicial, personagemPendente, personagemValido } from "../personagens/personagens.js";
import { modeLabel } from "../labels.js";
import { TutorQuota } from "../TutorQuota.jsx";

/** Aviso antes do primeiro uso da voz (Política de 07/10, §3), sempre à vista na entrada. */
export const NEXUS_POLICY_NOTICE =
  "Interações com recursos de IA e voz podem ser processadas para responder, sintetizar áudio e adaptar a experiência. Fornecedores de IA recebem somente o necessário para executar a solicitação.";

/** Quanto a escolha fica parada antes de a entrada pedir a abertura preparada (toques seguidos não pedem nada). */
export const PREPARE_DELAY_MS = 600;

/** Modos na ordem da entrada (ids do banco). */
export const NEXUS_MODES = ["livre", "questao", "erros", "perguntas"];

/** "o Durão", "a Durona", "o Tranquilo", "a Tranquila": o artigo concorda com a personalidade. */
export const withArticle = (p) => `${p ? artigoDe(p) : "o"} ${p?.name ?? "professor"}`;

export function voiceLine(nexus, personalityId) {
  const prof = nexus?.professors?.find((p) => p.id === personalityId);
  if (nexus?.voice_enabled && prof?.eleven) return { text: `Voz hoje: ${nexus.minutes_today} min`, label: "Voz do professor", minutes: true };
  if (nexus?.voice_enabled && nexus.reserve) return { text: `Voz reserva hoje: ${nexus.reserve_minutes} min`, label: "Voz reserva", minutes: true };
  return { text: "Professor por escrito hoje", label: "Por escrito" };
}

// `duronaSettings`: o "Jeito do Durão" / "Jeito da Durona" (ExplosivaPreferences) aparece embaixo dos cartões quando o Durão ou a Durona
// está escolhido. Pode ser um elemento ou uma função que recebe a personalidade escolhida. Só é passado quando a conversa de voz com o
// Personality Engine for ligada; até lá a entrada fica exatamente como está.
const DURAS = new Set(Object.values(PERSONALIDADES).filter((p) => p.duro).map((p) => p.id));

// `onPersonagem(id)`: grava o personagem no perfil (app_tutor_set_character) e devolve as preferências; sem ele, fica só no aparelho.
// `conta`: o id da conta logada; o toque que o perfil ainda não confirmou fica guardado só para ela (sem conta, nada fica pendente).
// `onPrepare(personalityId, mode)`: a entrada avisa a escolha atual (depois de um instante parada) para o servidor já preparar a abertura.
export function NexusLobby({ status, nexus, request = null, busy = false, error = null, onStart, onHistory, onListen, onClose = null, duronaSettings = null, onPersonagem = null, conta = null, onPrepare = null }) {
  const professors = status.personalities ?? [];
  // o perfil pode trocar a personalidade preferida quando o aluno troca de personagem (vai para a calma do personagem novo)
  const [prefPerfil, setPrefPerfil] = React.useState(null);
  const prefBase = prefPerfil ?? status.preferences?.personality_id;
  const prefId = professors.some((p) => p.id === prefBase) ? prefBase : null;
  const doPerfil = personagemValido(status.preferences?.character);
  // perfil > aparelho; sem nenhum dos dois, abre no personagem do professor que o aluno já usava (ou no Stazi)
  const [pers, setPers] = React.useState(() => personagemInicial(conta, doPerfil));
  const envio = React.useRef(0);
  const salvarNoPerfil = React.useCallback((id) => {
    if (!onPersonagem) return;
    const n = ++envio.current;
    // sem travar a tela: falhou, o toque fica pendente para esta conta e vai de novo na próxima vez que a entrada abrir
    marcarPendente(conta, id);
    Promise.resolve()
      .then(() => onPersonagem(id))
      .then((r) => {
        if (n !== envio.current) return; // o aluno já tocou em outro: vale o último toque
        marcarNoPerfil(conta, id);
        if (r?.personality_id) setPrefPerfil(r.personality_id);
      })
      .catch(() => {});
  }, [onPersonagem, conta]);
  React.useEffect(() => {
    const pendente = personagemPendente(conta);
    // o toque pendente desta conta que o perfil já tem (a conversa começou com ele, por exemplo) só deixa de ser pendente
    if (pendente && pendente !== doPerfil) salvarNoPerfil(pendente);
    else if (doPerfil) marcarNoPerfil(conta, doPerfil); // cópia no aparelho, para a próxima abrir sem piscar
    // só ao abrir a entrada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const personagem = pers ?? personagemDe(professors.find((p) => p.id === prefId)) ?? personagemDe(professors[0]) ?? "stazi";
  // as 2 personalidades do personagem escolhido (sem a ligação entre personalidade e personagem, como numa lista antiga, mostra todas)
  const doPersonagem = professors.filter((p) => personagemDe(p) === personagem);
  const cards = doPersonagem.length ? doPersonagem : professors;
  // a calma (Tranquilo/Tranquila) é a que abre quando o aluno troca de personagem: a firme com palavrão fica por escolha dele
  const calma = cards.find((p) => !DURAS.has(p.id)) ?? cards[0];
  const [escolhida, setEscolhida] = React.useState(prefId);
  const choice = cards.some((p) => p.id === escolhida) ? escolhida : cards.some((p) => p.id === prefId) ? prefId : calma?.id;
  const [mode, setMode] = React.useState("livre");
  const escolherPersonagem = (id) => {
    setPers(id);
    gravarPersonagem(id);
    setEscolhida(null);
    salvarNoPerfil(id);
  };
  const chosen = professors.find((p) => p.id === choice);
  // abertura preparada (17/10): a escolha que ficou parada por um instante vai para o servidor preparar a abertura dela (toques
  // seguidos não pedem nada; o servidor ainda limita por aluno e não prepara duas vezes a mesma escolha)
  const modoAtual = request?.mode ?? mode;
  const prepareRef = React.useRef(onPrepare);
  prepareRef.current = onPrepare;
  React.useEffect(() => {
    if (!chosen || busy || !prepareRef.current) return undefined;
    const t = setTimeout(() => prepareRef.current?.(chosen.id, modoAtual), PREPARE_DELAY_MS);
    return () => clearTimeout(t);
  }, [chosen?.id, modoAtual, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = voiceLine(nexus, choice);
  const quem = PERSONAGENS[personagem];
  // uma voz por personagem: o "Ouvir" toca a voz do Stazi ou da Stazia (a amostra vale para as duas personalidades dele)
  const amostra = cards.find((p) => nexus?.professors?.find((x) => x.id === p.id)?.sample);

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

        <EscolhaPersonagem valor={personagem} onEscolher={escolherPersonagem} />

        <div className="nx-lobby__jeitos" role="group" aria-labelledby="nx-jeitos-titulo">
          <span id="nx-jeitos-titulo" className="nx-overline">Como {quem.genero === "a" ? "a" : "o"} {quem.nome} vai ser com você</span>
          <div className="nx-cards">
            {cards.map((p) => {
              const on = p.id === choice;
              return (
                <div key={p.id} className={`nx-card${on ? " nx-card--on" : ""}`}>
                  <button type="button" className="nx-card__pick" aria-pressed={on} onClick={() => setEscolhida(p.id)}>
                    <span className="nx-card__emoji" aria-hidden="true">{p.emoji}</span>
                    <span className="nx-card__text">
                      <span className="nx-card__name">{p.name}</span>{" "}
                      <span className="nx-card__line">{p.tagline}</span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          {amostra && (
            <button type="button" className="nx-listen nx-listen--voz" aria-label={`Ouvir a voz ${quem.genero === "a" ? "da" : "do"} ${quem.nome}`} onClick={() => onListen(amostra.id)}>
              Ouvir a voz {quem.genero === "a" ? "da" : "do"} {quem.nome}
            </button>
          )}
        </div>

        {duronaSettings && DURAS.has(choice) ? <div className="nx-lobby__durona">{typeof duronaSettings === "function" ? duronaSettings(chosen) : duronaSettings}</div> : null}

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
