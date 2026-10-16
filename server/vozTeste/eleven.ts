/**
 * Voice Tutor — Fase 2 (protótipo). ElevenLabs Agents: o servidor pega um token de conversa WebRTC e entrega SÓ o token ao
 * navegador (doc oficial: GET https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=... com xi-api-key; o SDK React
 * usa startSession({ conversationToken })). A chave fica em ~/.config/elevenlabs-staziamed/elevenlabs.env (criado pelo dono);
 * nunca é impressa, nunca vai ao navegador.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ARQUIVO_ELEVEN = path.join(os.homedir(), ".config/elevenlabs-staziamed/elevenlabs.env");

export function lerArquivoEnv(arquivo: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(arquivo)) return out;
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linha);
    if (!m) continue;
    let v = m[2];
    if (v.length >= 2 && v[0] === v.at(-1) && (v[0] === '"' || v[0] === "'")) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

export interface ConfigEleven { apiKey: string | null; agentId: string | null; falta: string[] }

export function configEleven(arquivo = ARQUIVO_ELEVEN, env: NodeJS.ProcessEnv = process.env): ConfigEleven {
  const e = { ...lerArquivoEnv(arquivo), ...Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith("ELEVENLABS_"))) } as Record<string, string | undefined>;
  const apiKey = e.ELEVENLABS_API_KEY?.trim() || null;
  const agentId = e.ELEVENLABS_AGENT_ID?.trim() || null;
  const falta = [
    ...(fs.existsSync(arquivo) ? [] : [`arquivo ${arquivo.replace(os.homedir(), "~")}`]),
    ...(apiKey ? [] : ["ELEVENLABS_API_KEY"]),
    ...(agentId ? [] : ["ELEVENLABS_AGENT_ID (o agente é criado com scripts/voz-teste/criar-agente-eleven.mjs depois da chave)"]),
  ];
  return { apiKey, agentId, falta };
}

/** Token de conversa WebRTC (uso único, emitido pela ElevenLabs para o agente). */
export async function tokenConversaEleven(c: ConfigEleven, fetchFn: typeof fetch = fetch): Promise<{ token: string }> {
  if (!c.apiKey || !c.agentId) throw Object.assign(new Error("ElevenLabs não configurada"), { status: 503 });
  const r = await fetchFn(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(c.agentId)}`, { headers: { "xi-api-key": c.apiKey } });
  const j = (await r.json().catch(() => ({}))) as { token?: string; detail?: unknown };
  if (!r.ok || !j.token) throw Object.assign(new Error(`ElevenLabs respondeu ${r.status}`), { status: 502, detalhe: JSON.stringify(j.detail ?? "").slice(0, 200) });
  return { token: j.token };
}
