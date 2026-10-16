// Padrão visual da aula do Grande Tema (docs/aula-layout.md): regras puras que decidem COMO cada trecho aparece.
// Nada aqui muda uma palavra do texto da aula; só escolhe a caixa, separa o rótulo que já vem no começo do parágrafo
// ou divide a lista de erros nas frases que já existem.

/** "Bloco 1 · Quadro típico" → "Quadro típico". */
export const cleanHeading = (h) => String(h ?? "").replace(/^Bloco\s*\d+\s*[·:.-]\s*/i, "").trim();

/** Tipo da seção pelo título (e pelo estilo dos parágrafos, quando o banco manda). */
export function secaoTipo(titulo, estilos) {
  const h = cleanHeading(titulo);
  const es = Array.isArray(estilos) ? estilos.filter(Boolean) : [];
  if (/^caso cl[íi]nico/i.test(h) || (es.length && es.every((e) => e === "caso"))) return "caso";
  if (/^voltando ao caso/i.test(h)) return "volta";
  if (/^erros? frequentes/i.test(h) || (es.length && es.every((e) => e === "lista_erros"))) return "erros";
  if (/^o que mudou/i.test(h) || (es.length && es.every((e) => e === "mudou"))) return "mudou";
  return "bloco";
}

/** Linha pequena acima do título da seção (vem do próprio título ou do tipo). */
export function sobretitulo(titulo, tipo) {
  const m = /^(Bloco\s*\d+)\s*[·:.-]/i.exec(String(titulo ?? ""));
  if (m) return m[1].replace(/\s+/g, " ");
  return { caso: "Para começar", volta: "Resposta do caso", erros: "Revisão para a prova", mudou: "Atualização" }[tipo] ?? null;
}

/** Tipo de caixa de um parágrafo, pelo começo do texto: Pegadinha (armadilha), Atenção (cuidado) ou Tome nota (dica). */
export function boxOf(text) {
  const t = String(text ?? "");
  const m = /^(Pegadinha|Armadilha cl[áa]ssica|Armadilha)\b[^:.]{0,40}[:.]\s*/i.exec(t);
  if (m) return { kind: "peg", title: "Pegadinha de prova!", body: t.slice(m[0].length) };
  const a = /^(Aten[çc][ãa]o|Cuidado)\b[^.:]{0,70}[.:]\s*/i.exec(t);
  if (a) return { kind: "atencao", title: "Atenção", body: t };
  const n = /^(Tome nota|Dica)\s*[!:.]\s*/i.exec(t);
  if (n) return { kind: "nota", title: "Tome nota", body: t.slice(n[0].length) };
  return null;
}

/**
 * Como um parágrafo aparece. `estilo` é o estilo do parágrafo no pacote da aula (pdf_estilo: "alerta:Pegadinha de prova!",
 * "alerta:Atenção: sigilo", "tome_nota"…), quando o banco passar a mandar; sem ele, vale o começo do texto (boxOf).
 */
export function blocoDe(texto, estilo) {
  const e = String(estilo ?? "");
  if (e.startsWith("alerta:")) {
    const titulo = e.slice(7).trim() || "Atenção";
    if (/pegadinha|armadilha/i.test(titulo)) return { kind: "peg", title: "Pegadinha de prova!", body: texto };
    return { kind: "atencao", title: titulo, body: texto };
  }
  if (e === "tome_nota" || e === "dica") return { kind: "nota", title: "Tome nota", body: texto };
  return boxOf(texto) ?? { kind: "p", body: texto };
}

/** Divide um parágrafo nas frases que ele já tem (lista de erros frequentes). */
export function dividirFrases(texto) {
  return String(texto ?? "")
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ"“(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Item de "O que mudou desde a prova": o rótulo do começo ("Vacina contra o VSR na gestante: …") vira o título do cartão.
 * Antes × agora só quando o próprio texto traz "Antes:" e "Agora:"/"Hoje:" (nunca separado por adivinhação).
 */
export function mudanca(texto) {
  const t = String(texto ?? "").trim();
  const r = /^([^:.]{3,80}):\s+([\s\S]+)$/.exec(t);
  // só vira título um rótulo curto ("Vacina contra o VSR na gestante"), nunca uma frase ("A referência federal … é de 2022")
  const rotulo = r && r[1].trim().split(/\s+/).length <= 10 && !/^(O|A|Os|As|Um|Uma|Em|Se|Quando)\s/.test(r[1].trim());
  const titulo = rotulo ? r[1].trim() : null;
  const corpo = rotulo ? r[2].trim() : t;
  const c = /^(?:[\s\S]*?\b)?Antes:\s*([\s\S]+?)\s*(?:Agora|Hoje|Atualmente):\s*([\s\S]+)$/i.exec(corpo);
  return c ? { titulo, corpo, antes: c[1].trim(), agora: c[2].trim() } : { titulo, corpo, antes: null, agora: null };
}

/** Célula de tabela marcada como alerta no pacote visual ("!alerta Grave: …"): destaque em vermelho, sem a marca. */
export function celula(c) {
  const s = String(c ?? "");
  const m = /^!alerta\s+/i.exec(s);
  return m ? { alerta: true, texto: s.slice(m[0].length) } : { alerta: false, texto: s };
}

const palavras = (s) => (String(s ?? "").match(/\S+/g) ?? []).length;

/** Tempo de leitura estimado (texto das seções e pontos-chave, 200 palavras por minuto; mínimo 1). */
export function minutosDeLeitura(data) {
  const n = (data?.secoes ?? []).reduce((acc, s) => acc + palavras(s.titulo) + (s.paragrafos ?? []).reduce((a, p) => a + palavras(p), 0), 0)
    + (data?.pontos_chave ?? []).reduce((a, p) => a + palavras(p), 0);
  return Math.max(1, Math.round(n / 200));
}

/** Progresso do aluno nesta aula: seções marcadas como estudadas e anotações com texto. */
export function progressoDaAula(totalSecoes, checks, notas) {
  let feitas = 0;
  for (let n = 1; n <= totalSecoes; n += 1) if (checks?.[`sec-${n}`]) feitas += 1;
  const anotacoes = Object.values(notas ?? {}).filter((t) => String(t ?? "").trim() !== "").length;
  return { feitas, total: totalSecoes, anotacoes, pct: totalSecoes ? Math.round((feitas / totalSecoes) * 100) : 0 };
}
