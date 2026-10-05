/**
 * Principal → nova tentativa → secundário (item 12). Cada resultado informa QUEM realmente o produziu
 * (provider/model do resultado), para a auditoria registrar o provedor certo.
 */
import { AiInvalidOutput, type AiProvider, type StructuredRequest, type StructuredResult } from "./provider";

/** Falhas que não adianta repetir: recusa do provedor e chave inválida. */
const FINAL = /recusou|401|403|API key|ALLOW_EXTERNAL/i;

export class FallbackProvider implements AiProvider {
  readonly isMock: boolean;
  constructor(
    private primary: AiProvider,
    private secondary: AiProvider,
    private opts: { retries?: number; sleep?: (ms: number) => Promise<void>; onFallback?: (info: { from: string; to: string; error: string }) => void } = {},
  ) {
    this.isMock = primary.isMock || secondary.isMock;
  }
  get name() {
    return this.primary.name;
  }
  get model() {
    return this.primary.model;
  }

  private async attempt<T>(p: AiProvider, req: StructuredRequest): Promise<StructuredResult<T>> {
    const retries = this.opts.retries ?? 1;
    const sleep = this.opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    let last: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        return await p.generate<T>(req);
      } catch (error) {
        last = error;
        if (!(error instanceof AiInvalidOutput) && FINAL.test((error as Error).message)) break;
        if (i < retries) await sleep(500 * 2 ** i);
      }
    }
    throw last;
  }

  async generate<T>(req: StructuredRequest): Promise<StructuredResult<T>> {
    try {
      return await this.attempt<T>(this.primary, req);
    } catch (error) {
      this.opts.onFallback?.({ from: `${this.primary.name}/${this.primary.model}`, to: `${this.secondary.name}/${this.secondary.model}`, error: (error as Error).message.slice(0, 200) });
      return this.attempt<T>(this.secondary, req);
    }
  }
}
