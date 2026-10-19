// Treino em Dupla · o navegador já liberou o som? (decisão do dono, 19/10/2026)
// Celular e navegador só deixam tocar som depois de um toque na página. Quem abre a sala por link e não toca em nada ficaria sem
// o apito do início (a porta abre sem som). Esta peça diz se o som está BLOQUEADO, para a espera do candidato mostrar
// "Ativar som do apito", e destrava o áudio no toque desse botão.
// Usa o MESMO contexto de áudio de sound.js (window.__szAudio) e a mesma chave "sz-sound" ("off" = som desligado: o botão não
// aparece, porque o apito não tocaria de qualquer jeito). Fica fora de sound.js de propósito: os testes que simulam sound.js
// continuam valendo sem conhecer estas funções.

import React from "react";

const CHAVE_SOM = "sz-sound"; // a mesma de sound.js

function somLigado() {
  try {
    return localStorage.getItem(CHAVE_SOM) !== "off";
  } catch {
    return true;
  }
}

function classeAudio() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

/**
 * true quando o apito NÃO tocaria por falta de um toque na página: há áudio no aparelho, o som está ligado e o contexto ainda não
 * está rodando (ou nem existe e a página nunca recebeu um toque). Aparelho sem áudio ou som desligado: false (não há o que liberar).
 */
export function audioBloqueado() {
  if (!classeAudio() || !somLigado()) return false;
  const ctx = window.__szAudio;
  if (ctx) return ctx.state !== "running";
  const ativacao = typeof navigator !== "undefined" ? navigator.userActivation : undefined;
  return ativacao ? !ativacao.hasBeenActive : true;
}

/**
 * Destrava o áudio DENTRO do toque (cria ou acorda o contexto e toca uma amostra muda, que o iPhone exige). Devolve se ficou
 * liberado. Sem áudio no aparelho: false, sem erro.
 */
export async function destravarAudio() {
  const AC = classeAudio();
  if (!AC) return false;
  try {
    const ctx = window.__szAudio || (window.__szAudio = new AC({ latencyHint: "interactive" }));
    const amostra = ctx.createBuffer(1, 1, ctx.sampleRate);
    const fonte = ctx.createBufferSource();
    fonte.buffer = amostra;
    fonte.connect(ctx.destination);
    fonte.start(0);
    if (ctx.state === "suspended") await ctx.resume();
    return ctx.state === "running";
  } catch {
    return false;
  }
}

/**
 * [bloqueado, destravar]. Confere de novo a cada toque ou tecla na página (qualquer toque também libera o som, por
 * installAudioWake) e a cada 1 s enquanto `ativo`. Sem áudio no aparelho, nunca bloqueado e sem relógio.
 */
export function useAudioBloqueado(ativo = true) {
  const [bloqueado, setBloqueado] = React.useState(() => ativo && audioBloqueado());
  React.useEffect(() => {
    if (!ativo || !classeAudio()) {
      setBloqueado(false);
      return undefined;
    }
    const conferir = () => setBloqueado(audioBloqueado());
    conferir();
    const depois = () => setTimeout(conferir, 60);
    const eventos = ["pointerdown", "keydown", "touchstart"];
    eventos.forEach((ev) => window.addEventListener(ev, depois, { passive: true }));
    const relogio = setInterval(conferir, 1000);
    return () => {
      eventos.forEach((ev) => window.removeEventListener(ev, depois));
      clearInterval(relogio);
    };
  }, [ativo]);
  const destravar = React.useCallback(async () => {
    await destravarAudio();
    setBloqueado(audioBloqueado());
  }, []);
  return [bloqueado, destravar];
}
