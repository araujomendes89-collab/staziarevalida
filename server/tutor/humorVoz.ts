/**
 * HUMOR QUE MUDA A CADA FALA NA VOZ AO VIVO (item 5 do "Tutor natural, sem textos prontos", decisão do dono de 17/10/2026).
 *
 * Antes, na voz ao vivo (Gemini Live pela ponte), o humor do professor só mudava quando o aluno respondia a questão (o tom vinha
 * junto da correção, em submit_answer). Agora a PONTE guarda o humor da ligação (o mesmo Personality Engine do servidor:
 * personalityEngine.ts) e o recalcula:
 *   - enquanto o aluno fala, pela transcrição que o Google devolve (brincadeira, ansiedade, pedido de seriedade, pergunta, crise);
 *   - quando a correção chega (acerto ou erro, com a memória da ligação: erro repetido, alívio depois de errar);
 *   - quando o professor termina de falar (os começos de fala já usados nesta ligação entram como "não comece igual").
 * Só o BLOCO DO ESTADO é trocado nas instruções da sessão (contextUpdate), sem pedir resposta nova e sem esperar nada: a resposta
 * do professor não espera a troca (latência igual). Se a troca chegar depois de o professor já ter começado a falar, vale para a
 * próxima fala.
 *
 * Nada aqui decide conteúdo: o estado só muda o TOM. Limites (ataque à pessoa, palavrão acima do nível escolhido, gabarito antes da
 * resposta) continuam nas instruções fixas e na conferência do servidor. Crise trava a calma até o fim da ligação.
 */
import { usedStarts } from "./emotion";
import type { ProfanityLevel } from "./personality";
import {
  freshMemory, personaStateLayer, personaTurn, PROFILES, signalsFromText,
  type PersonaDirective, type PersonaMemory, type ResolvedProfile, type Signal,
} from "./personalityEngine";
import type { ReactionRule } from "../../src/shared/tutor/voiceReactions";

/** O que o app sela no bilhete para a ponte recalcular o humor (nada de dado do aluno além do perfil escolhido). */
export interface HumorBilhete {
  v: 1;
  /** chave do perfil (PROFILES) já resolvido pelo servidor: painel, interruptor da Explosiva, escolha e 18+ do aluno */
  perfil: string;
  teto: ProfanityLevel;
  gritos: boolean;
  nota: string | null;
  regras: ReactionRule[];
  ajudaTravada?: boolean;
  memoria: PersonaMemory;
  /** o bloco do estado exatamente como entrou em `instrucoes` (a ponte troca este trecho pelo estado do momento) */
  estado: string;
}

/** Monta o campo do bilhete a partir da diretiva inicial do servidor. */
export function humorParaBilhete(o: { directive: PersonaDirective; resolved: ResolvedProfile; rules: ReactionRule[]; estado: string }): HumorBilhete {
  return {
    v: 1, perfil: o.resolved.profile.key, teto: o.resolved.profanityCap, gritos: o.resolved.shoutsAllowed, nota: o.resolved.note,
    regras: o.rules, ajudaTravada: o.directive.pedagogy.help === "none", memoria: o.directive.memory, estado: o.estado,
  };
}

/** Bilhete com humor válido? (selado pelo app, mas a ponte pode estar numa versão diferente: perfil desconhecido = desligado) */
export function humorValido(h: unknown): h is HumorBilhete {
  const x = h as HumorBilhete | null;
  return Boolean(x && x.v === 1 && typeof x.perfil === "string" && PROFILES[x.perfil] && typeof x.estado === "string" && x.estado && x.memoria && Array.isArray(x.regras));
}

const COMECOS_MAX = 8;

/** Linha "não comece igual" a partir das falas do professor nesta ligação. */
export function linhaComecos(falasDoTutor: string[]): string {
  const s = usedStarts(falasDoTutor.filter((t) => t.trim()), COMECOS_MAX);
  return s.length ? `Nesta ligação você já começou falas com: ${s.map((x) => `«${x}»`).join(", ")}. A próxima fala começa de outro jeito e não repete frase nem bordão já dito.` : "";
}

