import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  registrarNo,
  registrarMarca,
  registrarAtributo,
  cssSeguro,
  estiloReact,
  corCss,
  sanear,
  ehEnvelope,
  sanearEnvelope,
  textoDoBloco,
  textoDoDoc,
  blocoDeTexto,
  precisaRico,
  ricoValido,
  htmlDoDoc,
  unidadeParaDoc,
  docParaUnidade,
  envelope,
  Bloco,
  DocRico,
} from "../shared/docRico";
import { ler, escrever, inlineParaHtml } from "../shared/textoRico";

describe("docRico", () => {
  // -------------------------------------------------------------------------- 1. Registro
  describe("1. Registro", () => {
    it("lança erro ao registrar nó, marca ou atributo duplicado", () => {
      // Nó existente
      expect(() =>
        registrarNo({ nome: "paragraph", grupo: "bloco", conteudo: "inline" })
      ).toThrowError(/já registrado/);

      // Marca existente
      expect(() => registrarMarca({ nome: "bold", tag: "strong" })).toThrowError(
        /já registrada/
      );

      // Atributo existente
      expect(() =>
        registrarAtributo({
          alvo: "heading",
          nome: "level",
          sanear: (v) => v as any,
        })
      ).toThrowError(/já registrado/);
    });

    it("permite registrar atributo customizado e reflete no sanear e no html", () => {
      registrarAtributo({
        alvo: "paragraph",
        nome: "teste_cor",
        sanear: corCss(),
        css: (v) => ({ color: String(v) }),
      });

      const docBruto: DocRico = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { teste_cor: "#ff0000", ignorado: "invalido" },
            content: [{ type: "text", text: "Texto vermelho" }],
          },
        ],
      };

      const saneado = sanear(docBruto);
      expect(saneado.content[0].attrs).toEqual({ teste_cor: "#ff0000" });

      const html = htmlDoDoc(saneado);
      expect(html).toBe('<p style="color:#ff0000;">Texto vermelho</p>');
    });

    it("cssSeguro valida propriedades e valores estritamente", () => {
      // Recusa comandos perigosos, url, expression e pontuações indevidas
      expect(cssSeguro({ color: "url(javascript:alert(1))" })).toBe("");
      expect(cssSeguro({ color: "expression(alert(1))" })).toBe("");
      expect(cssSeguro({ color: "red; display: none" })).toBe("");
      expect(cssSeguro({ color: "red } body { background: black" })).toBe("");
      expect(cssSeguro({ "<script>": "red" })).toBe("");
      expect(cssSeguro({ "bad_key": "red" })).toBe("");

      // Aceita valores seguros e formatos CSS comuns
      expect(cssSeguro({ color: "#ff0000" })).toBe("color:#ff0000;");
      expect(cssSeguro({ color: "rgb(1,2,3)" })).toBe("color:rgb(1,2,3);");
      expect(cssSeguro({ color: "rgba(1, 2, 3, 0.5)" })).toBe("color:rgba(1, 2, 3, 0.5);");
      expect(cssSeguro({ "line-height": "1.5" })).toBe("line-height:1.5;");
      expect(cssSeguro({ "font-size": "12pt" })).toBe("font-size:12pt;");
      expect(cssSeguro({ color: "var(--ds-color-navy)" })).toBe("color:var(--ds-color-navy);");

      // estiloReact converte kebab-case para camelCase
      expect(
        estiloReact({
          "font-size": "12pt",
          "line-height": "1.5",
          color: "#ff0000",
        })
      ).toEqual({
        fontSize: "12pt",
        lineHeight: "1.5",
        color: "#ff0000",
      });
    });
  });

  // -------------------------------------------------------------------------- 2. Sanear
  describe("2. Sanear", () => {
    it("remove nós e marcas desconhecidos e sobe filhos com content", () => {
      const entrada = {
        type: "doc",
        content: [
          {
            type: "noInexistenteComFilhos",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Conteúdo preservado",
                    marks: [{ type: "marcaDesconhecida" }],
                  },
                ],
              },
            ],
          },
          {
            type: "noInexistenteSemFilhos",
          },
        ],
      };

      const res = sanear(entrada);
      expect(res.content.length).toBe(1);
      expect(res.content[0].type).toBe("paragraph");
      expect(res.content[0].content?.[0].text).toBe("Conteúdo preservado");
      expect(res.content[0].content?.[0].marks).toBeUndefined();
    });

    it("descarta links com protocolo javascript: ou formatos inválidos", () => {
      const entrada = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Link perigoso",
                marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              },
              {
                type: "text",
                text: "Link seguro",
                marks: [{ type: "link", attrs: { href: "https://staziamed.com.br" } }],
              },
            ],
          },
        ],
      };

      const res = sanear(entrada);
      const inlines = res.content[0].content!;
      expect(inlines[0].marks).toBeUndefined();
      expect(inlines[1].marks).toEqual([
        { type: "link", attrs: { href: "https://staziamed.com.br" } },
      ]);
    });

    it("elimina textos vazios e une textos vizinhos com mesmas marcas", () => {
      const entrada = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "" },
              { type: "text", text: "Parte 1 ", marks: [{ type: "bold" }] },
              { type: "text", text: "Parte 2", marks: [{ type: "bold" }] },
              { type: "text", text: " sem bold" },
            ],
          },
        ],
      };

      const res = sanear(entrada);
      expect(res.content[0].content).toEqual([
        { type: "text", text: "Parte 1 Parte 2", marks: [{ type: "bold" }] },
        { type: "text", text: " sem bold" },
      ]);
    });

    it("respeita limite de profundidade de 24 níveis", () => {
      let atual: any = { type: "paragraph", content: [{ type: "text", text: "Fundo" }] };
      for (let i = 0; i < 30; i++) {
        atual = { type: "blockquote", content: [atual] };
      }
      const docProfundo = { type: "doc", content: [atual] };
      const res = sanear(docProfundo);
      expect(res).toBeDefined();
      expect(res.type).toBe("doc");
    });

    it("sobe listItem solto fora de lista transformando em parágrafos", () => {
      const entrada = {
        type: "doc",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Item sem lista pai" }],
              },
            ],
          },
        ],
      };

      const res = sanear(entrada);
      expect(res.content.length).toBe(1);
      expect(res.content[0].type).toBe("paragraph");
      expect(res.content[0].content?.[0].text).toBe("Item sem lista pai");
    });
  });

  // -------------------------------------------------------------------------- 3. Projeção
  describe("3. Projeção", () => {
    it("projeta parágrafos com marcas de forma idêntica a escrever(ler(t, 'linha'), 'linha') em ~15 exemplos", () => {
      const exemplos = [
        "Texto simples sem marcas.",
        "Texto com **negrito** no meio.",
        "Texto com *itálico* no início e no fim.",
        "Texto com <u>sublinhado</u>.",
        "Combinação de **negrito e *itálico*** juntos.",
        "Link externo [StaziaMed](https://staziamed.com.br).",
        "Escape de asterisco: \\* não vira itálico.",
        "Escape de colchetes: \\[texto\\] e link [Real](https://inep.gov.br).",
        "Tags html escapadas: \\<u> e \\<br>.",
        "Parágrafo com quebra de linha\ne continuação.",
        "Múltiplos links [Primeiro](https://a.com) e [Segundo](https://b.com).",
        "Texto com caracteres acentuados: Olá, coração, 100% de eficácia.",
        "Sublinhado com negrito: <u>**importante**</u> para a prova.",
        "Contrabarra escapada \\\\ e texto normal.",
        "Várias quebras\nsegunda linha\nterceira linha.",
      ];

      for (const t of exemplos) {
        const bloco = blocoDeTexto(t);
        const proj = textoDoBloco(bloco);
        const canonicoLinha = escrever(ler(t, "linha"), "linha");
        expect(proj).toBe(canonicoLinha);
      }
    });

    it("projeta listas, tabelas e citações em formato texto com marcas", () => {
      // BulletList
      const bList: Bloco = {
        type: "bulletList",
        content: [
          { type: "listItem", content: [blocoDeTexto("Primeiro ponto")] },
          { type: "listItem", content: [blocoDeTexto("Segundo ponto")] },
        ],
      };
      expect(textoDoBloco(bList)).toBe("• Primeiro ponto\n• Segundo ponto");

      // OrderedList
      const oList: Bloco = {
        type: "orderedList",
        attrs: { start: 1 },
        content: [
          { type: "listItem", content: [blocoDeTexto("Passo 1")] },
          { type: "listItem", content: [blocoDeTexto("Passo 2")] },
        ],
      };
      expect(textoDoBloco(oList)).toBe("1. Passo 1\n2. Passo 2");

      // Blockquote
      const cit: Bloco = {
        type: "blockquote",
        content: [blocoDeTexto("Linha A da citação"), blocoDeTexto("Linha B da citação")],
      };
      expect(textoDoBloco(cit)).toBe("Linha A da citação\nLinha B da citação");

      // Table
      const tab: Bloco = {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [blocoDeTexto("Col 1")] },
              { type: "tableHeader", content: [blocoDeTexto("Col 2")] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [blocoDeTexto("Val A")] },
              { type: "tableCell", content: [blocoDeTexto("Val B")] },
            ],
          },
        ],
      };
      expect(textoDoBloco(tab)).toBe("Col 1 | Col 2\nVal A | Val B");
    });
  });

  // -------------------------------------------------------------------------- 4. ricoValido
  describe("4. ricoValido", () => {
    it("aceita quando o texto projetado coincide exatamente com a entrada", () => {
      const doc: DocRico = {
        type: "doc",
        content: [blocoDeTexto("Texto exato com **negrito**")],
      };
      const env = envelope(doc);
      const valido = ricoValido("Texto exato com **negrito**", env);
      expect(valido).not.toBeNull();
      expect(ehEnvelope(valido)).toBe(true);
    });

    it("recusa quando o texto mudou (ignora rico velho de edição desatualizada)", () => {
      const doc: DocRico = {
        type: "doc",
        content: [blocoDeTexto("Texto original")],
      };
      const env = envelope(doc);
      const invalido = ricoValido("Texto que foi editado no editor simples", env);
      expect(invalido).toBeNull();
    });

    it("recusa entradas que não são envelopes válidos", () => {
      expect(ricoValido("qualquer", null)).toBeNull();
      expect(ricoValido("qualquer", {})).toBeNull();
      expect(ricoValido("qualquer", { f: "outro", v: 1 })).toBeNull();
      expect(ricoValido("qualquer", { f: "sdoc", v: 2 })).toBeNull();
    });
  });

  // -------------------------------------------------------------------------- 5. Aula Inteira
  describe("5. Aula Inteira e Imutabilidade", () => {
    it("docParaUnidade(unidadeParaDoc(c), c) mantém deep equal e JSON.stringify idêntico", () => {
      const casos = [
        // Unidade vazia
        { sections: [] },

        // Seção sem parágrafos
        {
          sections: [
            {
              heading: "Seção Vazia",
              paragraphs: [],
            },
          ],
        },

        // Título vazio
        {
          sections: [
            {
              heading: "",
              paragraphs: [{ text: "Texto de parágrafo" }],
            },
          ],
        },

        // Parágrafo vazio
        {
          sections: [
            {
              heading: "Seção com Parágrafo Vazio",
              paragraphs: [{ text: "" }],
            },
          ],
        },

        // Textos com marcas e escapes
        {
          title: "Aula Completa",
          label: "Material StaziaMed",
          sections: [
            {
              heading: "Bloco 1 · Diagnóstico",
              paragraphs: [
                {
                  text: "Texto com **negrito**, *itálico*, <u>sublinhado</u> e link [Inep](https://inep.gov.br).",
                  clinical: true,
                  claims: ["BV01", "BV02"],
                  claim_ids: [101, 102],
                  pdf_secao: "Diagnóstico",
                  pdf_subtitulo: "Apresentação clínica",
                  pdf_estilo: "normal",
                },
                {
                  text: "Escape de asterisco \\* e quebra\nde linha.",
                  clinical: false,
                  claims: [],
                  claim_ids: [],
                  pdf_secao: "Diagnóstico",
                  pdf_subtitulo: null,
                  pdf_estilo: "caso",
                },
              ],
            },
          ],
          references: [{ source: "SBP", organ: "MS", year: 2024 }],
        },
      ];

      for (const c of casos) {
        const doc = unidadeParaDoc(c);
        const volta = docParaUnidade(doc, c);
        expect(volta).toEqual(c);
        expect(JSON.stringify(volta)).toBe(JSON.stringify(c));
      }
    });

    it("ao editar apenas um parágrafo, mantém os outros com a mesma referência de objeto", () => {
      const original = {
        sections: [
          {
            heading: "Seção A",
            paragraphs: [
              { text: "Parágrafo 0", clinical: true },
              { text: "Parágrafo 1", clinical: false },
              { text: "Parágrafo 2", clinical: true },
            ],
          },
        ],
      };

      const doc = unidadeParaDoc(original);
      // Altera o texto do segundo parágrafo (índice 2 no doc: 0 é heading, 1 é p0, 2 é p1, 3 é p2)
      doc.content[2] = {
        type: "paragraph",
        attrs: { ref: "0:1" },
        content: [{ type: "text", text: "Parágrafo 1 modificado" }],
      };

      const volta = docParaUnidade(doc, original);

      // P0 e P2 devem ser o MESMO objeto em memória
      expect(volta.sections[0].paragraphs[0]).toBe(original.sections[0].paragraphs[0]);
      expect(volta.sections[0].paragraphs[2]).toBe(original.sections[0].paragraphs[2]);

      // P1 foi modificado
      expect(volta.sections[0].paragraphs[1].text).toBe("Parágrafo 1 modificado");
      expect(volta.sections[0].paragraphs[1].clinical).toBe(false);
    });

    it("ao dividir parágrafo (mesmo ref repetido), copia campos clínicos do original", () => {
      const original = {
        sections: [
          {
            heading: "Seção A",
            paragraphs: [
              {
                text: "Parágrafo longo a dividir",
                clinical: true,
                claims: ["C1"],
                claim_ids: [123],
                pdf_secao: "S",
              },
            ],
          },
        ],
      };

      const doc = unidadeParaDoc(original);
      // Divide em dois blocos com o mesmo ref 0:0
      doc.content = [
        doc.content[0], // heading
        {
          type: "paragraph",
          attrs: { ref: "0:0" },
          content: [{ type: "text", text: "Primeira parte" }],
        },
        {
          type: "paragraph",
          attrs: { ref: "0:0" },
          content: [{ type: "text", text: "Segunda parte" }],
        },
      ];

      const volta = docParaUnidade(doc, original);
      expect(volta.sections[0].paragraphs.length).toBe(2);

      const p1 = volta.sections[0].paragraphs[0];
      const p2 = volta.sections[0].paragraphs[1];

      expect(p1.text).toBe("Primeira parte");
      expect(p1.clinical).toBe(true);
      expect(p1.claims).toEqual(["C1"]);

      expect(p2.text).toBe("Segunda parte");
      expect(p2.clinical).toBe(true);
      expect(p2.claims).toEqual(["C1"]);
    });

    it("parágrafo novo sem ref ganha clinical: false e claim_ids: []", () => {
      const original = {
        sections: [
          {
            heading: "Seção A",
            paragraphs: [{ text: "Existente", clinical: true }],
          },
        ],
      };

      const doc = unidadeParaDoc(original);
      doc.content.push({
        type: "paragraph",
        content: [{ type: "text", text: "Novo parágrafo" }],
      });

      const volta = docParaUnidade(doc, original);
      expect(volta.sections[0].paragraphs.length).toBe(2);
      expect(volta.sections[0].paragraphs[1]).toEqual({
        text: "Novo parágrafo",
        clinical: false,
        claim_ids: [],
      });
    });

    it("bloco de lista dentro da seção vira parágrafo com rico e texto com marcadores", () => {
      const original = {
        sections: [
          {
            heading: "Seção A",
            paragraphs: [],
          },
        ],
      };

      const doc = unidadeParaDoc(original);
      doc.content.push({
        type: "bulletList",
        content: [
          { type: "listItem", content: [blocoDeTexto("a")] },
          { type: "listItem", content: [blocoDeTexto("b")] },
        ],
      });

      const volta = docParaUnidade(doc, original);
      expect(volta.sections[0].paragraphs.length).toBe(1);
      const p = volta.sections[0].paragraphs[0];
      expect(p.text).toBe("• a\n• b");
      expect(p.clinical).toBe(false);
      expect(p.claim_ids).toEqual([]);
      expect(p.rico).toBeDefined();
      expect(p.rico.f).toBe("sdoc");
      expect(p.rico.doc.content[0].type).toBe("bulletList");
    });

    it("rico velho (onde o texto do rico não bate com o texto) é descartado", () => {
      const original = {
        sections: [
          {
            heading: "Seção A",
            paragraphs: [
              {
                text: "Texto atualizado pelo editor simples",
                rico: envelope({
                  type: "doc",
                  content: [blocoDeTexto("Texto velho desatualizado")],
                }),
              },
            ],
          },
        ],
      };

      const doc = unidadeParaDoc(original);
      const volta = docParaUnidade(doc, original);
      expect(volta.sections[0].paragraphs[0].text).toBe(
        "Texto atualizado pelo editor simples"
      );
      expect(volta.sections[0].paragraphs[0].rico).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------- 6. Dados Reais
  describe("6. Dados Reais (units.json)", () => {
    const pasta =
      process.env.DOC_RICO_DADOS ?? "/Volumes/StaziaMed/.tmp-aulas/editor-word/dados";
    const arquivoUnits = path.join(pasta, "units.json");

    if (fs.existsSync(arquivoUnits)) {
      it("valida todas as 23 unidades e 668 parágrafos reais com JSON.stringify idêntico", () => {
        const units = JSON.parse(fs.readFileSync(arquivoUnits, "utf-8"));
        expect(units.length).toBe(23);

        let totalParagrafos = 0;

        for (const u of units) {
          const doc = unidadeParaDoc(u.content);
          const deVolta = docParaUnidade(doc, u.content);

          expect(JSON.stringify(deVolta)).toBe(JSON.stringify(u.content));

          for (const s of u.content.sections ?? []) {
            totalParagrafos += (s.paragraphs ?? []).length;
          }
        }

        expect(totalParagrafos).toBe(668);
      });
    } else {
      it.skip("Pasta de dados reais não encontrada, pulando teste 6", () => {});
    }
  });

  // -------------------------------------------------------------------------- 7. HTML Seguro
  describe("7. HTML Seguro", () => {
    it("parágrafo simples é exatamente igual a <p> + inlineParaHtml do textoRico", () => {
      const textos = [
        "Texto comum",
        "Texto com **negrito** e *itálico*.",
        "Link [Google](https://google.com) e <u>sublinhado</u>.",
        "Texto com quebra\nsegunda linha.",
      ];

      for (const t of textos) {
        const p = blocoDeTexto(t);
        const doc: DocRico = { type: "doc", content: [p] };
        const html = htmlDoDoc(doc);
        const esperado = `<p>${inlineParaHtml((p.content ?? []) as any)}</p>`;
        expect(html).toBe(esperado);
      }
    });

    it("escapa tags de script e caracteres perigosos no HTML", () => {
      const doc: DocRico = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "<script>alert('xss')</script> & <b>teste</b>",
              },
            ],
          },
        ],
      };

      const html = htmlDoDoc(doc);
      expect(html).toBe(
        "<p>&lt;script&gt;alert('xss')&lt;/script&gt; &amp; &lt;b&gt;teste&lt;/b&gt;</p>"
      );
      expect(html).not.toContain("<script>");
    });
  });
});
