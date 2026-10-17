// MEDIDAS DA REVISÃO do "Tutor natural" (17/10/2026), sobre as conversas já gravadas pela bancada (bancada-natural.ts).
//
// Conta por SOFTWARE (não só pelo juiz) o que os revisores apontaram, para comparar a linha de base, a medição anterior e a nova:
//   apelidos dirigidos ao aluno · marca de cada personalidade (o charme de preguiça do Tranquilo) · tamanho das respostas · «kkkk» ·
//   humor fora de "neutral" · «agora + verbo» no fim · a reserva fixa · aberturas e passagens (período do dia, meta, humor anunciado,
//   estrutura repetida por trigramas, passado inventado na 1ª conversa) · tempo da abertura (p50/p95) · tokens e custo.
// Com --juiz-cego, um juiz (gemini-3.8-flash pelo Vertex, chave lida de ~/.config/vertex-staziamed/vertex.env, nunca impressa) lê
// falas soltas sem saber de quem são e diz qual das 4 personalidades falou (os personagens continuam diferentes?).
//
// Uso: node scripts/voz-teste/medir-natural-revisao.mjs --pastas base,depois,revisao [--juiz-cego] [--saida arquivo.json]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { lerEnv, VERTEX_ENV } from "./vertex.mjs";

const args = process.argv.slice(2);
const arg = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const RAIZ = "/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/natural";
const PASTAS = String(arg("pastas", "base,depois")).split(",").map((s) => s.trim()).filter(Boolean);
const JUIZ_CEGO = args.includes("--juiz-cego");
const SAIDA = arg("saida", path.join(RAIZ, "revisao-medidas.json"));
const IDS = ["durao", "acolhedor", "durona", "tranquila"];
const NOMES = { durao: "Durão", acolhedor: "Tranquilo", durona: "Durona", tranquila: "Tranquila" };
const TEMAS = ["tuberculose", "anafilaxia", "dengue", "infarto agudo do miocárdio", "pré-eclâmpsia", "sepse"];

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const norm = (s) => fold(s).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };

// apelido dirigido ao aluno: lista própria (independente da safety.ts, para não medir a regra com ela mesma)
const APELIDOS = ["palhaco", "palhaca", "engracadinho", "engracadinha", "valentao", "valentona", "sabichao", "sabichona", "espertinho", "espertinha", "mane", "moleque", "folgado", "folgada", "abusado", "abusada", "safado", "safada", "mala", "desgracado", "desgracada", "malandro", "rapaz", "meu filho", "minha filha", "querido", "querida"];
const NICK = `(?:${APELIDOS.join("|").replace(/ /g, "\\s+")})`;
const APELIDO_RE = new RegExp(`(?:^|[,!?.;:…—–-]\\s*)(?:seu |sua |meu |minha |o |a )?${NICK}\\s*(?=[,!?.;:…]|$)|(?<![a-z])${NICK}\\s+(?:voce|vc|ce|tu)(?![a-z])|(?<![a-z])(?:voce|vc|ce|tu)\\s+(?:e|eh|ta|esta)\\s+(?:um |uma |muito |bem )*${NICK}(?![a-z])|(?<![a-z])(?:seu|sua)\\s+${NICK}(?![a-z])|(?<![a-z])(?:palhac[oa]|engracadinh[oa]|valentao|sabichao|espertinh[oa])(?![a-z])`);
// marca de cada personagem (aproximada, por palavras)
const MARCA = {
  acolhedor: /\b(preguica|preguicoso|trabalho|trabalheira|esforco|cansa(?:r|ndo)? explicar|explico menos|sem mim|de mim|rede|soneca|cochil|mole|explicar da trabalho|me poupa|poupar)\b/,
  tranquila: /\b(com calma|sem pressa|calma|tranquil|respira|devagar|junt[oa]s?|cuidado)\b/,
  durao: /([A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}[!?])|\b(porra|caralho|merda|cacete|puta|pqp)\b/,
  durona: /([A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}[!?])|\b(porra|caralho|merda|cacete|puta|pqp)\b/,
};
const PERIODO = /\b(tarde|manha|noite|madrugada|bom dia|boa tarde|boa noite)\b/;
const META = /\b(meta|gabaritar)\b/;
const HUMOR_ANUNC = /\b(humor|neutr[oa]|meu dia (?:esta|ta)|(?:to|estou) (?:de bom humor|sem paciencia|bem tranquil|tranquil[oa] hoje))\b/;
const OLHADA = /\b(da uma olhada|da uma lida)\b/;
const PASSADO = /\b(de novo|outra vez|novamente|mais uma vez|da ultima vez|ultima conversa|sempre|ontem|de volta|voltou)\b/;
const AGORA = /(?<![a-z])agora,?\s+(?:me\s+)?(?:diz|diga|responde|responda|fala|fale|conta|conte|explica|explique|mostra|mostre)(?![a-z])/;
const RESERVA_DADO = "esse dado eu nao tenho confirmado aqui";

