/**
 * Rotas /api/interesse — LISTA DE INTERESSE DA 2ª FASE (migração 013960; pedido do dono, 18/10/2026). Valem em qualquer domínio do
 * projeto, então o formulário da página inicial (www) chama /api/interesse do próprio domínio (CSP: connect-src/form-action 'self').
 *
 * PÚBLICAS (o banco faz tudo por funções ch_worker_interesse_*, só com o papel de serviço):
 *   POST /api/interesse            inscrição. Aceita JSON (o JS do site) ou formulário comum (sem JS: responde com uma página simples).
 *                                  Campos: whatsapp (obrigatório), pais (55, 595, 591, 54 ou "outro"), email (opcional), nome (opcional),
 *                                  consentimento (obrigatório), versao, origem, utm (ou utm_source…), website (HONEYPOT: preenchido =
 *                                  robô; responde igual e não grava nada).
 *                                  Resposta IGUAL para número novo ou repetido (não revela quem está na lista): "Pronto!" e, se houver
 *                                  link do grupo configurado, o endereço do botão "Entrar no grupo do WhatsApp" (/api/interesse/grupo).
 *                                  Limites no BANCO: por IP (10 em 10 min, 50 por dia: 429), por e-mail (3 confirmações por dia com 2 min
 *                                  entre elas: resposta igual, nada sai) e teto geral de confirmações por dia.
 *   GET  /api/interesse/grupo?t=…  registra o clique e leva ao grupo do WhatsApp (link em Administração → Lista de interesse).
 *   GET/POST /api/interesse/confirmar?t=…  confirmação do e-mail (GET mostra o botão; POST confirma: programas de e-mail abrem links).
 *   GET/POST /api/interesse/sair?t=…       sair da lista (um clique + confirmação; o POST também é o "um clique" do List-Unsubscribe).
 * ADMINISTRAÇÃO (só administrador: o servidor confere aqui com app_ch_whoami e cada função do banco confere de novo com assert_admin):
 *   GET  /admin/resumo · GET /admin/lista?busca&filtro&pagina · GET /admin/csv?filtro · POST /admin/grupo { link } ·
 *   POST /admin/tirar { id } · GET /admin/aviso/previa · POST /admin/aviso { esperado }
 * O IP nunca vai ao banco: só o código (HMAC-SHA256 com segredo do servidor). O registro (log) nunca leva WhatsApp nem e-mail.
 */
import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import type { ContentDb, Identity } from "../contentHub/infra";
import { ipDe } from "../planos/router";
import { paginaDescadastro } from "../legal/router";
import { esc, renderItem, type ItemFila } from "../legal/emails";
import { CONSENTIMENTO_VERSAO, GRUPO_LINK_RE, montarWhatsapp, resumirNavegador } from "./consentimento";

export interface InteresseDeps {
  db: ContentDb;
  /** APP_BASE_URL (links dos e-mails); a prévia do aviso usa o mesmo endereço */
  baseUrl: string | null;
  log?: (m: string) => void;
}

type Authed = Request & { user?: Identity };
const SITE = "https://www.staziamed.com.br";

/** HMAC-SHA256 do IP (64 hexadecimais), ou null sem chave/sem IP. Chave só no servidor. */
export function codigoDoIpInteresse(ip: string | null, env: NodeJS.ProcessEnv = process.env): string | null {
  const segredo = env.INTERESSE_IP_SEGREDO || env.PLANOS_IP_SEGREDO || env.SUPABASE_SERVICE_ROLE_KEY || (env.NODE_ENV !== "production" ? "dev-local-interesse" : "");
  if (!ip || !segredo) return null;
  return crypto.createHmac("sha256", `interesse-ip:${segredo}`).update(ip.replace(/^::ffff:/, "").toLowerCase()).digest("hex");
}

