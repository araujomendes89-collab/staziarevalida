// Contador de custo da IA do Radar, com TETO MENSAL no código (decisão do dono: US$ 5 por mês).
// O total do mês é persistido (arquivo no ensaio local; tabela radar_custo_mensal via radar_custo_somar no job). Ao atingir o teto,
// podeChamar() devolve false: o vigia para de chamar a IA e só REGISTRA a mudança (sem análise). Estimativa por preço de tabela.
import fs from "node:fs";
import path from "node:path";
import { custoEstimadoUsd } from "./lib.mjs";

export const TETO_MENSAL_USD = 5;
export const mesDe = (d = new Date()) => d.toISOString().slice(0, 7);

/** Teto lido do ambiente só pode DIMINUIR o limite do código (nunca passar de US$ 5 sem mudar o código). */
export function tetoEfetivo(valorAmbiente) {
  const n = Number(valorAmbiente);
  return Number.isFinite(n) && n >= 0 && n < TETO_MENSAL_USD ? n : TETO_MENSAL_USD;
}

export class StoreCustoArquivo {
  constructor(arquivo) { this.arquivo = arquivo; }
  _ler() { try { return JSON.parse(fs.readFileSync(this.arquivo, "utf8")); } catch { return {}; } }
  async mes(mes) { return this._ler()[mes] ?? { usd: 0, chamadas: 0, tokens_entrada: 0, tokens_saida: 0 }; }
  async somar(mes, usd, ent, sai) {
    const tudo = this._ler(), m = tudo[mes] ?? { usd: 0, chamadas: 0, tokens_entrada: 0, tokens_saida: 0 };
    m.usd = Number((m.usd + usd).toFixed(6)); m.chamadas++; m.tokens_entrada += ent; m.tokens_saida += sai;
    tudo[mes] = m;
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    fs.writeFileSync(this.arquivo, JSON.stringify(tudo, null, 1));
    return m.usd;
  }
}

/** Tabela radar_custo_mensal pela API REST do Supabase (chave de serviço do job). A soma é atômica, no banco (radar_custo_somar). */
export class StoreCustoSupabase {
  constructor({ url, chave, fetchImpl = globalThis.fetch }) { this.url = url.replace(/\/$/, ""); this.h = { apikey: chave, authorization: `Bearer ${chave}`, "content-type": "application/json" }; this.f = fetchImpl; }
  async mes(mes) {
    const r = await this.f(`${this.url}/rest/v1/radar_custo_mensal?select=usd,chamadas,tokens_entrada,tokens_saida&mes=eq.${mes}`, { headers: this.h });
    if (!r.ok) throw new Error(`radar_custo_mensal: HTTP ${r.status}`);
    const l = (await r.json())[0];
    return l ? { usd: Number(l.usd), chamadas: l.chamadas, tokens_entrada: Number(l.tokens_entrada), tokens_saida: Number(l.tokens_saida) } : { usd: 0, chamadas: 0, tokens_entrada: 0, tokens_saida: 0 };
  }
  async somar(mes, usd, ent, sai) {
    const r = await this.f(`${this.url}/rest/v1/rpc/radar_custo_somar`, { method: "POST", headers: this.h, body: JSON.stringify({ p_mes: mes, p_usd: usd, p_entrada: ent, p_saida: sai }) });
    if (!r.ok) throw new Error(`radar_custo_somar: HTTP ${r.status}`);
    return Number(await r.json());
  }
}

/** Memória (testes). */
export class StoreCustoMemoria {
  constructor() { this.meses = {}; }
  async mes(mes) { return this.meses[mes] ?? { usd: 0, chamadas: 0, tokens_entrada: 0, tokens_saida: 0 }; }
  async somar(mes, usd, ent, sai) {
    const m = this.meses[mes] ?? { usd: 0, chamadas: 0, tokens_entrada: 0, tokens_saida: 0 };
    m.usd = Number((m.usd + usd).toFixed(6)); m.chamadas++; m.tokens_entrada += ent; m.tokens_saida += sai;
    this.meses[mes] = m; return m.usd;
  }
}

export class ContadorCusto {
  constructor({ store, tetoUsd = TETO_MENSAL_USD, agora = () => new Date() }) {
    this.store = store; this.teto = Math.min(tetoUsd, TETO_MENSAL_USD); this.agora = agora;
  }
  async estado() {
    const mes = mesDe(this.agora()), m = await this.store.mes(mes);
    return { mes, ...m, teto_usd: this.teto, restante_usd: Number(Math.max(this.teto - m.usd, 0).toFixed(6)), atingiu_teto: m.usd >= this.teto };
  }
  /** Pode fazer mais uma chamada que custa, no pior caso, "estimativaUsd"? */
  async podeChamar(estimativaUsd = 0.01) {
    const e = await this.estado();
    return !e.atingiu_teto && e.usd + estimativaUsd <= this.teto;
  }
  /** Soma o custo real (estimado pelos tokens devolvidos pelo Google). */
  async registrar({ modelo, tokensEntrada = 0, tokensSaida = 0 }) {
    const usd = custoEstimadoUsd(modelo, tokensEntrada, tokensSaida, this.agora()) ?? 0;
    await this.store.somar(mesDe(this.agora()), usd, tokensEntrada, tokensSaida);
    return usd;
  }
}
