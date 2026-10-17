// Relógio e "marcas de troca" dos personagens (comum ao 2D e ao 3D). A cada quadro: lê estado, emoção e nível do áudio, calcula a
// pose (dinamicaPose: com tomada de impulso e permanência mínima) e o quadro (quadro). Quem desenha recebe o quadro e só escreve
// estilos/uniformes: nada de redesenhar o React a cada quadro (o React só redesenha quando a POSE muda). Com `time` controlado
// (captura de vídeo) não há rAF: cada novo `time` pinta um quadro, sempre igual para a mesma entrada (e `desde`, que diz desde
// quando valem o estado e a emoção, vem do roteiro; ao vivo ele vem das marcas deste gancho).
import React from "react";
import { useAudioLevel } from "../voice/useAudioLevel.js";
import { useMovimentoReduzido } from "./useMovimentoReduzido.js";
import { dinamicaPose, quadro, seguidorVoz } from "./movimento.js";

const agora = () => (typeof performance !== "undefined" && performance.now ? performance.now() : 0);
const JANELA_VOZ_MS = 600; // histórico do nível da voz que alimenta o seguidor (ataque rápido, queda lenta, histerese da boca)

/**
 * props da esfera (conversationState, emotion, emotionIntensity, inputStream, outputStream, onFrame) +
 * time (ms, relógio controlado), niveis ({input, output} ou função (ms) → {input, output}: só para prévia/captura),
 * desde ({estado, emocao, estadoAnterior?, emocaoAnterior?}: só com relógio controlado), semente (número: muda o balanço e as piscadas; a mesma semente dá o mesmo movimento), reduzido (força movimento reduzido;
 * padrão: preferência do aparelho), pintar(q, marcas) (quem desenha).
 */
export function usePersonagemAnimacao({ conversationState = "idle", emotion = "neutral", emotionIntensity = 0.3, inputStream = null, outputStream = null, onFrame = null, time = null, niveis = null, desde = null, semente = 1, reduzido: reduzidoProp, pintar }) {
  const prefere = useMovimentoReduzido();
  const reduzido = reduzidoProp ?? prefere;
  const controlado = time != null;
  const t0 = React.useRef(null);
  const marcas = React.useRef({ estado: null, tEstado0: -1e9, estadoAnt: null, emocao: null, tEmocao0: -1e9, emocaoAnt: null, pose: null, anterior: null, tPose0: -1e9, antecipa: 0, hist: { entrada: [], saida: [] } });
  const [poses, setPoses] = React.useState(() => ({ atual: dinamicaPose({ t: 0, estado: conversationState, emocao: emotion, intensidade: emotionIntensity, desde: desde ?? undefined, reduzido }).pose, anterior: null }));
  const vivo = React.useRef({});
  Object.assign(vivo.current, { conversationState, emotion, emotionIntensity, onFrame, time, niveis, desde, semente, reduzido, pintar });
  // relógio controlado + "desde" (roteiro): a pose sai do próprio render, sem memória (quadros fora de ordem dão o mesmo resultado)
  const fixo = controlado && desde ? dinamicaPose({ t: time, estado: conversationState, emocao: emotion, intensidade: emotionIntensity, desde, reduzido }) : null;

  const relogio = React.useCallback(() => {
    const v = vivo.current;
    if (v.time != null) return v.time;
    if (t0.current == null) t0.current = agora();
    return agora() - t0.current;
  }, []);

  const tick = React.useCallback((l) => {
    const v = vivo.current;
    const m = marcas.current;
    const t = relogio();
    if (m.estado !== v.conversationState) {
      m.estadoAnt = m.estado;
      m.estado = v.conversationState;
      m.tEstado0 = m.estadoAnt == null ? -1e9 : t; // o primeiro estado (ao montar) não é "novo"
    }
    if (m.emocao !== v.emotion) {
      m.emocaoAnt = m.emocao;
      m.emocao = v.emotion;
      m.tEmocao0 = m.emocaoAnt == null ? -1e9 : t; // a primeira emoção (ao montar) não conta como reação
    }
    const ds = v.time != null && v.desde ? v.desde : { estado: m.tEstado0, emocao: m.tEmocao0, estadoAnterior: m.estadoAnt ?? undefined, emocaoAnterior: m.emocaoAnt ?? undefined };
    const din = dinamicaPose({ t, estado: v.conversationState, emocao: v.emotion, intensidade: v.emotionIntensity, desde: ds, reduzido: v.reduzido });
    if (din.pose !== m.pose || din.anterior !== m.anterior) {
      m.pose = din.pose;
      m.anterior = din.anterior;
      if (v.time == null) setPoses({ atual: din.pose, anterior: din.anterior });
    }
    m.tPose0 = t - din.tPose;
    m.antecipa = din.antecipa;
    // nível do áudio → seguidor (envelope com ataque rápido e queda lenta, boca com histerese). Simulado (captura): reamostra o passado
    // da função de níveis a cada 24 ms; ao vivo: usa o histórico dos últimos quadros. Os dois caminhos usam o mesmo seguidor.
    let entrada;
    let saida;
    let boca;
    if (v.niveis != null) {
      const f = typeof v.niveis === "function" ? v.niveis : () => v.niveis;
      const hist = (campo) => Array.from({ length: 26 }, (_, i) => { const ms = t - (25 - i) * 24; return { t: ms, v: f(Math.max(0, ms))[campo] ?? 0 }; });
      entrada = seguidorVoz(hist("input"), { ataqueMs: 70, quedaMs: 220 }).env;
      ({ env: saida, boca } = seguidorVoz(hist("output")));
    } else {
      const h = m.hist;
      const empurra = (lista, valor) => {
        lista.push({ t, v: valor });
        while (lista.length > 1 && t - lista[0].t > JANELA_VOZ_MS) lista.shift();
      };
      empurra(h.entrada, l?.input ?? 0);
      empurra(h.saida, l?.output ?? 0);
      entrada = seguidorVoz(h.entrada, { ataqueMs: 70, quedaMs: 220 }).env;
      ({ env: saida, boca } = seguidorVoz(h.saida));
    }
    const q = quadro({ t, tEstado: t - m.tEstado0, tPose: din.tPose, antecipa: din.antecipa, estado: v.conversationState, emocao: v.emotion, intensidade: v.emotionIntensity, entrada, saida, boca, pose: din.pose, semente: v.semente, reduzido: v.reduzido });
    v.pintar?.(q, m);
    v.onFrame?.({ input: l?.input ?? entrada, output: l?.output ?? saida });
  }, [relogio]);

  // ao vivo: o nível do áudio chama o tick a cada quadro (rAF); controlado ou reduzido: sem rAF
  useAudioLevel({ input: inputStream, output: outputStream, enabled: !controlado && !reduzido, onFrame: tick });

  React.useEffect(() => {
    if (controlado || reduzido) tick({ input: 0, output: 0 });
  }, [controlado, reduzido, time, conversationState, emotion, emotionIntensity, niveis, tick]);

  // depois que a nova pose entrou no DOM, pinta de novo (as camadas novas recebem opacidade/transformação)
  React.useEffect(() => {
    if (controlado || reduzido) tick({ input: 0, output: 0 }); // ao vivo, o próximo rAF já pinta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poses]);

  return { poses: fixo ? { atual: fixo.pose, anterior: fixo.anterior } : poses, reduzido };
}