const tri = (t, skip) => { const w = norm(t).split(" ").filter((x) => x && !skip.has(x)); const s = new Set(); for (let i = 0; i + 3 <= w.length; i++) s.add(w.slice(i, i + 3).join(" ")); return s; };
const temaSkip = new Set(TEMAS.flatMap((t) => norm(t).split(" ")));
const mesmaEstrutura = (a, b) => { const A = tri(a, temaSkip), B = tri(b, temaSkip); if (A.size < 3 || B.size < 3) return false; let c = 0; for (const g of A) if (B.has(g)) c++; return c / Math.min(A.size, B.size) > 0.4; };

function carregar(pasta) {
  const dir = path.join(RAIZ, pasta);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^(durao|acolhedor|durona|tranquila)-\d+\.json$/.test(f)).map((f) => ({ arq: f, ...JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) })).filter((r) => !r.erro);
}

function medir(regs, pid) {
  const convs = regs.filter((r) => r.personalidade === pid);
  const resp = [], fixas = [], humorAntes = {}, humorDepois = {};
  const apelidos = [], barradasAtaque = [];
  let reservaDado = 0, substituidas = 0, passadoInventado = 0, primeiras = 0;
  for (const c of convs) {
    c.turnos.forEach((t, i) => {
      if (t.papel !== "professor") return;
      const m = t.meta ?? {};
      const f = fold(t.texto);
      if (APELIDO_RE.test(f)) apelidos.push(`${c.arq} fala ${i}: ${t.texto.slice(0, 110)}`);
      if ((m.violations ?? []).includes("personal_attack")) barradasAtaque.push(`${c.arq} fala ${i}`);
      if (t.tipo === "resposta" || t.tipo === "reacao") {
        resp.push(t.texto);
        const a = m.personality?.mood ?? "?"; humorAntes[a] = (humorAntes[a] ?? 0) + 1;
        const d = m.emotion?.mood ?? m.avatar?.emotion ?? "?"; humorDepois[d] = (humorDepois[d] ?? 0) + 1;
        if (f.includes(RESERVA_DADO)) reservaDado++;
        if (m.notice) substituidas++;
      }
      if (t.tipo === "abertura" || t.tipo === "passagem") {
        fixas.push({ texto: t.texto, tipo: t.tipo, gerada: Boolean(m.generated), origem: m.origem ?? (m.generated ? "na_hora" : "reserva"), aluno: c.aluno_uid ?? c.arq, arq: c.arq });
        if (t.tipo === "abertura" && (c.conversas_anteriores_do_aluno ?? 0) === 0) { primeiras++; if (m.generated && PASSADO.test(f)) passadoInventado++; }
      }
    });
  }
  const palavras = resp.map((x) => x.split(/\s+/).filter(Boolean).length);
  const geradas = fixas.filter((x) => x.gerada);
  let paresEstr = 0, paresTot = 0, paresAluno = 0, paresAlunoTot = 0;
  for (let i = 0; i < geradas.length; i++) for (let j = i + 1; j < geradas.length; j++) {
    const e = mesmaEstrutura(geradas[i].texto, geradas[j].texto);
    paresTot++; if (e) paresEstr++;
    if (geradas[i].aluno === geradas[j].aluno) { paresAlunoTot++; if (e) paresAluno++; }
  }
  const ms = convs.flatMap((c) => c.aberturas_ms ?? []);
  const prof = convs.reduce((s, c) => ({ e: s.e + c.custo.professor.entrada, s2: s.s2 + c.custo.professor.saida, n: s.n + c.custo.professor.chamadas }), { e: 0, s2: 0, n: 0 });
  const neutro = (h) => { const tot = Object.values(h).reduce((a, b) => a + b, 0); return { fora_de_neutral_pct: pct(tot - (h.neutral ?? 0), tot), distribuicao: h }; };
  return {
    id: pid, nome: NOMES[pid], conversas: convs.length, respostas: resp.length,
    apelidos_no_texto_final: apelidos.length, apelidos_exemplos: apelidos.slice(0, 12), respostas_barradas_por_ataque_pessoal: barradasAtaque.length,
    marca_tranquilo_pct: pct(resp.filter((x) => MARCA.acolhedor.test(fold(x))).length, resp.length),
    marca_propria_pct: pct(resp.filter((x) => MARCA[pid].test(pid === "durao" || pid === "durona" ? x : fold(x))).length, resp.length),
    palavras_por_resposta: palavras.length ? Math.round((10 * palavras.reduce((a, b) => a + b, 0)) / palavras.length) / 10 : 0,
    kkkk_pct: pct(resp.filter((x) => /k{3,}/i.test(x)).length, resp.length),
    agora_mais_verbo_pct: pct(resp.filter((x) => AGORA.test(fold(x))).length, resp.length),
    mandou_bem_conversas: convs.filter((c) => c.turnos.some((t) => t.papel === "professor" && /mandou (?:muito |super )?bem/.test(fold(t.texto)))).length,
    me_conta_conversas: convs.filter((c) => c.turnos.some((t) => t.papel === "professor" && /\bme conta\b/.test(fold(t.texto)))).length,
    chave_de_ouro_conversas: convs.filter((c) => c.turnos.some((t) => t.papel === "professor" && /chave de ouro/.test(fold(t.texto)))).length,
    humor_antes_da_fala: neutro(humorAntes), humor_depois_da_fala: neutro(humorDepois),
    reserva_dado_sem_fonte_identica: reservaDado, respostas_substituidas: substituidas,
    aberturas_e_passagens: fixas.length, criadas_pela_ia: geradas.length, criadas_pela_ia_pct: pct(geradas.length, fixas.length),
    preparadas: fixas.filter((x) => x.origem === "preparada").length,
    cita_periodo_pct: pct(geradas.filter((x) => PERIODO.test(fold(x.texto))).length, geradas.length),
    meta_ou_gabaritar: geradas.filter((x) => META.test(fold(x.texto))).length,
    humor_anunciado: geradas.filter((x) => HUMOR_ANUNC.test(fold(x.texto))).map((x) => `${x.arq}: ${x.texto.slice(0, 90)}`),
    da_uma_olhada: geradas.filter((x) => OLHADA.test(fold(x.texto))).length,
    estrutura_repetida_pares_pct: pct(paresEstr, paresTot), estrutura_repetida_mesmo_aluno: `${paresAluno}/${paresAlunoTot}`,
    passado_inventado_na_primeira_conversa: `${passadoInventado}/${primeiras}`,
    abertura_ms: ms.length ? { p50: q(ms.map((x) => x.ms), 0.5), p95: q(ms.map((x) => x.ms), 0.95), max: Math.max(...ms.map((x) => x.ms)), pedidos: ms.length, trocou_pct: pct(ms.filter((x) => x.trocou).length, ms.length) } : null,
    tokens_por_chamada_do_professor: prof.n ? Math.round(prof.e / prof.n) : 0,
    custo_medio_usd: convs.length ? Math.round((10000 * convs.reduce((s, c) => s + c.custo.usd, 0)) / convs.length) / 10000 : 0,
  };
}