const txt = (t: string) => `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#4F5A69;">${t}</p>`;
const botaoGrande = (href: string, rotulo: string, novaAba = false) =>
  `<p style="margin:8px 0 20px 0;"><a href="${esc(href)}"${novaAba ? ' target="_blank" rel="noopener noreferrer"' : ""} style="display:block;text-align:center;padding:16px 24px;border-radius:12px;background:#0B6F68;color:#FFFFFF;font:bold 18px Arial,Helvetica,sans-serif;text-decoration:none;">${esc(rotulo)}</a></p>`;
const voltarAoSite = () => txt(`<a href="${SITE}/" style="color:#0B6F68;">Voltar ao site do StaziaMed</a>`);
const cabecalhos = (res: Response) => res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" });
const codigo = (q: unknown) => (typeof q === "string" && /^[0-9a-f]{64}$/.test(q) ? q : null);
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

const MSG = {
  pronto: "Pronto! Você está na lista de interesse da 2ª fase.",
  emailEnviado: "Se você informou um e-mail, mandamos um link para confirmar o endereço (veja também o spam).",
  grupo: "Entre no grupo do WhatsApp para receber o aviso quando a 2ª fase abrir.",
  semConsentimento: "Marque a caixa de consentimento para entrar na lista.",
  whatsapp: "Confira o número do WhatsApp com DDD, por exemplo (11) 98765-4321. Número de fora do Brasil: escolha o país ou comece com + e o código do país.",
  email: "Confira o e-mail (exemplo: nome@email.com) ou deixe o campo vazio.",
  limite: "Muitas tentativas a partir desta rede. Espere alguns minutos e tente de novo.",
  erro: "Não deu certo agora. Tente de novo em alguns minutos.",
};

/** Quem pediu quer JSON (o JS do site) ou uma página (formulário sem JS)? */
const querJson = (req: Request) => Boolean(req.is("application/json")) || (req.get("accept") ?? "").includes("application/json");

function utmDe(body: Record<string, unknown>): Record<string, string> {
  const fonte = body.utm && typeof body.utm === "object" ? (body.utm as Record<string, unknown>) : body;
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const v = fonte[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 100);
  }
  return out;
}

const marcado = (v: unknown) => v === true || v === "on" || v === "sim" || v === "1" || v === CONSENTIMENTO_VERSAO;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Código aleatório (para o honeypot: o robô recebe uma resposta igual, com um botão que não leva a lugar nenhum). */
const falso = () => crypto.randomBytes(32).toString("hex");

/** Escapa uma célula do CSV (";" para o Excel em português) e neutraliza fórmula (=, +, -, @ no começo). */
export function celulaCsv(v: unknown): string {
  let s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const dataHoraBR = (v: unknown) =>
  typeof v === "string" && v
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(v))
    : "";
const ESTADO_EMAIL: Record<string, string> = { sem_email: "sem e-mail", pendente: "não confirmado", confirmado: "confirmado", avisado: "avisado" };

export function csvDaLista(linhas: Record<string, any>[]): string {
  const cab = ["WhatsApp", "WhatsApp verificado", "Nome", "E-mail", "E-mail (situação)", "Situação", "Inscrição", "Clicou no grupo",
    "Cliques no grupo", "E-mail confirmado em", "Aviso por e-mail em", "Saiu em", "Origem", "UTM", "Consentimento (versão)", "Consentimento em"];
  const corpo = linhas.map((l) =>
    [l.whatsapp, l.whatsapp_verificado ? "sim" : "não", l.nome, l.email, ESTADO_EMAIL[l.email_estado] ?? l.email_estado,
      l.estado === "ativo" ? "na lista" : "saiu", dataHoraBR(l.criado_em), dataHoraBR(l.grupo_clicado_em), l.grupo_cliques,
      dataHoraBR(l.email_confirmado_em), dataHoraBR(l.avisado_em), dataHoraBR(l.descadastrado_em), l.origem,
      l.utm && Object.keys(l.utm).length ? l.utm : "", l.consentimento_versao, dataHoraBR(l.consentimento_em)].map(celulaCsv).join(";"));
  return `﻿${[cab.join(";"), ...corpo].join("\r\n")}\r\n`;
}

