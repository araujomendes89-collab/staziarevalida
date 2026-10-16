// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  canonico,
  Doc,
  ehSimples,
  escrever,
  hrefValido,
  htmlInline,
  inlineParaHtml,
  ler,
  lerInline,
  Marca,
  Modo,
  NoBloco,
  NoInline,
  NoItem,
  NoLinha,
  NoParagrafo,
  NoTabela,
  NoTexto,
  textoPuro,
} from "../shared/textoRico";

describe("Codec de Texto Rico (texto com marcas)", () => {
  // ===========================================================================
  // 1. Texto simples sem marcas
  // ===========================================================================
  describe("1. Texto simples sem marcas", () => {
    it("preserva parágrafos separados por dupla quebra de linha no modo documento", () => {
      const s = "Primeiro parágrafo de texto simples.\n\nSegundo parágrafo com mais detalhes médicos.\n\nTerceiro parágrafo de conduta.";
      expect(escrever(ler(s, "documento"), "documento")).toBe(s);
    });

    it("preserva quebra de linha simples dentro do parágrafo nos modos documento e linha", () => {
      const s = "Linha um do mesmo parágrafo\nLinha dois continuando o raciocínio";
      expect(escrever(ler(s, "documento"), "documento")).toBe(s);
      expect(escrever(ler(s, "linha"), "linha")).toBe(s);
    });

    it("preserva textos médicos com operadores matemáticos e pontuações: PA ≥ 140 x 90, < 92 mg/dL, >2 cm", () => {
      const textos = [
        "PA ≥ 140 x 90",
        "< 92 mg/dL",
        ">2 cm",
        "Glicemia de jejum < 92 mg/dL e PA ≥ 140 x 90 mmHg",
        "Lesão nodular ulcerada medindo >2 cm em diâmetro",
      ];

      for (const t of textos) {
        expect(escrever(ler(t, "documento"), "documento")).toBe(t);
        expect(escrever(ler(t, "linha"), "linha")).toBe(t);
        expect(escrever(ler(t, "pontos"), "pontos")).toBe(t);
      }
    });

    it("preserva acentuação e caracteres especiais da língua portuguesa", () => {
      const s = "Atenção: diagnóstico clínico de infecção respiratória aguda com febre aferida, dispneia e prostração!";
      expect(escrever(ler(s, "documento"), "documento")).toBe(s);
      expect(escrever(ler(s, "linha"), "linha")).toBe(s);
      expect(escrever(ler(s, "pontos"), "pontos")).toBe(s);
    });

    it("preserva quebra simples com título e texto: Bloco 1 · Diagnóstico\\nTexto", () => {
      const s = "Bloco 1 · Diagnóstico\nTexto";
      expect(escrever(ler(s, "documento"), "documento")).toBe(s);
      expect(escrever(ler(s, "linha"), "linha")).toBe(s);
    });

    it("preserva pontos no modo pontos (linhas separadas por \\n)", () => {
      const s = "Ponto 1: Anamnese e história pregressa\nPonto 2: Exame físico segmentar\nPonto 3: Hipóteses e plano terapêutico";
      expect(escrever(ler(s, "pontos"), "pontos")).toBe(s);
    });
  });

  // ===========================================================================
  // 2. Marcas inline e escapes
  // ===========================================================================
  describe("2. Marcas inline e escapes", () => {
    it("reconhece negrito, itálico, sublinhado e link https com ida e volta correta", () => {
      expect(escrever(ler("**negrito**", "linha"), "linha")).toBe("**negrito**");
      expect(escrever(ler("*itálico*", "linha"), "linha")).toBe("*itálico*");
      expect(escrever(ler("<u>sublinhado</u>", "linha"), "linha")).toBe("<u>sublinhado</u>");
      expect(escrever(ler("[portal](https://saude.gov.br)", "linha"), "linha")).toBe("[portal](https://saude.gov.br)");

      const docNegrito = ler("**negrito**", "linha");
      expect(docNegrito.content[0].type).toBe("paragraph");
      const textoB = (docNegrito.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(textoB.text).toBe("negrito");
      expect(textoB.marks).toEqual([{ type: "bold" }]);

      const docItalico = ler("*itálico*", "linha");
      const textoI = (docItalico.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(textoI.text).toBe("itálico");
      expect(textoI.marks).toEqual([{ type: "italic" }]);

      const docSublinhado = ler("<u>sublinhado</u>", "linha");
      const textoU = (docSublinhado.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(textoU.text).toBe("sublinhado");
      expect(textoU.marks).toEqual([{ type: "underline" }]);

      const docLink = ler("[portal](https://saude.gov.br)", "linha");
      const textoL = (docLink.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(textoL.text).toBe("portal");
      expect(textoL.marks).toEqual([{ type: "link", attrs: { href: "https://saude.gov.br" } }]);
    });

    it("suporta combinações: negrito+itálico e link com negrito dentro", () => {
      const ni = "***negrito e itálico***";
      expect(escrever(ler(ni, "linha"), "linha")).toBe(ni);
      const docNI = ler(ni, "linha");
      const textoNI = (docNI.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(textoNI.text).toBe("negrito e itálico");
      expect(textoNI.marks).toEqual([{ type: "bold" }, { type: "italic" }]);

      const ln = "[**diretriz importante**](https://revalida.org)";
      expect(escrever(ler(ln, "linha"), "linha")).toBe(ln);
      const docLN = ler(ln, "linha");
      const textoLN = (docLN.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(textoLN.text).toBe("diretriz importante");
      expect(textoLN.marks).toEqual([
        { type: "link", attrs: { href: "https://revalida.org" } },
        { type: "bold" },
      ]);
    });

    it("mantém espaços nas bordas fora dos delimitadores de marcação", () => {
      // Documento criado com espaços dentro do texto marcado
      const doc: Doc = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "início " },
              { type: "text", text: " negrito ", marks: [{ type: "bold" }] },
              { type: "text", text: " fim" },
            ],
          },
        ],
      };
      const escrito = escrever(doc, "linha");
      // Os espaços nas bordas devem ficar FORA de **:
      // "início " (1 espaço) + espaço antes de "negrito" (1 espaço) = 2 espaços
      // espaço depois de "negrito" (1 espaço) + " fim" (1 espaço) = 2 espaços
      expect(escrito).toBe("início  **negrito**  fim");

      // No parsing, espaços internos imediatos impedem a marcação de negrito/itálico
      const textoComEspacos = "** texto **";
      const docLiteral = ler(textoComEspacos, "linha");
      const inlineLiteral = (docLiteral.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(inlineLiteral.text).toBe("** texto **");
      expect(inlineLiteral.marks).toBeUndefined();
    });

    it("trata escapes corretamente: \\*, \\\\, \\[, \\<u>", () => {
      expect(escrever(ler("\\*", "linha"), "linha")).toBe("\\*");
      expect(escrever(ler("\\\\", "linha"), "linha")).toBe("\\\\");
      // "[" sozinho não abre link: a forma gravada (canônica) não precisa da contrabarra, e ler de novo dá o mesmo texto
      expect(escrever(ler("\\[", "linha"), "linha")).toBe("[");
      expect(((ler("[", "linha").content[0] as NoParagrafo).content?.[0] as NoTexto).text).toBe("[");
      // mas "[a](https://x.br)" escrito como texto literal não pode virar link ao ser lido de novo
      expect(canonico(escrever(ler("\\[a](https://x.br)", "linha"), "linha"), "linha")).toBe(escrever(ler("\\[a](https://x.br)", "linha"), "linha"));
      expect(((ler(escrever(ler("\\[a](https://x.br)", "linha"), "linha"), "linha").content[0] as NoParagrafo).content?.[0] as NoTexto).marks).toBeUndefined();
      expect(escrever(ler("\\<u>", "linha"), "linha")).toBe("\\<u>");

      // Garante que o caractere escapado não vira marca na AST
      const docAsterisco = ler("\\*", "linha");
      const tAsterisco = (docAsterisco.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(tAsterisco.text).toBe("*");
      expect(tAsterisco.marks).toBeUndefined();

      const docU = ler("\\<u>", "linha");
      const tU = (docU.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(tU.text).toBe("<u>");
      expect(tU.marks).toBeUndefined();
    });

    it("trata escapes no começo de linha: '1\\. x', '\\- x', '\\> x', '\\## x'", () => {
      expect(escrever(ler("\\- x", "documento"), "documento")).toBe("\\- x");
      expect(escrever(ler("\\> x", "documento"), "documento")).toBe("\\> x");
      expect(escrever(ler("\\## x", "documento"), "documento")).toBe("\\## x");

      const docTraco = ler("\\- x", "documento");
      expect(docTraco.content[0].type).toBe("paragraph");

      const docCit = ler("\\> x", "documento");
      expect(docCit.content[0].type).toBe("paragraph");

      const docTit = ler("\\## x", "documento");
      expect(docTit.content[0].type).toBe("paragraph");

      // Escapes de lista numerada no início de linha
      const docNum1 = ler("1\\. x", "documento");
      expect(docNum1.content[0].type).toBe("paragraph");

      const docNum2 = ler("\\1. x", "documento");
      expect(docNum2.content[0].type).toBe("paragraph");
      expect(escrever(docNum2, "documento")).toBe("\\1. x");
    });

    it("mantém asterisco solto literal sem transformar em itálico", () => {
      const s = "2 * 3 = 6";
      const doc = ler(s, "linha");
      const t = (doc.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(t.marks).toBeUndefined();

      const s2 = "olá * mundo";
      const doc2 = ler(s2, "linha");
      const t2 = (doc2.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(t2.marks).toBeUndefined();
    });

    it("mantém '**' sem fechamento como texto literal", () => {
      const s = "**sem fechamento";
      const doc = ler(s, "linha");
      const t = (doc.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(t.text).toBe("**sem fechamento");
      expect(t.marks).toBeUndefined();
    });

    it("mantém '<u>' sem fechar como texto literal", () => {
      const s = "<u>sem fechar";
      const doc = ler(s, "linha");
      const t = (doc.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(t.text).toBe("<u>sem fechar");
      expect(t.marks).toBeUndefined();
    });
  });

  // ===========================================================================
  // 3. Blocos (modo documento)
  // ===========================================================================
  describe("3. Blocos (modo documento)", () => {
    it("reconhece títulos ## e ### com ida e volta correta", () => {
      const h2 = "## Título Principal";
      const docH2 = ler(h2, "documento");
      expect(docH2.content[0].type).toBe("heading");
      expect((docH2.content[0] as any).attrs.level).toBe(2);
      expect(escrever(docH2, "documento")).toBe(h2);

      const h3 = "### Subtítulo de Apoio";
      const docH3 = ler(h3, "documento");
      expect(docH3.content[0].type).toBe("heading");
      expect((docH3.content[0] as any).attrs.level).toBe(3);
      expect(escrever(docH3, "documento")).toBe(h3);
    });

    it("reconhece lista não-ordenada com '- ' com ida e volta", () => {
      const lista = "- Primeiro item\n- Segundo item\n- Terceiro item";
      const doc = ler(lista, "documento");
      expect(doc.content[0].type).toBe("bulletList");
      expect((doc.content[0] as any).content.length).toBe(3);
      expect(escrever(doc, "documento")).toBe(lista);
    });

    it("reconhece lista numerada com '1. ' com ida e volta", () => {
      const lista = "1. Primeiro passo\n2. Segundo passo\n3. Terceiro passo";
      const doc = ler(lista, "documento");
      expect(doc.content[0].type).toBe("orderedList");
      expect((doc.content[0] as any).attrs.start).toBe(1);
      expect((doc.content[0] as any).content.length).toBe(3);
      expect(escrever(doc, "documento")).toBe(lista);
    });

    it("reconhece citação com '> ' com ida e volta", () => {
      const citacao = "> Primeira linha de citação\n> Segunda linha da citação";
      const doc = ler(citacao, "documento");
      expect(doc.content[0].type).toBe("blockquote");
      expect(escrever(doc, "documento")).toBe(citacao);
    });

    it("reconhece tabela GFM (cabeçalho + linha ---) com ida e volta", () => {
      const tabela = "| Parâmetro | Referência |\n| --- | --- |\n| Hb | 12 a 16 g/dL |\n| Leucócitos | 4.000 a 10.000 |";
      const doc = ler(tabela, "documento");
      expect(doc.content[0].type).toBe("table");
      const linhas = (doc.content[0] as any).content;
      expect(linhas.length).toBe(3);
      expect(linhas[0].content[0].type).toBe("tableHeader");
      expect(linhas[1].content[0].type).toBe("tableCell");
      expect(escrever(doc, "documento")).toBe(tabela);
    });

    it("trata '# um' e '#### quatro' como texto comum de parágrafo", () => {
      const texto = "# um\n\n#### quatro";
      const doc = ler(texto, "documento");
      expect(doc.content[0].type).toBe("paragraph");
      expect(doc.content[1].type).toBe("paragraph");
      expect(escrever(doc, "documento")).toBe(texto);
    });

    it("trata '-x' e '>2 cm' no começo da linha como texto comum", () => {
      const texto = "-x não vira lista\n\n>2 cm não vira citação";
      const doc = ler(texto, "documento");
      expect(doc.content[0].type).toBe("paragraph");
      expect(doc.content[1].type).toBe("paragraph");
      expect(escrever(doc, "documento")).toBe(texto);
    });

    it("não transforma linha com '- ' em lista dentro do modo linha", () => {
      const texto = "- Item em modo linha";
      const doc = ler(texto, "linha");
      expect(doc.content[0].type).toBe("paragraph");
      expect(escrever(doc, "linha")).toBe(texto);
    });
  });

  // ===========================================================================
  // 4. Segurança
  // ===========================================================================
  describe("4. Segurança", () => {
    it("hrefValido rejeita esquemas inseguros, caracteres proibidos e valores não-string", () => {
      expect(hrefValido("javascript:alert(1)")).toBe(false);
      expect(hrefValido("javascript:void(0)")).toBe(false);
      expect(hrefValido("http://inseguro.org")).toBe(false);
      expect(hrefValido("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
      expect(hrefValido("ftp://servidor.com")).toBe(false);
      expect(hrefValido("https://site.com/ com espaco")).toBe(false);
      expect(hrefValido('https://site.com/"aspas"')).toBe(false);
      expect(hrefValido("https://site.com/(parenteses)")).toBe(false);
      expect(hrefValido("https://site.com/<tag>")).toBe(false);
      expect(hrefValido("https://site.com/>tag<")).toBe(false);
      expect(hrefValido("https://site.com/barra\\inversa")).toBe(false);
      expect(hrefValido("")).toBe(false);
      expect(hrefValido(null)).toBe(false);
      expect(hrefValido(undefined)).toBe(false);
      expect(hrefValido(12345)).toBe(false);
      expect(hrefValido({})).toBe(false);

      expect(hrefValido("https://x.gov.br/a")).toBe(true);
      expect(hrefValido("https://revalida.inep.gov.br/edital/2026")).toBe(true);
    });

    it("[x](javascript:alert(1)) não vira link e fica texto puro", () => {
      const s = "[x](javascript:alert(1))";
      const doc = ler(s, "linha");
      const no = (doc.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(no.text).toBe(s);
      expect(no.marks).toBeUndefined();
    });

    it("<script>alert(1)</script> fica como texto e htmlInline devolve &lt;script&gt;", () => {
      const xss = "<script>alert(1)</script>";
      const doc = ler(xss, "linha");
      const no = (doc.content[0] as NoParagrafo).content?.[0] as NoTexto;
      expect(no.text).toBe(xss);
      expect(htmlInline(xss)).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    });

    it("htmlInline com negrito, sublinhado e link seguro devolve tags esperadas com atributos de segurança", () => {
      const entrada = "**a** <u>b</u> [c](https://x.gov.br/a)";
      const esperado = '<strong>a</strong> <u>b</u> <a href="https://x.gov.br/a" rel="noopener noreferrer nofollow">c</a>';
      expect(htmlInline(entrada)).toBe(esperado);
    });

    it("link com href inválido no documento escrito não gera sintaxe de link markdown", () => {
      const docComLinkInvalido: Doc = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "link suspeito",
                marks: [{ type: "link", attrs: { href: "javascript:alert('ataque')" } }],
              },
            ],
          },
        ],
      };

      const textoEscrito = escrever(docComLinkInvalido, "linha");
      expect(textoEscrito).toBe("link suspeito");
      expect(textoEscrito).not.toContain("javascript:");
      expect(textoEscrito).not.toContain("[");
      expect(textoEscrito).not.toContain("]");
    });
  });

  // ===========================================================================
  // 5. Estabilidade e Fuzzing
  // ===========================================================================
  describe("5. Estabilidade e Fuzzing", () => {
    // "textoPuro com marcas tiradas comparando sem espaços/quebras":
    // Remove marcadores de bloco (- , 1. , > ) que textoPuro emite para listas/citações,
    // além de remover quebras de linha e espaços em branco.
    const semMarcasEEspacos = (t: string) =>
      t
        .replace(/^\s*[-*]\s*|\d+[.)]\s*/gm, "")
        .replace(/^\s*>\s*/gm, "")
        .replace(/\s+/g, "");

    const textosDificeis: string[] = [
      "*",
      "**",
      "***",
      "****",
      "\\*",
      "\\\\",
      "\\[",
      "\\]",
      "\\(",
      "\\)",
      "\\<",
      "\\<u>",
      "\\<u>teste\\</u>",
      "<u>sem fechar",
      "**sem fechar",
      "*sem fechar",
      "** **",
      "* *",
      "[texto](javascript:alert(1))",
      "[texto](https://)",
      "[texto sem fechar",
      "[texto](invalido)",
      "1. x",
      "\\1. x",
      "- x",
      "\\- x",
      "> x",
      "\\> x",
      "## x",
      "\\## x",
      "### x",
      "| a | b |",
      "| a | b |\n| --- | --- |\n| 1 | 2 |",
      "PA ≥ 140 x 90 e glicemia < 92 mg/dL",
      ">2 cm no maior diâmetro",
      "-x é variável",
      "texto com *asterisco* e **negrito** e <u>sublinhado</u> e [link](https://revalida.org)",
      "**negrito *e itálico* dentro**",
      "***negrito e itálico***",
      "[**link em negrito**](https://revalida.org)",
      "espaço no início e fim: ** bold ** * italic *",
      "combinação: \\*\\*nao bold\\*\\* e \\<u\\>nao sub\\</u\\>",
      "1. um\n2. dois\n\n- a\n- b\n\n> citacao",
      "| a | b |\n| --- |\n| 1 |",
      "<script>alert('xss')</script>",
    ];

    it("idempotência e preservação de texto em lista de ~40 textos difíceis nos 3 modos", () => {
      const modos: Modo[] = ["documento", "linha", "pontos"];
      for (const s of textosDificeis) {
        for (const m of modos) {
          const c1 = canonico(s, m);
          const c2 = canonico(c1, m);
          expect(c2).toBe(c1);

          const puroC1 = textoPuro(c1, m);
          const puroS = textoPuro(s, m);
          expect(semMarcasEEspacos(puroC1)).toBe(semMarcasEEspacos(puroS));
        }
      }
    });

    it("fuzzing com 3000 textos pseudoaleatórios com semente fixa: idempotência e integridade do texto puro", () => {
      // Gerador pseudoaleatório Mulberry32 determinístico
      function criarRng(seed: number) {
        let s = seed >>> 0;
        return function () {
          s = (s + 0x6d2b79f5) >>> 0;
          let t = Math.imul(s ^ (s >>> 15), 1 | s);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }

      const rng = criarRng(42);
      const alfabeto = [
        "a", "b", "c", "d", "e", "f", "x", "z", "A", "B",
        " ", "\n",
        "*", "_", "\\", "[", "]", "(", ")", "<", ">", "#", "-", "|", ".", "1",
        "u", "/", "h", "t", "p", "s", ":",
        "**", "<u>", "</u>", "](", "https://x.br",
      ];

      function gerarTextoAleatorio(tamanhoMin = 1, tamanhoMax = 25): string {
        const len = Math.floor(rng() * (tamanhoMax - tamanhoMin + 1)) + tamanhoMin;
        let res = "";
        for (let i = 0; i < len; i++) {
          const idx = Math.floor(rng() * alfabeto.length);
          res += alfabeto[idx];
        }
        return res;
      }

      const modos: Modo[] = ["documento", "linha", "pontos"];
      for (let i = 0; i < 3000; i++) {
        const s = gerarTextoAleatorio();
        for (const m of modos) {
          const c1 = canonico(s, m);
          const c2 = canonico(c1, m);
          expect(c2).toBe(c1);

          const puroC1 = textoPuro(c1, m);
          const puroS = textoPuro(s, m);
          expect(semMarcasEEspacos(puroC1)).toBe(semMarcasEEspacos(puroS));
        }
      }
    });

    it("documentos estruturados aleatórios mantêm caracteres não-espaço e marcas após escrever e ler", () => {
      function criarRng(seed: number) {
        let s = seed >>> 0;
        return function () {
          s = (s + 0x6d2b79f5) >>> 0;
          let t = Math.imul(s ^ (s >>> 15), 1 | s);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }

      const rng = criarRng(999);
      const palavras = ["clinica", "medica", "cirurgia", "pediatria", "ginecologia", "preventiva", "febre", "tosse", "dor", "edema"];

      function gerarMarcas(): Marca[] {
        const marcas: Marca[] = [];
        if (rng() < 0.3) marcas.push({ type: "bold" });
        if (rng() < 0.2) marcas.push({ type: "italic" });
        if (rng() < 0.2) marcas.push({ type: "underline" });
        if (rng() < 0.15) marcas.push({ type: "link", attrs: { href: "https://x.br/fonte" } });
        return marcas;
      }

      function gerarInlines(qtd = 4): NoInline[] {
        const nos: NoInline[] = [];
        for (let i = 0; i < qtd; i++) {
          if (rng() < 0.15 && i > 0 && i < qtd - 1) {
            nos.push({ type: "hardBreak" });
          } else {
            const palavra = palavras[Math.floor(rng() * palavras.length)];
            const marcas = gerarMarcas();
            nos.push(marcas.length ? { type: "text", text: palavra, marks: marcas } : { type: "text", text: palavra });
          }
        }
        return nos;
      }

      function gerarParagrafo(): NoParagrafo {
        return { type: "paragraph", content: gerarInlines(3 + Math.floor(rng() * 4)) };
      }

      function gerarDocAleatorio(): Doc {
        const blocos: NoBloco[] = [];
        const qtdBlocos = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < qtdBlocos; i++) {
          const tipo = rng();
          if (tipo < 0.3) {
            blocos.push(gerarParagrafo());
          } else if (tipo < 0.45) {
            blocos.push({
              type: "heading",
              attrs: { level: rng() < 0.5 ? 2 : 3 },
              content: [{ type: "text", text: palavras[Math.floor(rng() * palavras.length)] }],
            });
          } else if (tipo < 0.65) {
            const itens: NoItem[] = [
              { type: "listItem", content: [gerarParagrafo()] },
              { type: "listItem", content: [gerarParagrafo()] },
            ];
            blocos.push(rng() < 0.5 ? { type: "bulletList", content: itens } : { type: "orderedList", attrs: { start: 1 }, content: itens });
          } else if (tipo < 0.8) {
            blocos.push({ type: "blockquote", content: [gerarParagrafo()] });
          } else {
            const tabela: NoTabela = {
              type: "table",
              content: [
                {
                  type: "tableRow",
                  content: [
                    { type: "tableHeader", content: [gerarParagrafo()] },
                    { type: "tableHeader", content: [gerarParagrafo()] },
                  ],
                },
                {
                  type: "tableRow",
                  content: [
                    { type: "tableCell", content: [gerarParagrafo()] },
                    { type: "tableCell", content: [gerarParagrafo()] },
                  ],
                },
              ],
            };
            blocos.push(tabela);
          }
        }
        return { type: "doc", content: blocos };
      }

      type CharComMarcas = { char: string; marks: string[] };

      function extrairCaracteresComMarcas(doc: Doc): CharComMarcas[] {
        const resultado: CharComMarcas[] = [];
        function processarInlines(inlines?: NoInline[]) {
          for (const n of inlines ?? []) {
            if (n.type === "text") {
              const tiposMarcas = (n.marks ?? []).map((m) => m.type).sort();
              for (const ch of n.text) {
                if (!/\s/.test(ch)) {
                  resultado.push({ char: ch, marks: tiposMarcas });
                }
              }
            }
          }
        }

        function processarBloco(b: NoBloco) {
          if (b.type === "paragraph" || b.type === "heading") {
            processarInlines(b.content);
          } else if (b.type === "bulletList" || b.type === "orderedList") {
            for (const item of b.content) {
              for (const p of item.content) {
                processarInlines(p.content);
              }
            }
          } else if (b.type === "blockquote") {
            for (const p of b.content) {
              processarInlines(p.content);
            }
          } else if (b.type === "table") {
            for (const row of b.content) {
              for (const cel of row.content) {
                for (const p of cel.content) {
                  processarInlines(p.content);
                }
              }
            }
          }
        }

        for (const b of doc.content) {
          processarBloco(b);
        }
        return resultado;
      }

      for (let i = 0; i < 60; i++) {
        const docOriginal = gerarDocAleatorio();
        const textoEscrito = escrever(docOriginal, "documento");
        const docReconstruido = ler(textoEscrito, "documento");

        const chars1 = extrairCaracteresComMarcas(docOriginal);
        const chars2 = extrairCaracteresComMarcas(docReconstruido);

        expect(chars2).toEqual(chars1);
      }
    });
  });

  // ===========================================================================
  // 6. ehSimples
  // ===========================================================================
  describe("6. ehSimples", () => {
    it("devolve true para texto antigo sem marcas", () => {
      expect(ehSimples("Texto simples sem marcas")).toBe(true);
      expect(ehSimples("Paciente de 45 anos com febre e tosse produtiva")).toBe(true);
      expect(ehSimples("Pressão arterial 120 x 80 mmHg")).toBe(true);
      expect(ehSimples("Primeiro parágrafo.\n\nSegundo parágrafo.")).toBe(true);
      expect(ehSimples("Linha um\nLinha dois")).toBe(true);
      expect(ehSimples("Acentuação: coração, estômago, água")).toBe(true);
      expect(ehSimples("")).toBe(true);
      expect(ehSimples(null)).toBe(true);
      expect(ehSimples(undefined)).toBe(true);
    });

    it("devolve false para textos que contêm marcas inline ou de bloco", () => {
      expect(ehSimples("**x**")).toBe(false);
      expect(ehSimples("- a", "documento")).toBe(false);
      expect(ehSimples("> a", "documento")).toBe(false);
      expect(ehSimples("\\*")).toBe(false);
      expect(ehSimples("*itálico*")).toBe(false);
      expect(ehSimples("<u>sublinhado</u>")).toBe(false);
      expect(ehSimples("[link](https://revalida.org)")).toBe(false);
      expect(ehSimples("## Título", "documento")).toBe(false);
      expect(ehSimples("### Subtítulo", "documento")).toBe(false);
      expect(ehSimples("1. Item ordenado", "documento")).toBe(false);
      expect(ehSimples("| A | B |\n| --- | --- |\n| 1 | 2 |", "documento")).toBe(false);
    });
  });

  // ===========================================================================
  // 7. Validação com dados reais via TEXTO_RICO_DADOS
  // ===========================================================================
  describe("7. Validação com dados reais (TEXTO_RICO_DADOS)", () => {
    it.skipIf(!process.env.TEXTO_RICO_DADOS)(
      "confirma fidelidade perfeita para todos os textos reais do banco de dados quando TEXTO_RICO_DADOS está definida",
      () => {
        const pasta = process.env.TEXTO_RICO_DADOS!;
        const carregarJson = (arquivo: string) => {
          const caminho = path.join(pasta, arquivo);
          if (!fs.existsSync(caminho)) return null;
          return JSON.parse(fs.readFileSync(caminho, "utf-8"));
        };

        const lessonsData = carregarJson("lessons.json");
        if (lessonsData) {
          const lessons = Array.isArray(lessonsData) ? lessonsData : Object.values(lessonsData);
          for (const lesson of lessons as any[]) {
            if (lesson?.summary && typeof lesson.summary === "string") {
              const s = lesson.summary;
              expect(escrever(ler(s, "documento"), "documento")).toBe(s);
            }
            if (Array.isArray(lesson?.key_points)) {
              for (const kp of lesson.key_points) {
                if (typeof kp === "string") {
                  expect(escrever(ler(kp, "linha"), "linha")).toBe(kp);
                }
              }
            }
            if (lesson?.title && typeof lesson.title === "string") {
              expect(escrever(ler(lesson.title, "linha"), "linha")).toBe(lesson.title);
            }
          }
        }

        const unitsData = carregarJson("units.json");
        if (unitsData) {
          const units = Array.isArray(unitsData) ? unitsData : Object.values(unitsData);
          for (const unit of units as any[]) {
            const sections = unit?.content?.sections;
            if (Array.isArray(sections)) {
              for (const sec of sections) {
                if (sec?.heading && typeof sec.heading === "string") {
                  expect(escrever(ler(sec.heading, "linha"), "linha")).toBe(sec.heading);
                }
                if (Array.isArray(sec?.paragraphs)) {
                  for (const p of sec.paragraphs) {
                    if (p?.text && typeof p.text === "string") {
                      expect(escrever(ler(p.text, "linha"), "linha")).toBe(p.text);
                    }
                  }
                }
              }
            }
          }
        }

        const unitMaterialsData = carregarJson("unit_materials.json");
        if (unitMaterialsData) {
          const materials = Array.isArray(unitMaterialsData) ? unitMaterialsData : Object.values(unitMaterialsData);
          for (const mat of materials as any[]) {
            const sections = mat?.content?.sections;
            if (Array.isArray(sections)) {
              for (const sec of sections) {
                if (sec?.heading && typeof sec.heading === "string") {
                  expect(escrever(ler(sec.heading, "linha"), "linha")).toBe(sec.heading);
                }
                if (Array.isArray(sec?.paragraphs)) {
                  for (const p of sec.paragraphs) {
                    if (p?.text && typeof p.text === "string") {
                      expect(escrever(ler(p.text, "linha"), "linha")).toBe(p.text);
                    }
                  }
                }
              }
            }
          }
        }
      }
    );
  });
});