/**
 * Humor de UMA ligação (vive só na memória da ponte enquanto a ligação dura). Nunca lança: qualquer falha mantém o estado anterior.
 */
export class HumorDaLigacao {
  private memoria: PersonaMemory;
  private readonly resolved: ResolvedProfile;
  /** memória do começo da fala do aluno em andamento (a transcrição chega em pedaços: o turno é recalculado do começo) */
  private base: PersonaMemory | null = null;
  private pendente: PersonaMemory | null = null;
  private estadoTexto: string;
  private comecos = "";
  /** quantas vezes o bloco mudou (telemetria do fim da ligação) */
  trocas = 0;

  constructor(private readonly h: HumorBilhete) {
    this.memoria = { ...freshMemory(), ...h.memoria };
    this.resolved = { profile: PROFILES[h.perfil], profanityCap: h.teto, shoutsAllowed: h.gritos, note: h.nota };
    this.estadoTexto = h.estado;
  }

  /** O bloco do estado em vigor (estado + começos já usados). */
  get bloco(): string {
    return [this.estadoTexto, this.comecos].filter(Boolean).join("\n");
  }

  get estadoAtual(): string {
    return this.memoria.state;
  }

  private turno(memory: PersonaMemory, o: { facts?: Signal[]; text?: string }): PersonaDirective {
    return personaTurn({ resolved: this.resolved, memory, facts: o.facts, studentText: o.text, rules: this.h.regras, provider: "gemini_live", exam: { helpLocked: Boolean(this.h.ajudaTravada) } });
  }

  private aplicar(texto: string): string | null {
    const antes = this.bloco;
    this.estadoTexto = texto;
    if (this.bloco === antes) return null;
    this.trocas++;
    return this.bloco;
  }

  /**
   * O aluno está falando: `texto` é tudo o que ele disse NESTA fala até agora. Devolve o bloco novo quando o humor mudou (ou null).
   * A fala inteira conta como um turno só (recalcula a partir do começo dela).
   */
  ouvirAluno(texto: string): string | null {
    try {
      if (!texto.trim()) return null;
      this.base ??= this.memoria;
      const d = this.turno(this.base, { text: texto });
      this.pendente = d.memory;
      return this.aplicar(personaStateLayer(d));
    } catch {
      return null;
    }
  }

  /** A fala do aluno acabou (o professor começou a responder): o turno vira memória. */
  fecharFalaDoAluno(): void {
    if (this.pendente) this.memoria = this.pendente;
    this.base = null;
    this.pendente = null;
  }

  /** Fato do servidor (correção da questão): acerto/erro com a memória da ligação. Devolve o bloco do estado novo. */
  fatos(facts: Signal[]): string {
    try {
      this.fecharFalaDoAluno();
      const d = this.turno(this.memoria, { facts });
      this.memoria = d.memory;
      const novo = personaStateLayer(d);
      this.aplicar(novo);
      return novo;
    } catch {
      return this.estadoTexto;
    }
  }

  /** O professor terminou uma fala: atualiza a linha dos começos já usados. Devolve o bloco novo quando mudou. */
  falasDoProfessor(falas: string[]): string | null {
    const antes = this.bloco;
    this.comecos = linhaComecos(falas);
    if (this.bloco === antes) return null;
    this.trocas++;
    return this.bloco;
  }
}

/** Acerto ou erro numa resposta de submit_answer (o formato que o app devolve à voz), ou null quando não dá para saber. */
export function acertoDaFerramenta(response: unknown): boolean | null {
  const out = (response as { output?: unknown } | null)?.output ?? response;
  const r = (out as { result?: { is_correct?: unknown } } | null)?.result?.is_correct;
  return typeof r === "boolean" ? r : null;
}

/** Instruções da sessão com o bloco do estado do momento no lugar do bloco inicial (ou no fim, se não achar). */
export function instrucoesComEstado(instrucoes: string, estadoInicial: string, bloco: string): string {
  if (!estadoInicial || bloco === estadoInicial) return instrucoes;
  const i = instrucoes.indexOf(estadoInicial);
  return i < 0 ? `${instrucoes}\n\n${bloco}` : instrucoes.slice(0, i) + bloco + instrucoes.slice(i + estadoInicial.length);
}
