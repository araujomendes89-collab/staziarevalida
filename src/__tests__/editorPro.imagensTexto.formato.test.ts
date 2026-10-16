import { describe, expect, it, vi } from "vitest";
import {
  sanear,
  textoDoDoc,
  ricoValido,
  htmlDoDoc,
  envelope,
  soFormatacao,
  type DocRico,
} from "../shared/docRico";
import {
  OPCOES_FIGURA,
  ATRIBUTOS_DA_MOLDURA,
  ATRIBUTOS_DA_IMAGEM,
  MARCADOR_ASSET,
  MARCADOR_NUMERO,
  IMAGEM_INDISPONIVEL,
  figurasDoDoc,
  numerosDasFiguras,
  figurasSemAlt,
  idsDasFiguras,
  embutirFiguras,
} from "../shared/docRico/modulos/imagens";

const UUID_1 = "11111111-1111-4111-8111-111111111111";
const UUID_2 = "22222222-2222-4222-8222-222222222222";
const UUID_MAIUSCULO = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";

describe("Editor Profissional: Formato da Figura no Documento Rico (M11b)", () => {
  describe("Constantes e Opções", () => {
    it("exporta opções e listas de moldura e imagem", () => {
      expect(OPCOES_FIGURA.larguras).toEqual([25, 33, 50, 66, 75, 100]);
      expect(ATRIBUTOS_DA_MOLDURA).toEqual(["largura", "alinhamento", "disposicao"]);
      expect(ATRIBUTOS_DA_IMAGEM).toEqual(["borda", "cantos", "sombra"]);
      expect(MARCADOR_ASSET).toBe("sdoc-asset:");
      expect(MARCADOR_NUMERO).toBe('<span class="dr-fig-n">#</span>');
      expect(IMAGEM_INDISPONIVEL).toContain("data:image/svg+xml;charset=utf-8,");
      expect(IMAGEM_INDISPONIVEL).toContain(encodeURIComponent("Imagem indisponível"));
    });
  });

  describe("Saneamento de Figuras", () => {
    it("mantém figura com atributos válidos e não-padrão", () => {
      const doc: DocRico = {
        type: "doc",
        content: [
          {
            type: "figura",
            attrs: {
              asset: UUID_1,
              alt: "Raio-x de tórax",
              legenda: "Consolidação lobar esquerda",
              largura: 50,
              alinhamento: "esquerda",
              disposicao: "quadrado-esquerda",
              borda: "fina",
              cantos: "suaves",
              sombra: true,
            },
          },
        ],
      };
      const saneado = sanear(doc);
      expect(saneado.content[0].type).toBe("figura");
      expect(saneado.content[0].attrs).toEqual({
        asset: UUID_1,
        alt: "Raio-x de tórax",
        legenda: "Consolidação lobar esquerda",
        largura: 50,
        alinhamento: "esquerda",
        disposicao: "quadrado-esquerda",
        borda: "fina",
        cantos: "suaves",
        sombra: true,
      });
    });

    it("descarta asset que não é uuid e converte maiúsculo para minúsculo", () => {
      const docInvalido: DocRico = {
        type: "doc",
        content: [{ type: "figura", attrs: { asset: "invalido", alt: "Teste" } }],
      };
      const saneadoInvalido = sanear(docInvalido);
      expect(saneadoInvalido.content[0].attrs?.asset).toBeUndefined();

      const docMaiusculo: DocRico = {
        type: "doc",
        content: [{ type: "figura", attrs: { asset: UUID_MAIUSCULO, alt: "Teste" } }],
      };
      const saneadoMaiusculo = sanear(docMaiusculo);
      expect(saneadoMaiusculo.content[0].attrs?.asset).toBe(UUID_MAIUSCULO.toLowerCase());
    });

    it("descarta largura 5 ou 120 e valores de alinhamento e disposição fora da lista", () => {
      const doc: DocRico = {
        type: "doc",
        content: [
          {
            type: "figura",
            attrs: {
              asset: UUID_1,
              largura: 5,
              alinhamento: "justificado" as any,
              disposicao: "flutuante" as any,
            },
          },
          {
            type: "figura",
            attrs: {
              asset: UUID_1,
              largura: 120,
            },
          },
        ],
      };
      const saneado = sanear(doc);
      expect(saneado.content[0].attrs?.largura).toBeUndefined();
      expect(saneado.content[0].attrs?.alinhamento).toBeUndefined();
      expect(saneado.content[0].attrs?.disposicao).toBeUndefined();
      expect(saneado.content[1].attrs?.largura).toBeUndefined();
    });

    it("descarta alt > 500 caracteres e alt vazio; formata legenda com quebra de linha", () => {
      const altLongo = "a".repeat(501);
      const legendaComQuebras = "Linha 1\r\nLinha 2\nLinha 3";
      const legendaLonga = "l".repeat(301);

      const doc: DocRico = {
        type: "doc",
        content: [
          {
            type: "figura",
            attrs: {
              asset: UUID_1,
              alt: altLongo,
              legenda: legendaComQuebras,
            },
          },
          {
            type: "figura",
            attrs: {
              asset: UUID_1,
              alt: "   ",
              legenda: legendaLonga,
            },
          },
        ],
      };
      const saneado = sanear(doc);
      expect(saneado.content[0].attrs?.alt).toBeUndefined();
      expect(saneado.content[0].attrs?.legenda).toBe("Linha 1 Linha 2 Linha 3");
      expect(saneado.content[1].attrs?.alt).toBeUndefined();
      expect(saneado.content[1].attrs?.legenda).toBeUndefined();
    });

    it("tira padrões (largura 100, alinhamento centro, disposicao linha, cantos retos, sombra false)", () => {
      const doc: DocRico = {
        type: "doc",
        content: [
          {
            type: "figura",
            attrs: {
              asset: UUID_1,
              largura: 100,
              alinhamento: "centro",
              disposicao: "linha",
              cantos: "retos",
              sombra: false,
            },
          },
        ],
      };
      const saneado = sanear(doc);
      expect(saneado.content[0].attrs).toEqual({ asset: UUID_1 });
    });
  });

  describe("Projeção para Texto", () => {
    it("textoDoDoc de doc com figura = '' e de doc com parágrafo + figura = 'texto\\n'", () => {
      const docSoFigura: DocRico = {
        type: "doc",
        content: [{ type: "figura", attrs: { asset: UUID_1, alt: "Foto" } }],
      };
      expect(textoDoDoc(docSoFigura)).toBe("");

      const docMisto: DocRico = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "texto" }] },
          { type: "figura", attrs: { asset: UUID_1, alt: "Foto" } },
        ],
      };
      expect(textoDoDoc(docMisto)).toBe("texto\n");
    });

    it("ricoValido('', envelope({figura})) não é null", () => {
      const env = envelope({
        type: "doc",
        content: [{ type: "figura", attrs: { asset: UUID_1, alt: "Foto" } }],
      });
      const valido = ricoValido("", env);
      expect(valido).not.toBeNull();
    });
  });

  describe("HTML da Figura", () => {
    it("renderiza HTML com src de marcador, alt escapado, figcaption com U+2013, width e float", () => {
      const doc: DocRico = {
        type: "doc",
        content: [
          {
            type: "figura",
            attrs: {
              asset: UUID_1,
              alt: '<b>"x"',
              legenda: 'Legenda com <tag> & "aspas"',
              largura: 50,
              disposicao: "quadrado-esquerda",
            },
          },
        ],
      };
      const html = htmlDoDoc(doc);
      expect(html).toContain(`src="sdoc-asset:${UUID_1}"`);
      expect(html).toContain('alt="&lt;b&gt;&quot;x&quot;"');
      expect(html).toContain(
        '<figcaption class="dr-figura-legenda">Figura <span class="dr-fig-n">#</span> – Legenda com &lt;tag&gt; &amp; &quot;aspas&quot;</figcaption>'
      );
      expect(html).toContain("width:50%");
      expect(html).toContain("float:left");
      expect(html).not.toContain("http");
      expect(html).not.toContain("doc-imagens/");
    });

    it("figura sem asset gera html vazio", () => {
      const doc: DocRico = {
        type: "doc",
        content: [{ type: "figura", attrs: { alt: "sem asset" } }],
      };
      expect(htmlDoDoc(doc)).toBe("");
    });
  });

  describe("embutirFiguras no HTML do PDF", () => {
    it("sem figura devolve a string idêntica (===)", async () => {
      const html = "<p>Texto normal sem figuras</p>";
      const resultado = await embutirFiguras(html);
      expect(resultado).toBe(html);
    });

    it("numera figuras com legenda (1 e 2) e ignora figuras sem legenda", async () => {
      const doc: DocRico = {
        type: "doc",
        content: [
          { type: "figura", attrs: { asset: UUID_1, legenda: "Primeira" } },
          { type: "figura", attrs: { asset: UUID_1 } }, // sem legenda
          { type: "figura", attrs: { asset: UUID_2, legenda: "Segunda" } },
        ],
      };
      const html = htmlDoDoc(doc);
      const carregar = async () => ({
        data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
        mime: "image/png",
      });
      const embutido = await embutirFiguras(html, carregar);
      expect(embutido).toContain('Figura <span class="dr-fig-n">1</span> – Primeira');
      expect(embutido).toContain('Figura <span class="dr-fig-n">2</span> – Segunda');
      expect(embutido).not.toContain('<span class="dr-fig-n">#</span>');
    });

    it("substitui por data URI de imagem quando carregar devolve PNG de 1x1", async () => {
      const base64Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      const html = `<figure class="dr-figura"><img src="sdoc-asset:${UUID_1}"></figure>`;
      const carregar = async () => ({
        data: Buffer.from(base64Png, "base64"),
        mime: "image/png",
      });
      const resultado = await embutirFiguras(html, carregar);
      expect(resultado).toContain(`src="data:image/png;base64,${base64Png}"`);
    });

    it("substitui por IMAGEM_INDISPONIVEL ao lançar erro, mime gif/svg ou ausência de carregador", async () => {
      const html1 = `<img src="sdoc-asset:${UUID_1}">`;
      const falha = await embutirFiguras(html1, async () => {
        throw new Error("Erro no storage");
      });
      expect(falha).toContain(`src="${IMAGEM_INDISPONIVEL}"`);

      const gifInvalido = await embutirFiguras(html1, async () => ({
        data: Buffer.from("GIF89a"),
        mime: "image/gif",
      }));
      expect(gifInvalido).toContain(`src="${IMAGEM_INDISPONIVEL}"`);

      const semCarregador = await embutirFiguras(html1);
      expect(semCarregador).toContain(`src="${IMAGEM_INDISPONIVEL}"`);
    });

    it("chama carregar uma única vez para o mesmo id duplicado", async () => {
      const html = `<img src="sdoc-asset:${UUID_1}"><img src="sdoc-asset:${UUID_1}">`;
      const fn = vi.fn(async () => ({
        data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
        mime: "image/png",
      }));
      await embutirFiguras(html, fn);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("limita carregamento a 40 imagens e substitui da 41ª em diante sem chamar carregar", async () => {
      const ids: string[] = [];
      let html = "";
      for (let i = 0; i < 41; i++) {
        const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
        ids.push(id);
        html += `<img src="sdoc-asset:${id}">`;
      }
      const fn = vi.fn(async () => ({
        data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
        mime: "image/png",
      }));
      const resultado = await embutirFiguras(html, fn);
      expect(fn).toHaveBeenCalledTimes(40);
      expect(resultado).toContain(`src="${IMAGEM_INDISPONIVEL}"`);
    });
  });

  describe("figurasSemAlt e idsDasFiguras", () => {
    it("identifica figuras sem alt e extrai ids únicos em doc, envelope e content de unidade", () => {
      const doc = {
        type: "doc",
        content: [
          { type: "figura", attrs: { asset: UUID_1, alt: "Com alt" } },
          { type: "figura", attrs: { asset: UUID_2, alt: "" } },
        ],
      };
      expect(figurasSemAlt(doc)).toBe(1);
      expect(idsDasFiguras(doc)).toEqual([UUID_1, UUID_2]);

      const contentUnidade = {
        sections: [
          {
            heading: "Seção 1",
            paragraphs: [
              {
                text: "Parágrafo",
                rico: envelope({
                  type: "doc",
                  content: [
                    { type: "figura", attrs: { asset: UUID_1, alt: "  " } },
                    { type: "figura", attrs: { asset: UUID_1, alt: "Repetida" } },
                  ],
                }),
              },
            ],
          },
        ],
      };
      expect(figurasSemAlt(contentUnidade)).toBe(1);
      expect(idsDasFiguras(contentUnidade)).toEqual([UUID_1]);
    });
  });

  describe("soFormatacao: compatibilidade com regras de publicação", () => {
    const P = (rico: any) => ({ text: "Texto", clinical: true, claim_ids: ["c1"], rico });
    const C = (p: any) => ({ sections: [{ heading: "S", paragraphs: [p] }] });
    const fig = (attrs: any) =>
      envelope({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Texto" }] },
          { type: "figura", attrs: { asset: UUID_1, alt: "Alt", legenda: "Legenda", largura: 50, ...attrs } },
        ],
      });

    it("mudar só formatação (largura/alinhamento/disposicao/borda/cantos/sombra) mantém soFormatacao = true", () => {
      const base = C(P(fig({})));
      const formatado = C(
        P(
          fig({
            largura: 80,
            alinhamento: "direita",
            disposicao: "quadrado-direita",
            borda: "grossa",
            cantos: "arredondados",
            sombra: true,
          })
        )
      );
      expect(soFormatacao(base, formatado)).toBe(true);
    });

    it("mudar asset, alt, legenda ou inserir figura altera o conteúdo (soFormatacao = false)", () => {
      const base = C(P(fig({})));
      expect(soFormatacao(base, C(P(fig({ asset: UUID_2 }))))).toBe(false);
      expect(soFormatacao(base, C(P(fig({ alt: "Outro alt" }))))).toBe(false);
      expect(soFormatacao(base, C(P(fig({ legenda: "Outra legenda" }))))).toBe(false);

      const semFigura = C(P(envelope({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Texto" }] }] })));
      expect(soFormatacao(semFigura, base)).toBe(false);
    });
  });
});
