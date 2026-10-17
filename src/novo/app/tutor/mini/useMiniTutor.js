// Mini Tutor: a conversa curta por texto ligada ao contexto da tela. Usa SÓ o que o Tutor já tem:
//  - app_tutor_status (direito, aceite, personalidade e personagem do perfil, saldo do dia);
//  - app_tutor_start (a conversa nasce no primeiro envio, nunca ao abrir a janelinha) e app_tutor_close;
//  - POST /api/tutor/turn (cada mensagem ou pista gasta 1 interação do Tutor por texto, a mesma cota de hoje: ai_usage/tutor_entitlement;
//    a resposta devolve used_today e daily_limit; limite estourado = 429).
// Mudou o contexto (outra questão, respondeu, outro tema), a conversa anterior é encerrada e começa outra quando o aluno escrever.
import React from "react";
import { tutorTurn } from "../api.js";
import { explainError } from "../../../../shared/errors/explicarErro";
import { MINI_TUTOR, TEXTOS } from "./config.js";
import { argumentosDoInicio, boasVindas, bloqueio, chaveDoContexto, faseDaQuestao, textoParaEnviar } from "./contexto.js";

let seq = 0;
const novoId = () => `mt-${Date.now().toString(36)}-${(++seq).toString(36)}`;

/** O saldo de texto do dia pelos números do servidor: { usadas, limite, restam } (limite null = sem número). */
export function saldoDoStatus(status) {
  const t = status?.entitlement?.text;
  if (t && Number.isFinite(t.limit)) return { usadas: t.used ?? 0, limite: t.limit, restam: Math.max(0, t.limit - (t.used ?? 0)) };
  if (status && Number.isFinite(status.daily_limit)) return { usadas: status.used_today ?? 0, limite: status.daily_limit, restam: Math.max(0, status.daily_limit - (status.used_today ?? 0)) };
  return { usadas: 0, limite: null, restam: null };
}

const esgotou = (e) => e?.status === 429 && /limite/i.test(e?.message ?? "");

