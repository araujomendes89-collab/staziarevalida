/**
 * CÉREBRO DO TUTOR — rotas servidor a servidor que a PONTE de voz (Cloud Run) chama no app, sem login de aluno:
 *   POST /voz/conhecimento  {vc, u, consulta, vetor?}  → busca de conhecimento da ligação (get_topic_context interceptada na ponte)
 *   POST /voz/pacote        {vc, u}                    → material novo do tema (depois de next_question)
 * Assinatura HMAC (assinatura.ts, chave derivada de VOZ_PONTE_SEGREDO), prazo de 30 s e nonce de uso único. `vc` e `u` vêm do
 * bilhete aberto pela ponte (o navegador não escolhe aluno nem ligação); o banco ainda confere que a ligação é do aluno e está ativa,
 * conta o pedido no limite de frequência do aluno e confere a chave "IA ligada", tudo na MESMA consulta da busca.
 * Montada em /api/tutor ANTES da autenticação do aluno (como /voice/ponte-uso).
 */
import express, { type Request, type Response } from "express";
import type { ContentDb } from "../../contentHub/infra";
import { aiAllowed } from "../../contentHub/ai/registry";
import { CABECALHO_ASSINATURA, conferirCorpo, NoncesConhecimento } from "./assinatura";
import { buscarConhecimento, paraFerramenta } from "./buscar";
import { pacoteDoTema } from "./pacote";
import type { VetorConsulta } from "./tipos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const off = (v: string | undefined) => /^(false|0|off|no)$/i.test((v ?? "").trim());

type Deps = { db: Pick<ContentDb, "service">; log?: (m: string) => void };

/** O corpo exatamente como a ponte assinou (sem rawBody no app, o JSON reserializado é idêntico ao que a ponte gerou com JSON.stringify). */
const corpoDe = (req: Request) => (typeof (req as Request & { rawBody?: string }).rawBody === "string" ? (req as Request & { rawBody?: string }).rawBody! : JSON.stringify(req.body ?? {}));

export function rotasConhecimentoPonte(deps: Deps | null, env: NodeJS.ProcessEnv = process.env, nonces = new NoncesConhecimento()) {
  const router = express.Router();
  const segredo = () => (env.VOZ_PONTE_SEGREDO ?? "").trim();
  const conferir = <T extends Record<string, unknown>>(req: Request, res: Response) => {
    if (!deps || segredo().length < 32) { res.status(401).json({ error: "Não autorizado." }); return null; }
    const c = conferirCorpo<T>(corpoDe(req), String(req.headers[CABECALHO_ASSINATURA] ?? ""), segredo(), nonces);
    if (!c.ok) { res.status(401).json({ error: "Não autorizado." }); return null; }
    if (!UUID.test(String(c.dados.vc ?? "")) || !UUID.test(String(c.dados.u ?? ""))) { res.status(400).json({ error: "Pedido inválido." }); return null; }
    // IA desligada no ambiente (o painel é conferido dentro da busca)
    if (off(env.CONTENT_LAB_ENABLED) || off(env.CONTENT_LAB_AI_ENABLED)) { res.json({ output: { error: "O Tutor está indisponível no momento." } }); return null; }
    return c.dados;
  };

  router.post("/voz/conhecimento", async (req, res) => {
    const d = conferir<{ vc: string; u: string; consulta?: string; vetor?: VetorConsulta | null }>(req, res);
    if (!d) return;
    try {
      const v = d.vetor && typeof d.vetor === "object" && Array.isArray(d.vetor.values) && d.vetor.values.length === 768 && typeof d.vetor.model === "string" ? d.vetor : null;
      const r = await buscarConhecimento(deps!, { userId: d.u, voiceCallId: d.vc, pergunta: String(d.consulta ?? "").slice(0, 2000), vetor: v, via: "ponte", bucket: "voice_tool", checarIa: true });
      res.json({ output: paraFerramenta(r), rotulos: r.trechos.map((t) => t.citacao), vetor: r.vetor });
    } catch (error) {
      const msg = (error as Error).message ?? "";
      res.json({ output: { error: /encerrada|não encontrada/i.test(msg) ? "A conversa por voz foi encerrada." : "Não consegui consultar isso agora." } });
    }
  });

  router.post("/voz/pacote", async (req, res) => {
    const d = conferir<{ vc: string; u: string }>(req, res);
    if (!d) return;
    try {
      if (!(await aiAllowed(deps!.db as ContentDb)).ok) return res.json({ material: "" });
      const p = await pacoteDoTema(deps!, { userId: d.u, voiceCallId: d.vc });
      res.json({ material: p.texto, trechos: p.trechos.length });
    } catch {
      res.json({ material: "" });
    }
  });
  return router;
}
