/**
 * Treino em Dupla: modelo da FOLHA DO CANDIDATO (instruções para o participante e, quando o impresso 1 é o relato do caso,
 * o relato), no desenho da estação simulada aprovada pelo dono (handoff-treino-dupla, estacao-01-instrucoes-e-relato-unica.png).
 *
 * O MESMO HTML serve à pré-visualização da Administração (iframe) e à imagem PNG do servidor (Playwright, server/dupla/folha.ts).
 * Os dados vêm do banco (dupla_folha_fonte, migração 013390): número da estação, área, duração, cenário, tarefas e o texto dos
 * impressos que vão para a folha. Nunca o nome nem o tema da estação.
 *
 * Só FORMATA: o texto é o da estação, sem resumir, sem inventar e sem corrigir. O que muda é só a disposição:
 *   - parágrafos separados por linha em branco; quebra de linha simples vira quebra de linha;
 *   - tarefas "1. …" viram marcadores (a "Observação: …" fica sem marcador);
 *   - no relato, uma linha que é só um rótulo em CAIXA ALTA com dois-pontos vira título; os avisos "ATENÇÃO:",
 *     "IMPORTANTE:", "OBSERVAÇÃO:" e "ORIENTAÇÃO:" viram título mesmo com texto depois, inclusive no meio do parágrafo,
 *     depois do ponto final (o texto segue como parágrafo); antes do primeiro rótulo, duas ou mais linhas seguidas viram marcadores (uma linha só fica como
 *     parágrafo); linhas que já começam com "•", "-" ou "*" viram marcadores (o sinal sai).
 * Os títulos fixos ("INSTRUÇÕES PARA O(A) PARTICIPANTE", "CENÁRIO DE ATUAÇÃO", "Nos próximos N minutos, deverão ser realizadas
 * as seguintes tarefas:") são os do modelo aprovado. Marca: logotipo StaziaMed Revalida, sem outros logos (decisão D2).
 * Tarefas: com o relato na folha, "ler o impresso 1 (relato…)" e "orientação do impresso 1" passam a citar o relato
 * (tarefasRelato.ts, decisão do dono de 17/10); o texto oficial guardado não muda.
 */
import { relatoNaFolha, tarefasAjustadas } from "./tarefasRelato";

/**
 * Versão do modelo: mudou o desenho, a Administração mostra que a folha foi feita com um modelo anterior.
 * folha-1.1 (17/10): com o relato na folha, as tarefas citam "o relato do caso clínico (na sua folha, acima)" e não "impresso 1".
 */
export const FOLHA_MODELO = "folha-1.1";
/** Largura da folha em px de CSS; a imagem sai com o dobro (FOLHA_ESCALA), perto dos 1605 px do modelo. */
export const FOLHA_LARGURA = 802;
export const FOLHA_ESCALA = 2;

export interface FolhaImpresso {
  nome: string;
  texto: string;
}

/** Fonte da folha, como dupla_folha_fonte (013390) devolve. */
export interface FolhaFonte {
  numero: number | null;
  area: string;
  duracao_ms: number;
  cenario: string;
  tarefas: string;
  impressos: FolhaImpresso[];
  bloqueio: string | null;
}

export interface FolhaOpcoes {
  /** Endereço do logotipo (data URI no servidor; /novo-assets/… na pré-visualização). */
  logoSrc: string;
  /** CSS das fontes (@font-face embutido no servidor; @import do Google Fonts na pré-visualização). */
  fontCss?: string;
}

const texto = (v: unknown) => (typeof v === "string" ? v : "");