export function useMiniTutor({ backend, contexto, aberto }) {
  const [status, setStatus] = React.useState(null);
  const [carregando, setCarregando] = React.useState(false);
  const [erroStatus, setErroStatus] = React.useState(null);
  const [mensagens, setMensagens] = React.useState([]);
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState(null);
  const [saldo, setSaldo] = React.useState({ usadas: 0, limite: null, restam: null });
  const [esgotado, setEsgotado] = React.useState(false);
  const [pistas, setPistas] = React.useState(0);
  const [avatar, setAvatar] = React.useState(null);
  const [falando, setFalando] = React.useState(false);
  const conversa = React.useRef(null); // { chave, id, personality }
  const iniciando = React.useRef(null);
  const chave = chaveDoContexto(contexto);
  const chaveRef = React.useRef(chave);
  chaveRef.current = chave;
  const ctxRef = React.useRef(contexto);
  ctxRef.current = contexto;
  const motivo = bloqueio(contexto);

  const lerStatus = React.useCallback(async () => {
    setCarregando(true);
    try {
      const st = await backend.rpc("app_tutor_status");
      setStatus(st);
      setErroStatus(null);
      const s = saldoDoStatus(st);
      setSaldo(s);
      setEsgotado(Boolean(st?.entitlement && st.entitlement.can_text === false && st.entitlement.mode !== "blocked") || (s.limite != null && s.restam <= 0));
      return st;
    } catch (e) {
      setErroStatus(explainError(e));
      return null;
    } finally {
      setCarregando(false);
    }
  }, [backend]);

  // o status só é lido quando o aluno abre a janelinha (fechada, nada vai ao servidor)
  React.useEffect(() => {
    if (aberto && !motivo && !status && !carregando && !erroStatus) void lerStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const encerrar = React.useCallback(() => {
    const c = conversa.current;
    conversa.current = null;
    iniciando.current = null;
    if (c?.id) backend.rpc("app_tutor_close", { p_session_id: c.id }).catch(() => {});
  }, [backend]);

  // contexto novo: conversa nova (a anterior fecha no servidor), começando pela fala de boas-vindas (local, sem gastar saldo)
  React.useEffect(() => {
    encerrar();
    setMensagens(contexto && !motivo ? [{ id: novoId(), role: "tutor", texto: boasVindas(contexto), local: true }] : []);
    setErro(null);
    setPistas(0);
    setAvatar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  // saiu da tela: a conversa aberta fecha
  React.useEffect(() => () => encerrar(), [encerrar]);

  /** A conversa deste contexto (cria no primeiro uso). Personalidade null = a do perfil do aluno. */
  const garantirConversa = React.useCallback(async () => {
    const k = chaveRef.current;
    if (conversa.current?.chave === k) return conversa.current;
    if (iniciando.current?.chave === k) return iniciando.current.promessa;
    const promessa = backend.rpc("app_tutor_start", argumentosDoInicio(ctxRef.current, null)).then((s) => {
      const c = { chave: k, id: s.id, personality: s.personality ?? null };
      if (chaveRef.current === k) conversa.current = c;
      else backend.rpc("app_tutor_close", { p_session_id: s.id }).catch(() => {});
      return c;
    });
    iniciando.current = { chave: k, promessa };
    try {
      return await promessa;
    } finally {
      if (iniciando.current?.promessa === promessa) iniciando.current = null;
    }
  }, [backend]);

  const acrescentar = React.useCallback((m) => setMensagens((l) => [...l, { id: m.id ?? novoId(), ...m }]), []);

  const turno = React.useCallback(
    async (acao, texto = "") => {
      if (enviando || motivo) return false;
      if (esgotado || (saldo.limite != null && saldo.restam <= 0)) {
        setEsgotado(true);
        return false;
      }
      const ctx = ctxRef.current;
      const k = chaveRef.current;
      if (acao === "hint" && (faseDaQuestao(ctx) !== "antes" || pistas >= MINI_TUTOR.pistaMaxima)) {
        acrescentar({ role: "tutor", texto: TEXTOS.pistasAcabaram, local: true });
        return false;
      }
      setErro(null);
      setEnviando(true);
      acrescentar({ role: "aluno", texto: acao === "hint" ? "Me dá uma pista." : texto });
      try {
        const c = await garantirConversa();
        const r = await tutorTurn(backend, acao === "hint" ? { session_id: c.id, action: "hint" } : { session_id: c.id, action: "message", text: textoParaEnviar(ctx, texto) });
        if (chaveRef.current !== k) return false; // o aluno já mudou de questão: a resposta antiga não aparece na nova
        acrescentar({ role: "tutor", texto: r.message?.content ?? "", fontes: r.message?.sources ?? [] });
        if (r.message?.avatar) setAvatar(r.message.avatar);
        if (acao === "hint" && Number.isFinite(r.message?.hint_level)) setPistas(r.message.hint_level);
        if (Number.isFinite(r.used_today) && Number.isFinite(r.daily_limit)) {
          const s = { usadas: r.used_today, limite: r.daily_limit, restam: Math.max(0, r.daily_limit - r.used_today) };
          setSaldo(s);
          if (s.restam <= 0) setEsgotado(true);
        }
        setFalando(true);
        return true;
      } catch (e) {
        if (chaveRef.current !== k) return false;
        if (esgotou(e)) {
          setEsgotado(true);
          setSaldo((s) => (s.limite != null ? { ...s, usadas: s.limite, restam: 0 } : s));
        } else if (e?.code === "tutor_consent") {
          void lerStatus();
        } else setErro(explainError(e));
        return false;
      } finally {
        setEnviando(false);
      }
    },
    [enviando, motivo, esgotado, saldo, pistas, acrescentar, garantirConversa, backend, lerStatus]
  );

  // a boca do personagem mexe um pouco depois de cada resposta (texto não tem áudio; é só a "fala" na tela)
  React.useEffect(() => {
    if (!falando) return undefined;
    const t = setTimeout(() => setFalando(false), 2400);
    return () => clearTimeout(t);
  }, [falando]);

  /** Reinicia a conversa deste contexto (botão Fechar): a atual encerra no servidor. */
  const reiniciar = React.useCallback(() => {
    encerrar();
    setMensagens(ctxRef.current && !bloqueio(ctxRef.current) ? [{ id: novoId(), role: "tutor", texto: boasVindas(ctxRef.current), local: true }] : []);
    setErro(null);
    setPistas(0);
    setAvatar(null);
  }, [encerrar]);

  return {
    status, carregando, erroStatus, lerStatus, mensagens, enviando, erro, saldo, esgotado, pistas, avatar, falando, motivo,
    enviar: (texto) => turno("message", texto), pista: () => turno("hint"), garantirConversa, acrescentar, reiniciar, conversaAtual: () => conversa.current,
  };
}
