/**
 * Voice Tutor — Fase 2 (protótipo). Questão de TESTE e o "Truth Engine" mínimo do protótipo: o gabarito fica no SERVIDOR e só
 * entra no contexto do modelo depois que o aluno diz a letra (por ferramenta no Gemini Live; por detecção da letra no Custom LLM).
 */
export interface QuestaoTeste {
  id: string;
  enunciado: string;
  alternativas: Record<string, string>;
  gabarito: string;
  /** Explicação geral ou por alternativa (formato das inéditas revisadas). */
  explicacao: string | Record<string, string>;
  fonte: string;
}

/** Anafilaxia: questão FICTÍCIA escrita para o protótipo, sem revisão médica. Não usar com alunos. */
export const QUESTAO_ANAFILAXIA: QuestaoTeste = {
  id: "teste-anafilaxia-01",
  enunciado:
    "Mulher de 28 anos, 10 minutos depois de comer camarão, apresenta urticária generalizada, edema de lábios, sibilos e pressão arterial de 80 por 50 milímetros de mercúrio. Qual é a primeira conduta medicamentosa?",
  alternativas: {
    A: "Hidrocortisona intravenosa.",
    B: "Adrenalina intramuscular na face anterolateral da coxa.",
    C: "Prometazina intramuscular.",
    D: "Salbutamol inalatório e observação.",
    E: "Adrenalina subcutânea no braço.",
  },
  gabarito: "B",
  explicacao:
    "Anafilaxia com acometimento respiratório e hipotensão: a primeira droga é a adrenalina intramuscular na face anterolateral da coxa, sem atraso (adulto: 0,01 mg/kg da solução de 1 mg/mL, no máximo 0,5 mg; pode repetir a cada 5 a 15 minutos). Corticoide e anti-histamínico são adjuvantes: demoram a agir e não revertem o choque. A via subcutânea absorve pior que a intramuscular.",
  fonte: "Dado de TESTE do protótipo (texto escrito para a bancada, sem revisão médica).",
};

/** Converte uma inédita revisada (ineditas-300/*.json) para o formato do teste. */
export function deIneditaRevisada(q: Record<string, any>): QuestaoTeste {
  const fontes = Array.isArray(q.fontes) ? q.fontes.map((f: any) => [f.documento, f.versao, f.pagina].filter(Boolean).join(", ")).join(" | ") : "";
  return { id: String(q.id), enunciado: String(q.enunciado), alternativas: q.alternativas, gabarito: String(q.gabarito), explicacao: q.explicacao, fonte: fontes };
}

// 1º: "letra B", "alternativa c", "opção D". 2º: verbo de escolha + letra no FIM da frase ("vou de D", "marco a C.").
// O artigo "a"/"e" no meio da frase não pode virar letra ("marcaria a letra B" → B, nunca A).
const PADRAO_NOME = /(?:\bletra|\balternativa|\bop[cç][aã]o)\s+\(?([A-Ea-e])\)?(?![\p{L}])/u;
const PADRAO_VERBO = /(?:\bmarc\w*|\bresposta\s+(?:é|e)|\bvou\s+de|\bfico\s+com|\bescolh\w*)\s+(?:(?:a|na|o|é\s+a)\s+)?\(?([A-Ea-e])\)?(?=\s*(?:[.,!?;]|$))/u;

/** Letra que o aluno disse na fala (ou null). Só aceita forma explícita ("letra B", "marco a C.", "vou de D"). */
export function letraDita(fala: string, letras: string[] = ["A", "B", "C", "D", "E"]): string | null {
  const m = PADRAO_NOME.exec(fala ?? "") ?? PADRAO_VERBO.exec(fala ?? "");
  const l = m?.[1]?.toUpperCase() ?? null;
  return l && letras.includes(l) ? l : null;
}

const explicacaoDe = (q: QuestaoTeste, letra?: string) =>
  typeof q.explicacao === "string" ? q.explicacao : letra ? q.explicacao[letra] ?? "" : Object.entries(q.explicacao).map(([l, t]) => `${l}: ${t}`).join(" ");

/** Bloco <base> para o prompt. Antes da resposta: só o caso. Depois: gabarito, explicação da marcada e da certa, fonte. */
export function blocoBase(q: QuestaoTeste, respondida: string | null): string {
  const alts = Object.entries(q.alternativas).map(([l, t]) => `${l}) ${t}`).join("\n");
  const depois = respondida
    ? [
        `O aluno respondeu: ${respondida} (${respondida === q.gabarito ? "ACERTOU" : "ERROU"}).`,
        `Gabarito StaziaMed: ${q.gabarito}.`,
        `Por que a ${q.gabarito} é a certa: ${explicacaoDe(q, q.gabarito)}`,
        respondida !== q.gabarito ? `Por que a ${respondida} está errada: ${explicacaoDe(q, respondida)}` : "",
        `Fonte: ${q.fonte}`,
      ].filter(Boolean)
    : ["O aluno AINDA NÃO RESPONDEU. Você não tem o gabarito: não diga qual alternativa é a certa, não elimine alternativa sem ele pedir ajuda; ajude a pensar."];
  return ["<base>", `[Q] Questão aberta (id ${q.id}): ${q.enunciado}\n${alts}`, ...depois, "</base>"].join("\n");
}

/** Ferramentas do protótipo para o Gemini Live (o modelo nunca recebe o gabarito antes de submit_answer). */
export const DECLARACOES_FERRAMENTAS = [
  {
    name: "get_question_context",
    description: "Traz a questão aberta (enunciado e alternativas). Depois que o aluno respondeu, traz também o gabarito, a explicação validada e a fonte.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "submit_answer",
    description: "Registra a letra que o aluno escolheu e devolve a correção oficial (gabarito, explicação da marcada e da certa, fonte). Chame assim que o aluno disser a letra.",
    parameters: { type: "OBJECT", properties: { letra: { type: "STRING", description: "Letra escolhida pelo aluno (A a E)." } }, required: ["letra"] },
  },
];

export class EstadoQuestao {
  respondida: string | null = null;
  constructor(public q: QuestaoTeste) {}
  executar(nome: string, args: Record<string, unknown>): Record<string, unknown> {
    const q = this.q;
    if (nome === "get_question_context") {
      return {
        id: q.id, enunciado: q.enunciado, alternativas: q.alternativas,
        ...(this.respondida ? { resposta_do_aluno: this.respondida, gabarito: q.gabarito, explicacao: explicacaoDe(q), fonte: q.fonte } : { aviso: "Questão aberta: gabarito só depois que o aluno responder (submit_answer)." }),
      };
    }
    if (nome === "submit_answer") {
      const l = String(args?.letra ?? "").trim().toUpperCase().slice(0, 1);
      if (!Object.keys(q.alternativas).includes(l)) return { erro: "letra inválida", letras: Object.keys(q.alternativas) };
      if (!this.respondida) this.respondida = l;
      return {
        registrada: this.respondida, acertou: this.respondida === q.gabarito, gabarito: q.gabarito,
        por_que_a_certa: explicacaoDe(q, q.gabarito), por_que_a_marcada: this.respondida !== q.gabarito ? explicacaoDe(q, this.respondida) : null, fonte: q.fonte,
      };
    }
    return { erro: `ferramenta desconhecida: ${nome}` };
  }
}