// ------------------------------------------------------------------------------------------------ juiz cego
const DESCRICAO = `As 4 personalidades de um professor de medicina de um app de estudos (falam português do Brasil):
- Durão: o Stazi (masculino), preceptor escrachado, exigente, impaciente, sarcástico, pode gritar e falar palavrão sobre a situação.
- Tranquilo: o Stazi (masculino), descontraído e preguiçoso de brincadeira: faz charme de que explicar dá trabalho, fala pouco, devolve a pergunta para o aluno pensar primeiro.
- Durona: a Stazia (feminino), preceptora escrachada, exigente, impaciente, sarcástica, pode gritar e falar palavrão sobre a situação.
- Tranquila: a Stazia (feminino), calma, acolhedora, sem pressa, firme com carinho, sem palavrão.`;
async function juizCego(regs, rotulo) {
  const env = lerEnv(VERTEX_ENV);
  const key = process.env.VERTEX_API_KEY || env.VERTEX_API_KEY;
  if (!key) throw new Error("VERTEX_API_KEY ausente");
  const base = process.env.VERTEX_API_BASE || env.VERTEX_API_BASE || "https://aiplatform.googleapis.com/v1/publishers/google/models";
  const amostra = [];
  for (const pid of IDS) {
    const falas = regs.filter((r) => r.personalidade === pid).flatMap((c) => c.turnos.filter((t) => t.papel === "professor" && (t.tipo === "resposta" || t.tipo === "reacao")).map((t) => t.texto));
    const h = (s) => crypto.createHash("sha1").update(`${rotulo}:${s}`).digest("hex");
    amostra.push(...falas.sort((a, b) => (h(a) < h(b) ? -1 : 1)).slice(0, 15).map((texto) => ({ pid, texto })));
  }
  const ordem = amostra.sort((a, b) => (crypto.createHash("sha1").update(a.texto).digest("hex") < crypto.createHash("sha1").update(b.texto).digest("hex") ? -1 : 1));
  const respostas = [];
  for (let i = 0; i < ordem.length; i += 10) {
    const lote = ordem.slice(i, i + 10);
    const prompt = `${DESCRICAO}\n\nPara CADA fala abaixo, diga qual das 4 disse (pelo jeito de falar). Responda só JSON: {"respostas":["Durão"|"Tranquilo"|"Durona"|"Tranquila", ...]} na ordem.\n\n${lote.map((x, k) => `[${k + 1}] ${x.texto}`).join("\n")}`;
    const r = await fetch(`${base}/gemini-3.8-flash:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 400, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } } }),
    });
    const d = await r.json().catch(() => ({}));
    const txt = (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    let lista = [];
    try { lista = JSON.parse(txt).respostas ?? []; } catch { /* lote perdido */ }
    lote.forEach((x, k) => respostas.push({ ...x, palpite: lista[k] ?? null }));
  }
  const por = {};
  for (const pid of IDS) {
    const meus = respostas.filter((x) => x.pid === pid && x.palpite);
    por[NOMES[pid]] = { falas: meus.length, acerto_pct: pct(meus.filter((x) => x.palpite === NOMES[pid]).length, meus.length), palpites: meus.reduce((o, x) => ({ ...o, [x.palpite]: (o[x.palpite] ?? 0) + 1 }), {}) };
  }
  // Tranquilo contra Tranquila: só as falas dos dois, palpite entre os dois
  const calmos = respostas.filter((x) => (x.pid === "acolhedor" || x.pid === "tranquila") && (x.palpite === "Tranquilo" || x.palpite === "Tranquila"));
  return { por_personalidade: por, tranquilo_x_tranquila_acerto_pct: pct(calmos.filter((x) => x.palpite === NOMES[x.pid]).length, calmos.length), falas_julgadas: respostas.length };
}

const out = { quando: new Date().toISOString(), pastas: {} };
for (const pasta of PASTAS) {
  const regs = carregar(pasta);
  if (!regs.length) { console.log(`(sem conversas em ${pasta})`); continue; }
  const pids = IDS.filter((pid) => regs.some((r) => r.personalidade === pid));
  out.pastas[pasta] = { conversas: regs.length, por_personalidade: Object.fromEntries(pids.map((pid) => [pid, medir(regs, pid)])) };
  if (JUIZ_CEGO && pids.length === 4) out.pastas[pasta].juiz_cego = await juizCego(regs, pasta);
  console.log(`\n##### ${pasta} (${regs.length} conversas)`);
  for (const pid of pids) {
    const r = out.pastas[pasta].por_personalidade[pid];
    console.log(`${r.nome}: apelidos ${r.apelidos_no_texto_final} (barradas por ataque ${r.respostas_barradas_por_ataque_pessoal}) · palavras ${r.palavras_por_resposta} · marca Tranquilo ${r.marca_tranquilo_pct}% · marca própria ${r.marca_propria_pct}% · kkkk ${r.kkkk_pct}% · agora+verbo ${r.agora_mais_verbo_pct}% · humor fora de neutral ${r.humor_antes_da_fala.fora_de_neutral_pct}%/${r.humor_depois_da_fala.fora_de_neutral_pct}% · reserva dado ${r.reserva_dado_sem_fonte_identica}`);
    console.log(`   aberturas/passagens IA ${r.criadas_pela_ia}/${r.aberturas_e_passagens} (preparadas ${r.preparadas}) · período ${r.cita_periodo_pct}% · meta ${r.meta_ou_gabaritar} · humor anunciado ${r.humor_anunciado.length} · olhada ${r.da_uma_olhada} · estrutura ${r.estrutura_repetida_pares_pct}% (mesmo aluno ${r.estrutura_repetida_mesmo_aluno}) · passado inventado ${r.passado_inventado_na_primeira_conversa} · abertura ${JSON.stringify(r.abertura_ms)} · tokens/chamada ${r.tokens_por_chamada_do_professor} · US$/conversa ${r.custo_medio_usd}`);
  }
  if (out.pastas[pasta].juiz_cego) console.log(`   juiz cego: ${JSON.stringify(out.pastas[pasta].juiz_cego)}`);
}
fs.writeFileSync(SAIDA, JSON.stringify(out, null, 2));
console.log(`\nmedidas em ${SAIDA}`);
