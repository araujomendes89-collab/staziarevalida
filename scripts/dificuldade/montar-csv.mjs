// Junta Flash + Pro + conferência Claude em classificacao.csv (uma linha por questão).
import fs from "node:fs";
const D = "/Volumes/StaziaMed/.tmp-aulas/dificuldade";
const qs = JSON.parse(fs.readFileSync(`${D}/questoes.json`, "utf8"));
const ler = (dir) => { const m = {}; if (!fs.existsSync(dir)) return m; for (const fn of fs.readdirSync(dir)) for (const it of JSON.parse(fs.readFileSync(`${dir}/${fn}`)).itens) m[it.id] = it; return m; };
const flash = ler(`${D}/gemini-flash`), pro = ler(`${D}/gemini-pro`);
const conferidos = new Set(JSON.parse(fs.readFileSync(`${D}/conferencia/selecao-final.json`)).map((s) => s.id));
// Decisões do agente Claude (nota final; motivo próprio quando ajustou; confiança)
const decisao = {
  revalida_2021_1_q013: [3, "Encefalopatia hipertensiva/PRES; as outras alternativas caem por eliminação (normalizar PA em 2 h, tumor adrenal, trombose basilar)."],
  revalida_2021_1_q047: [3, "Diferenciar diretriz (regionalização) de princípio do SUS na PNAB 2017; pegadinha conhecida, mas recorrente."],
  revalida_2021_1_q066: [3, "Fatores de risco de câncer de mama e papel da RM; as alternativas erradas trazem erros conhecidos e caem por eliminação."],
  revalida_2022_1_q026: [3, "Dois passos: reconhecer IAM inferior com VD no ECG descrito e associar a hipotensão ao nitrato; distrator de choque cardiogênico plausível."],
  revalida_2023_1_q011: [2, "PTI grave com sangramento mucocutâneo sem sinais renais ou neurológicos; diferenciais (SHU, PTT) excluídos pelo quadro."],
  revalida_2023_2_q014: [3, "Terapia hormonal de menor risco em hipertensa com útero: estradiol transdérmico + progesterona micronizada; conceito conhecido."],
  revalida_2023_2_q084: [3, "Limitação da cardiotocografia antes de 28 semanas; as demais alternativas são claramente incorretas."],
  revalida_2025_1_q025: [3, "Saúde da população cigana; tema pouco visto, mas as alternativas erradas trazem estereótipos que se eliminam."],
  revalida_2025_2_q002: [3, "Associação clássica de raquitismo resistente à vitamina D com acidose tubular renal hiperclorêmica; distrator hipercalêmico."],
  revalida_2025_2_q004: [1, "Quadro clássico de endometriose (dismenorreia progressiva, dispareunia de profundidade, útero retrovertido); resposta quase direta.", "alta"],
  revalida_2026_1_q004: [4, "Interpretação de urocultura com baixa contagem em gestante assintomática; depende da tabela de exames e o gabarito foge da conduta intuitiva.", "baixa"],
  revalida_2026_1_q050: [3, "Contracepção com hipertensão grave e anticorpo antifosfolípide: só DIU de cobre; conceito de critérios de elegibilidade conhecido."],
  staziamed_q0011: [3, "Cálculo direto da razão de verossimilhança positiva a partir da tabela."],
  // Flash e Pro em faixas diferentes: decisão do Claude
  revalida_2020_1_q008: [3, null, "baixa"], revalida_2020_1_q023: [2], revalida_2020_1_q027: [3], revalida_2020_1_q033: [4],
  revalida_2020_1_q043: [4], revalida_2020_1_q048: [3], revalida_2020_1_q053: [2], revalida_2020_1_q068: [3],
  revalida_2021_1_q022: [2], revalida_2021_1_q030: [4], revalida_2021_1_q082: [4], revalida_2022_1_q052: [2],
  revalida_2022_1_q082: [3], revalida_2022_1_q096: [2], revalida_2022_2_q032: [3], revalida_2022_2_q038: [2], revalida_2022_2_q057: [2],
};
const faixa = (n) => (n <= 2 ? "facil" : n === 3 ? "media" : "dificil");
const csv = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const linhas = [["id", "code", "area", "topic", "origin", "gemini_flash", "gemini_pro", "motor", "nota_final", "faixa", "motivo", "confianca", "conferido_claude", "ajustado_claude", "modelo"].join(",")];
const dist = {}; let ajust = 0;
for (const q of qs) {
  const f = flash[q.id], p = pro[q.id], d = decisao[q.id];
  if (!f && !d) throw new Error(`sem classificação: ${q.id}`);
  let nota, motivo, conf;
  if (d) {
    nota = d[0];
    motivo = d[1] ?? (p && p.nota === nota ? p.motivo : f?.motivo);
    conf = d[2] ?? (f && nota !== f.nota ? "media" : f?.confianca ?? "media");
  } else if (p && faixa(p.nota) === faixa(f.nota)) { nota = p.nota; motivo = p.motivo; conf = p.confianca; }
  else { nota = f.nota; motivo = f.motivo; conf = f.confianca; }
  const conferido = conferidos.has(q.id) || !!d;
  const ajustado = !!d && (!f || nota !== f.nota);
  if (ajustado) ajust++;
  const modelo = [f && "gemini-3.8-flash", p && "gemini-3.1-pro-preview", conferido && "conferido claude-opus-5.5"].filter(Boolean).join(" + ");
  dist[nota] = (dist[nota] || 0) + 1;
  linhas.push([q.id, q.code, q.area, q.topic, q.origin, f?.nota, p?.nota, q.motor, nota, faixa(nota), String(motivo).slice(0, 600), conf, conferido, ajustado, modelo].map(csv).join(","));
}
fs.writeFileSync(`${D}/classificacao.csv`, linhas.join("\n") + "\n");
console.log("linhas", qs.length, "dist", dist, "ajustados pelo Claude", ajust, "conferidos", conferidos.size);