export function createInteresseRouter(deps: InteresseDeps | null) {
  const router = express.Router();
  const log = (m: string) => deps?.log?.(`[interesse] ${m}`.slice(0, 300));
  const grupoUrl = (token: string) => `/api/interesse/grupo?t=${token}`;

  /** Página de resposta do formulário sem JS (e das páginas dos links). */
  const paginaPronto = (grupo: string | null, comEmail: boolean) =>
    paginaDescadastro(
      "Pronto!",
      txt(esc(MSG.pronto)) + (comEmail ? txt(esc(MSG.emailEnviado)) : "") + (grupo ? txt(esc(MSG.grupo)) + botaoGrande(grupo, "Entrar no grupo do WhatsApp", true) : "") + voltarAoSite()
    );
  const paginaErro = (msg: string) => paginaDescadastro("Falta um detalhe", txt(esc(msg)) + txt(`<a href="${SITE}/" style="color:#0B6F68;">Voltar ao formulário</a>`));

  // ------------------------------------------------------------ inscrição
  router.post("/", express.urlencoded({ extended: false, limit: "10kb", parameterLimit: 30 }), async (req, res) => {
    cabecalhos(res);
    const json = querJson(req);
    const responder = (status: number, ok: boolean, msg: string, extra: Record<string, unknown> = {}) =>
      json ? res.status(status).json(ok ? { ok: true, mensagem: msg, grupo: (extra.grupo as string) ?? null } : { ok: false, error: msg }) : res.status(status).type("html").send(ok ? paginaPronto((extra.grupo as string) ?? null, Boolean(extra.comEmail)) : paginaErro(msg));
    if (!deps) return responder(503, false, MSG.erro);
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const comEmail = Boolean(texto(body.email, 300).trim());
    const mensagem = comEmail ? `${MSG.pronto} ${MSG.emailEnviado}` : MSG.pronto;
    try {
      // HONEYPOT: campo escondido que só robô preenche. Resposta igual à de sucesso; nada é gravado.
      if (texto(body.website, 300).trim()) {
        log("honeypot preenchido: ignorado");
        const tem = await deps.db.service<boolean>("ch_worker_interesse_tem_grupo");
        return responder(200, true, mensagem, { grupo: tem ? grupoUrl(falso()) : null, comEmail });
      }
      if (!marcado(body.consentimento)) return responder(400, false, MSG.semConsentimento);
      const r = await deps.db.service<{ resultado: string; acao?: string; email?: string; grupo?: string }>("ch_worker_interesse_inscrever", {
        p_whatsapp: montarWhatsapp(body.pais, body.whatsapp),
        p_email: texto(body.email, 300) || null,
        p_nome: texto(body.nome, 200) || null,
        p_origem: texto(body.origem, 40) || "site",
        p_utm: utmDe(body),
        p_versao: texto(body.versao, 40) || CONSENTIMENTO_VERSAO,
        p_ip_hash: codigoDoIpInteresse(ipDe(req)),
        p_user_agent: resumirNavegador(req.get("user-agent")),
      });
      switch (r?.resultado) {
        case "ok": {
          log(`inscrição: ${r.acao} (e-mail: ${r.email})`);
          const tem = await deps.db.service<boolean>("ch_worker_interesse_tem_grupo");
          return responder(200, true, mensagem, { grupo: tem && r.grupo ? grupoUrl(r.grupo) : null, comEmail });
        }
        case "whatsapp_invalido":
          return responder(400, false, MSG.whatsapp);
        case "email_invalido":
          return responder(400, false, MSG.email);
        case "versao_invalida":
          return responder(400, false, "O formulário está desatualizado. Recarregue a página e tente de novo.");
        case "limite_ip":
          return res.set("Retry-After", "600"), responder(429, false, MSG.limite);
        default:
          throw new Error(`resposta inesperada: ${r?.resultado}`);
      }
    } catch (error) {
      log(`inscrição falhou: ${(error as Error).message}`);
      return responder(500, false, MSG.erro);
    }
  });

  // ------------------------------------------------------------ botão do grupo (registra o clique e leva ao WhatsApp)
  router.get("/grupo", async (req, res) => {
    cabecalhos(res);
    const t = codigo(req.query.t);
    if (!deps || !t) return res.status(t ? 503 : 400).type("html").send(paginaDescadastro("Link inválido", txt("Este link do grupo não vale. Volte ao site e entre na lista de interesse.") + voltarAoSite()));
    try {
      const r = await deps.db.service<{ valido: boolean; link?: string | null }>("ch_worker_interesse_grupo", { p_token: t });
      if (!r?.valido) return res.status(404).type("html").send(paginaDescadastro("Link inválido", txt("Este link do grupo não vale mais. Volte ao site e entre na lista de interesse.") + voltarAoSite()));
      if (!r.link || !GRUPO_LINK_RE.test(r.link)) return res.type("html").send(paginaDescadastro("Grupo indisponível agora", txt("Você está na lista de interesse. O grupo do WhatsApp ainda não está aberto; tente de novo mais tarde.") + voltarAoSite()));
      res.redirect(302, r.link);
    } catch (error) {
      log(`grupo falhou: ${(error as Error).message}`);
      res.status(500).type("html").send(paginaDescadastro("Não deu certo agora", txt(esc(MSG.erro))));
    }
  });

  // ------------------------------------------------------------ confirmar o e-mail (dupla confirmação)
  const confirmarPagina = async (req: Request, res: Response, confirmar: boolean) => {
    cabecalhos(res);
    const t = codigo(req.query.t);
    const invalido = (titulo = "Link inválido", msg = "Este link de confirmação não vale mais. Se quiser, entre na lista de novo pelo site.") =>
      paginaDescadastro(titulo, txt(esc(msg)) + voltarAoSite());
    if (!deps || !t) return res.status(t ? 503 : 400).type("html").send(invalido());
    try {
      const r = await deps.db.service<{ valido: boolean; expirado?: boolean; email_estado?: string; grupo?: string }>("ch_worker_interesse_confirmar", { p_token: t, p_confirmar: confirmar });
      if (!r?.valido) return res.status(404).type("html").send(r?.expirado ? invalido("Link vencido", "Este link de confirmação venceu (vale 7 dias). Entre na lista de novo pelo site para receber outro.") : invalido());
      const tem = await deps.db.service<boolean>("ch_worker_interesse_tem_grupo");
      const grupo = tem && r.grupo ? botaoGrande(grupoUrl(r.grupo), "Entrar no grupo do WhatsApp", true) : "";
      if (r.email_estado === "pendente") {
        return res.type("html").send(
          paginaDescadastro(
            "Confirmar seu e-mail",
            txt("Falta um toque: confirme que quer receber por e-mail o aviso de quando a 2ª fase do StaziaMed abrir.") +
              `<form method="post" action="?t=${esc(t)}" style="margin:0 0 16px 0;"><button type="submit" style="display:block;width:100%;padding:16px 24px;border:0;border-radius:12px;background:#0B6F68;color:#FFFFFF;font:bold 18px Arial,Helvetica,sans-serif;cursor:pointer;">Confirmar meu e-mail</button></form>` +
              txt("Não pediu isso? É só fechar esta página.")
          )
        );
      }
      res.type("html").send(paginaDescadastro("Pronto, avisaremos quando a 2ª fase abrir", txt("Seu e-mail está confirmado na lista de interesse da 2ª fase. Usamos este endereço só para esse aviso.") + grupo + voltarAoSite()));
    } catch (error) {
      log(`confirmação falhou: ${(error as Error).message}`);
      res.status(500).type("html").send(paginaDescadastro("Não deu certo agora", txt(esc(MSG.erro))));
    }
  };
  router.get("/confirmar", (req, res) => confirmarPagina(req, res, false));
  router.post("/confirmar", express.urlencoded({ extended: false, limit: "1kb" }), (req, res) => confirmarPagina(req, res, true));

  // ------------------------------------------------------------ sair da lista (um clique + confirmação)
  const sairPagina = async (req: Request, res: Response, confirmar: boolean) => {
    cabecalhos(res);
    const t = codigo(req.query.t);
    const invalido = () => paginaDescadastro("Link inválido", txt(`Este link não vale mais. Para sair da lista, escreva para <a href="mailto:privacidade@staziamed.com.br" style="color:#0B6F68;">privacidade@staziamed.com.br</a>.`));
    if (!deps || !t) return res.status(t ? 503 : 400).type("html").send(invalido());
    try {
      const r = await deps.db.service<{ valido: boolean; inscrito?: boolean }>("ch_worker_interesse_sair", { p_token: t, p_confirmar: confirmar });
      if (!r?.valido) return res.status(404).type("html").send(invalido());
      if (confirmar) return res.type("html").send(paginaDescadastro("Pronto, você saiu da lista", txt("Você não está mais na lista de interesse da 2ª fase e não vai receber mais nada por ela. Se estiver no grupo do WhatsApp, é só sair do grupo pelo próprio WhatsApp.") + voltarAoSite()));
      if (!r.inscrito) return res.type("html").send(paginaDescadastro("Você já saiu da lista", txt("Você não está mais na lista de interesse da 2ª fase.") + voltarAoSite()));
      res.type("html").send(
        paginaDescadastro(
          "Sair da lista de interesse?",
          txt("Você deixa de receber o aviso da 2ª fase do StaziaMed e o seu contato sai da lista.") +
            `<form method="post" action="?t=${esc(t)}" style="margin:0 0 16px 0;"><button type="submit" style="display:inline-block;padding:14px 24px;border:0;border-radius:12px;background:#0B6F68;color:#FFFFFF;font:bold 16px Arial,Helvetica,sans-serif;cursor:pointer;">Confirmar: quero sair da lista</button></form>` +
            txt("Mudou de ideia? É só fechar esta página.")
        )
      );
    } catch (error) {
      log(`sair falhou: ${(error as Error).message}`);
      res.status(500).type("html").send(paginaDescadastro("Não deu certo agora", txt(esc(MSG.erro))));
    }
  };
  router.get("/sair", (req, res) => sairPagina(req, res, false));
  router.post("/sair", express.urlencoded({ extended: false, limit: "1kb" }), (req, res) => sairPagina(req, res, true));

  // ------------------------------------------------------------ Administração (só administrador)
  const soAdmin = async (req: Authed, res: Response, next: NextFunction) => {
    cabecalhos(res);
    if (!deps) return fail(res, 503, "Recurso indisponível neste servidor.");
    try {
      const user = await deps.db.authenticate(req);
      if (!user) return fail(res, 401, "Entre na sua conta.");
      const me = await deps.db.asUser<{ admin: boolean } | null>(user, "app_ch_whoami");
      if (me?.admin !== true) return fail(res, 403, "Acesso restrito a administradores.");
      req.user = user;
    } catch (error) {
      return /restrito|42501|Acesso|permission/i.test((error as Error).message) ? fail(res, 403, "Acesso restrito a administradores.") : fail(res, 500, "Não foi possível conferir o acesso.");
    }
    next();
  };
  const comoAdmin = <T>(req: Authed, fn: string, args: Record<string, unknown> = {}) => deps!.db.asUser<T>(req.user!, fn, args);
  const erroAdmin = (res: Response, error: unknown) => {
    const m = (error as Error).message ?? "";
    if (/restrito|42501/i.test(m)) return fail(res, 403, "Acesso restrito a administradores.");
    // frases prontas do banco (português) passam; o resto vira uma frase geral
    if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^{}<>]{3,240}[.!?)]$/.test(m) && /[a-zà-ú]/.test(m)) return fail(res, 400, m);
    log(`administração falhou: ${m}`);
    return fail(res, 500, "Não deu certo agora. Tente de novo.");
  };
  const filtroDe = (v: unknown) => (typeof v === "string" && /^[a-z_]{1,30}$/.test(v) ? v : null);

  router.get("/admin/resumo", soAdmin, async (req: Authed, res) => {
    try {
      res.json(await comoAdmin(req, "app_admin_interesse_resumo", { p_dias: Math.min(365, Math.max(1, Number(req.query.dias) || 30)) }));
    } catch (e) {
      erroAdmin(res, e);
    }
  });
  router.get("/admin/lista", soAdmin, async (req: Authed, res) => {
    const pagina = Math.max(0, Math.floor(Number(req.query.pagina) || 0));
    try {
      res.json(await comoAdmin(req, "app_admin_interesse_lista", { p_busca: texto(req.query.busca, 100) || null, p_filtro: filtroDe(req.query.filtro), p_limite: 50, p_offset: pagina * 50 }));
    } catch (e) {
      erroAdmin(res, e);
    }
  });
  router.get("/admin/csv", soAdmin, async (req: Authed, res) => {
    try {
      const linhas = await comoAdmin<Record<string, unknown>[]>(req, "app_admin_interesse_exportar", { p_filtro: filtroDe(req.query.filtro) });
      const hoje = new Date().toISOString().slice(0, 10);
      res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="lista-interesse-2a-fase-${hoje}.csv"` }).send(csvDaLista(linhas ?? []));
    } catch (e) {
      erroAdmin(res, e);
    }
  });
  router.post("/admin/grupo", soAdmin, async (req: Authed, res) => {
    const link = typeof req.body?.link === "string" ? req.body.link.trim() : "";
    if (link && !GRUPO_LINK_RE.test(link)) {
      return fail(res, 400, "O link precisa ser um convite de grupo do WhatsApp: https://chat.whatsapp.com/… (sem nada depois do código, como ?s=…).");
    }
    try {
      res.json(await comoAdmin(req, "app_admin_interesse_grupo_salvar", { p_link: link || null }));
    } catch (e) {
      erroAdmin(res, e);
    }
  });
  router.post("/admin/tirar", soAdmin, async (req: Authed, res) => {
    const id = Number(req.body?.id);
    if (!Number.isSafeInteger(id) || id <= 0) return fail(res, 400, "Inscrição inválida.");
    try {
      res.json(await comoAdmin(req, "app_admin_interesse_tirar", { p_id: id }));
    } catch (e) {
      erroAdmin(res, e);
    }
  });
  router.get("/admin/aviso/previa", soAdmin, async (req: Authed, res) => {
    try {
      const previa = await comoAdmin<Record<string, unknown>>(req, "app_admin_interesse_aviso_previa");
      const tem = await deps!.db.service<boolean>("ch_worker_interesse_tem_grupo");
      // o e-mail que vai sair, montado com o mesmo modelo da fila (códigos de exemplo, que não valem)
      const exemplo: ItemFila = { id: 0, kind: "interesse_aviso", tentativas: 0, email: "exemplo@exemplo.com", nome: "Maria", payload: { sair: "0".repeat(64), grupo: "0".repeat(64), tem_grupo: tem } };
      const email = renderItem(exemplo, deps!.baseUrl);
      res.json({ ...previa, email: { assunto: email.subject, texto: email.text, html: email.html } });
    } catch (e) {
      erroAdmin(res, e);
    }
  });
  router.post("/admin/aviso", soAdmin, async (req: Authed, res) => {
    const esperado = Number(req.body?.esperado);
    if (!Number.isSafeInteger(esperado) || esperado <= 0) return fail(res, 400, "Veja a prévia antes de avisar.");
    try {
      res.json(await comoAdmin(req, "app_admin_interesse_avisar", { p_esperado: esperado }));
    } catch (e) {
      erroAdmin(res, e);
    }
  });

  return router;
}
