// Central de Notificações do aluno (migração 013830): regras de tela sem React (testadas à parte).

/** Ícone e cor de cada tipo (os tipos do banco: avisos de cobrança da 013760, contrato novo e comunicado da equipe). */
export const ARTE_TIPO = {
  renovacao: ["calendar-clock", "brand"],
  pagamento_falhou: ["circle-alert", "danger"],
  acesso_bloqueado: ["lock", "warning"],
  acesso_liberado: ["circle-check", "success"],
  contrato_novo: ["file-pen-line", "info"],
  comunicado: ["megaphone", "navy"],
};
export const arteDoTipo = (tipo) => ARTE_TIPO[tipo] ?? ["bell", "neutral"];

/** Número da bolinha do sino: nada com zero, até 9 e depois "9+". */
export function rotuloBolinha(n) {
  const v = Number(n) || 0;
  if (v <= 0) return null;
  return v > 9 ? "9+" : String(v);
}

/** Nome acessível do sino: "Notificações, 3 não lidas" (com urgentes: "Notificações, 3 não lidas, 1 urgente"). */
export function rotuloSino(n, urgentes = 0) {
  const v = Number(n) || 0;
  const u = Number(urgentes) || 0;
  if (v <= 0) return "Notificações, nenhuma não lida";
  return `Notificações, ${v} ${v === 1 ? "não lida" : "não lidas"}${u > 0 ? `, ${u} ${u === 1 ? "urgente" : "urgentes"}` : ""}`;
}

const DIA = 86400e3;
const diaBR = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

/** Data relativa em português: "agora mesmo", "há 5 minutos", "há 2 horas", "ontem", "há 3 dias", "12 de out." */
export function tempoRelativo(iso, agora = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const s = Math.max(0, (agora.getTime() - d.getTime()) / 1000);
  if (s < 60) return "agora mesmo";
  const min = Math.floor(s / 60);
  if (min < 60) return `há ${min} ${min === 1 ? "minuto" : "minutos"}`;
  const h = Math.floor(min / 60);
  if (h < 24 && diaBR(d) === diaBR(agora)) return `há ${h} ${h === 1 ? "hora" : "horas"}`;
  if (diaBR(d) === diaBR(new Date(agora.getTime() - DIA))) return "ontem";
  if (h < 24) return `há ${h} ${h === 1 ? "hora" : "horas"}`;
  const dias = Math.max(2, Math.round((new Date(diaBR(agora)) - new Date(diaBR(d))) / DIA));
  if (dias < 7) return `há ${dias} dias`;
  const mesmoAno = d.getFullYear() === agora.getFullYear();
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "short", ...(mesmoAno ? {} : { year: "numeric" }) }).format(d);
}

/** Data completa (para o title do horário): "17/10/2026 às 14:05". */
export function dataCompleta(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const f = (o) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o }).format(d);
  return `${f({ day: "2-digit", month: "2-digit", year: "numeric" })} às ${f({ hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Para onde o botão leva. { rota: "/planos" } dentro do app ou { externo: "https://..." }. Sem botão: null.
 * As rotas são as mesmas do pop-up de cobrança (AvisosPopup): planos = Meu plano; perfil = Minha conta > Assinatura; aceite = contrato.
 */
export function destinoDaAcao(n) {
  if (!n || !n.acao) return null;
  if (n.rota === "planos") return { rota: "/planos" };
  if (n.rota === "perfil") return { rota: "/perfil?secao=assinatura" };
  if (n.rota === "aceite") return { rota: "/aceite" };
  if (n.rota === "link" && typeof n.link === "string") {
    if (/^https:\/\//.test(n.link)) return { externo: n.link };
    if (/^\/[a-z0-9/_-]*(\?[a-z0-9=&_-]*)?$/.test(n.link)) return { rota: n.link };
  }
  return null;
}

// Marcas do "texto com marcas" (src/shared/textoRico): link [texto](https://...), **negrito**, *itálico*, <u>, contrabarra.
const TEM_MARCA = /\[[^\]]+\]\(https:\/\/|\*|<u>|\\/;

/**
 * Comunicado da equipe (013940) precisa do leitor formatado? Sim quando veio com formatação (rico) ou quando o texto traz marca
 * (ex.: um link). Os outros tipos e o comunicado só texto ficam no parágrafo simples de sempre.
 */
export function precisaLeitorRico(n) {
  if (!n || n.tipo !== "comunicado") return false;
  if (n.rico && typeof n.rico === "object") return true;
  return TEM_MARCA.test(String(n.texto ?? ""));
}
