// Lê o "para-o-revisor-medico.md" de uma aula e devolve a ficha do revisor médico em JSON (sem inventar nada: só separa o que está escrito).
//   { titulo, intro[], decisoes[{n, titulo, pergunta, como_esta, onde}], pontos[{n, texto, onde}], fixacao[], fora[], apresentacao[] }
// A decisão (de acordo / mudar) NÃO vem do arquivo: é do revisor, na Central. Texto preservado como no original (negrito de markdown vira **...**).

const celulas = (ln) => ln.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const tabela = (linhas) => linhas.filter((l) => l.trim().startsWith("|")).map(celulas).filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c))).slice(1);
const marcados = (linhas) => linhas.filter((l) => /^- /.test(l)).map((l) => l.replace(/^- /, "").trim());

export function lerFicha(texto) {
  const partes = texto.split(/^## /m);
  const cab = partes.shift().split("\n");
  const secao = (inicio) => (partes.find((p) => p.startsWith(inicio)) ?? "").split("\n").slice(1);
  const dec = tabela(secao("Decisões"));
  const decisoes = dec.map((c) => {
    const m = c[1].match(/^\*\*(.+?)\*\*\s*(.*)$/s);
    return { n: Number(c[0]), titulo: (m ? m[1] : c[1]).trim(), pergunta: (m ? m[2] : "").trim(), como_esta: c[2] ?? "", onde: c[3] ?? "" };
  });
  const pontos = tabela(secao("Pontos para conferir")).map((c) => ({ n: Number(c[0]), texto: c[1], onde: c[2] ?? "" }));
  const fixLinhas = secao("Questões de fixação");
  const ficha = {
    titulo: cab[0].replace(/^#\s*/, "").trim(),
    intro: cab.slice(1).filter((l) => l.trim() !== "").map((l) => l.trim()),
    decisoes,
    pontos,
    fixacao: marcados(fixLinhas),
    fixacao_instrucao: fixLinhas.find((l) => l.trim() !== "" && !/^- /.test(l))?.trim() ?? null,
    fora: marcados(secao("Fora da aula")),
    apresentacao: marcados(secao("Apresentação")),
  };
  if (!ficha.decisoes.length) throw new Error('A ficha não tem a seção "Decisões que são suas".');
  return ficha;
}