export function escapeHtml(v: unknown): string {
  return texto(typeof v === "number" ? String(v) : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const normal = (v: string) => v.replace(/\r\n?/g, "\n");
/** Linhas do bloco, sem espaços nas pontas, sem as vazias. */
const linhas = (bloco: string) =>
  normal(bloco)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** Parágrafos separados por linha em branco. */
export function paragrafos(v: string): string[] {
  return normal(texto(v))
    .split(/\n[ \t]*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}

export type ItemTarefa = { tipo: "tarefa" | "nota"; texto: string };

/** Tarefas: uma por linha, sem o número do começo ("1. ", "2) "); "Observação: …" é nota, sem marcador. */
export function tarefasDe(v: string): ItemTarefa[] {
  return linhas(texto(v)).map((l) => {
    const t = l.replace(/^\d+\s*[.)]\s*/, "").replace(/^[•▪◦*-]\s+/, "");
    return /^Observaç(?:ão|ões)\s*:/i.test(t) ? { tipo: "nota", texto: t } : { tipo: "tarefa", texto: t };
  });
}

const MAIUSCULA = "A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜ";
/** Rótulos de aviso do caderno que viram título mesmo com texto na mesma linha (e no meio do parágrafo). */
const AVISOS = ["ATENÇÃO", "IMPORTANTE", "OBSERVAÇÃO", "OBSERVAÇÕES", "ORIENTAÇÃO", "ORIENTAÇÕES"];
const AVISO = `(?:${AVISOS.join("|")})`;
/** Linha que é só um rótulo em CAIXA ALTA com dois-pontos ("EXAME FÍSICO:"): título. */
const ROTULO_SOZINHO = new RegExp(`^([${MAIUSCULA}]{4,}(?:\\s+[${MAIUSCULA}]{2,})*)\\s*:$`);
/** Rótulo de aviso no começo da linha, com o texto depois ("ATENÇÃO: Nesse momento…"). */
const ROTULO_AVISO = new RegExp(`^(${AVISO})\\s*:\\s*`);
/** O mesmo aviso no meio do parágrafo, logo depois de um ponto final (ou !, ?): começa linha nova. */
const ROTULO_NO_MEIO = new RegExp(`([.!?])[ \\t]+(?=${AVISO}\\s*:)`, "g");
const MARCADOR = /^[•▪◦*-]\s+/;

export type BlocoRelato =
  | { tipo: "titulo"; texto: string }
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "lista"; itens: string[] };

/** Blocos do texto de um impresso da folha (relato do caso): títulos, parágrafos e listas, na ordem. */
export function blocosDoRelato(v: string): BlocoRelato[] {
  const out: BlocoRelato[] = [];
  let depoisDeTitulo = false;
  for (const bloco of paragrafos(normal(texto(v)).replace(ROTULO_NO_MEIO, "$1\n"))) {
    // separa o rótulo do resto da linha
    const ls: string[] = [];
    for (const l of linhas(bloco)) {
      const m = ROTULO_SOZINHO.exec(l) ?? ROTULO_AVISO.exec(l);
      if (m) {
        ls.push(`\u0000${m[1]}:`);
        const resto = l.slice(m[0].length).trim();
        if (resto) ls.push(resto);
      } else {
        ls.push(l);
      }
    }
    let soltas: string[] = [];
    const fechar = () => {
      if (!soltas.length) return;
      const comMarcador = soltas.every((l) => MARCADOR.test(l));
      if (comMarcador || (!depoisDeTitulo && soltas.length > 1)) out.push({ tipo: "lista", itens: soltas.map((l) => l.replace(MARCADOR, "")) });
      else for (const l of soltas) out.push({ tipo: "paragrafo", texto: l });
      soltas = [];
    };
    for (const l of ls) {
      if (l.startsWith("\u0000")) {
        fechar();
        out.push({ tipo: "titulo", texto: l.slice(1) });
        depoisDeTitulo = true;
      } else {
        soltas.push(l);
      }
    }
    fechar();
  }
  return out;
}

/** As tarefas como saem na folha: com o relato entre os impressos da folha, o "impresso 1" vira "relato do caso". */
export function tarefasDaFolha(fonte: Pick<FolhaFonte, "tarefas" | "impressos">): string {
  return tarefasAjustadas(fonte.tarefas, relatoNaFolha(fonte.impressos, true));
}

/** "10" ou "7,5" (minutos da estação). */
export function minutosDe(duracaoMs: number): string {
  const m = (Number(duracaoMs) || 0) / 60000;
  return Number.isInteger(m) ? String(m) : m.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

const comQuebras = (v: string) => linhas(v).map(escapeHtml).join("<br>");

/** Folha do candidato em HTML (documento completo, uma página da largura FOLHA_LARGURA, altura do conteúdo). */
export function folhaHtml(fonte: FolhaFonte, opcoes: FolhaOpcoes): string {
  const numero = typeof fonte.numero === "number" && Number.isFinite(fonte.numero) ? ` ${fonte.numero}` : "";
  const tarefas = tarefasDe(tarefasDaFolha(fonte));
  const cenario = paragrafos(fonte.cenario);
  const impressos = Array.isArray(fonte.impressos) ? fonte.impressos : [];

  const htmlTarefas = tarefas.length
    ? `<h3 class="tarefas-titulo">Nos próximos ${escapeHtml(minutosDe(fonte.duracao_ms))} minutos, deverão ser realizadas as seguintes tarefas:</h3>
<ul class="marcadores tarefas">${tarefas.map((t) => (t.tipo === "nota" ? `<li class="nota">${escapeHtml(t.texto)}</li>` : `<li>${escapeHtml(t.texto)}</li>`)).join("")}</ul>`
    : "";

  const htmlImpressos = impressos
    .map((imp) => {
      const corpo = blocosDoRelato(imp.texto)
        .map((b) =>
          b.tipo === "titulo"
            ? `<h3 class="rotulo">${escapeHtml(b.texto)}</h3>`
            : b.tipo === "lista"
              ? `<ul class="marcadores relato">${b.itens.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
              : `<p class="relato-p">${escapeHtml(b.texto)}</p>`
        )
        .join("");
      return `<section class="impresso"><h2 class="secao">${escapeHtml(texto(imp.nome).trim().toLocaleUpperCase("pt-BR"))}</h2>${corpo}</section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Folha do candidato</title>
<style>
${opcoes.fontCss ?? ""}
:root{--azul:#3A5CA2;--texto:#151A21;--fonte:'Plus Jakarta Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Arial,sans-serif}
*{box-sizing:border-box}
html,body{margin:0;background:#fff}
body{font-family:var(--fonte);color:var(--texto);-webkit-font-smoothing:antialiased}
.folha{width:${FOLHA_LARGURA}px;padding:16px 8px 36px;background:#fff}
.logo{display:block;height:58px;width:auto;margin:0 0 0 30px}
.cabecalho{display:flex;align-items:center;gap:14px;margin:44px 0 0 36px;color:var(--azul);font-weight:700}
.cabecalho .estacao{font-size:24px;letter-spacing:.2px;white-space:nowrap}
.cabecalho .barra{width:3px;align-self:stretch;background:var(--azul);margin:2px 0}
.cabecalho .lado{font-size:19px;line-height:1.22}
.faixa{margin:14px 0 0;border-top:4px solid var(--azul);border-bottom:2px solid var(--azul);height:8px}
h1.titulo{margin:22px 0 0;text-align:center;font-size:19px;font-weight:700;letter-spacing:.1px}
h2.secao{margin:30px 0 0;text-align:center;font-size:19px;font-weight:700}
h3{margin:0;font-weight:700}
.cenario-titulo{margin:18px 0 0;font-size:17px}
.cenario{margin:22px 30px 0 52px}
.cenario p{margin:0 0 10px;font-size:15.5px;line-height:1.62;text-align:justify;hyphens:none}
.tarefas-titulo{margin:24px 0 0;font-size:17px}
ul.marcadores{list-style:none;margin:8px 0 0;padding:0}
ul.marcadores li{position:relative;font-size:15.5px;line-height:1.5;margin:0 0 7px}
ul.marcadores li::before{content:"";position:absolute;width:5px;height:5px;border-radius:50%;background:var(--azul);top:.68em}
ul.tarefas{margin-left:30px}
ul.tarefas li{padding-left:24px}
ul.tarefas li::before{left:2px}
ul.tarefas li.nota{padding-left:0}
ul.tarefas li.nota::before{display:none}
.impresso{margin-top:20px}
.impresso h2.secao{margin-top:36px}
ul.relato{margin:20px 54px 0 0}
ul.relato li{padding-left:24px;text-align:justify;margin-bottom:9px}
ul.relato li::before{left:5px}
h3.rotulo{margin:16px 0 4px;font-size:17px}
p.relato-p{margin:0 0 10px;font-size:15.5px;line-height:1.55;text-align:justify}
ul.relato + p.relato-p, h2.secao + p.relato-p{margin-top:18px}
</style></head>
<body><main class="folha" data-folha="candidato">
<img class="logo" src="${escapeHtml(opcoes.logoSrc)}" alt="StaziaMed Revalida">
<header class="cabecalho"><div class="estacao">ESTAÇÃO${escapeHtml(numero)}</div><div class="barra" aria-hidden="true"></div>
<div class="lado"><div>AVALIAÇÃO DE HABILIDADES CLÍNICAS</div><div>Área: ${escapeHtml(fonte.area)}</div></div></header>
<div class="faixa" aria-hidden="true"></div>
<h1 class="titulo">INSTRUÇÕES PARA O(A) PARTICIPANTE</h1>
${cenario.length ? `<h3 class="cenario-titulo">CENÁRIO DE ATUAÇÃO</h3><div class="cenario">${cenario.map((p) => `<p>${comQuebras(p)}</p>`).join("")}</div>` : ""}
${htmlTarefas}
${htmlImpressos}
</main></body></html>`;
}

/**
 * Todo o texto da estação que precisa aparecer na folha (para a conferência depois de gerar): cenário, tarefas e o texto dos
 * impressos, em pedaços sem espaços duplicados.
 */
export function textosEsperados(fonte: FolhaFonte): string[] {
  const out: string[] = [];
  for (const p of paragrafos(fonte.cenario)) out.push(...linhas(p));
  for (const t of tarefasDe(tarefasDaFolha(fonte))) out.push(t.texto);
  for (const imp of fonte.impressos ?? []) {
    for (const b of blocosDoRelato(imp.texto)) {
      if (b.tipo === "lista") out.push(...b.itens);
      else out.push(b.texto);
    }
  }
  return out.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
}
