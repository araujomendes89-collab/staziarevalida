// Linha de base dos adaptadores (o que o vigia já viu). Duas formas de guardar:
//  - EstadoArquivo: JSON local (ensaio no Mac);
//  - EstadoSupabase: tabela radar_itens_vistos (job no Cloud Run). Usa só a API REST com a chave de serviço do job.
import fs from "node:fs";
import path from "node:path";

export class EstadoMemoria {
  constructor() { this.dados = {}; }
  async carregar(adaptador) { return new Map(Object.entries(this.dados[adaptador] ?? {})); }
  async salvar(adaptador, itens) {
    const antes = this.dados[adaptador] ?? {};
    for (const i of itens) antes[i.chave] = { hash: i.hash, titulo: i.titulo, versao: i.versao, data: i.data, url: i.url, tipo: i.tipo, ...(i.texto != null ? { texto: i.texto } : {}) };
    this.dados[adaptador] = antes;
  }
}

export class EstadoArquivo extends EstadoMemoria {
  constructor(arquivo) {
    super(); this.arquivo = arquivo;
    try { this.dados = JSON.parse(fs.readFileSync(arquivo, "utf8")); } catch { this.dados = {}; }
  }
  async salvar(adaptador, itens) {
    await super.salvar(adaptador, itens);
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    fs.writeFileSync(this.arquivo, JSON.stringify(this.dados));
  }
}

export class EstadoSupabase {
  constructor({ url, chave, fetchImpl = globalThis.fetch }) { this.url = url.replace(/\/$/, ""); this.h = { apikey: chave, authorization: `Bearer ${chave}`, "content-type": "application/json" }; this.f = fetchImpl; }
  async carregar(adaptador) {
    const mapa = new Map();
    for (let de = 0; ; de += 1000) {
      const r = await this.f(`${this.url}/rest/v1/radar_itens_vistos?select=chave,hash,titulo,versao,data_item,url,texto&adaptador=eq.${encodeURIComponent(adaptador)}&order=chave`, { headers: { ...this.h, range: `${de}-${de + 999}` } });
      if (!r.ok) throw new Error(`radar_itens_vistos: HTTP ${r.status}`);
      const linhas = await r.json();
      for (const l of linhas) mapa.set(l.chave, { hash: l.hash, titulo: l.titulo, versao: l.versao, data: l.data_item, url: l.url, ...(l.texto != null ? { texto: l.texto } : {}) });
      if (linhas.length < 1000) break;
    }
    return mapa;
  }
  async salvar(adaptador, itens) {
    const agora = new Date().toISOString();
    for (let i = 0; i < itens.length; i += 400) {
      const lote = itens.slice(i, i + 400).map((it) => ({ adaptador, chave: it.chave, titulo: it.titulo, versao: it.versao, data_item: it.data, url: it.url, hash: it.hash, texto: it.texto ?? null, visto_em: agora }));
      const r = await this.f(`${this.url}/rest/v1/radar_itens_vistos?on_conflict=adaptador,chave`, { method: "POST", headers: { ...this.h, prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(lote) });
      if (!r.ok) throw new Error(`radar_itens_vistos: gravar HTTP ${r.status}`);
    }
  }
}
