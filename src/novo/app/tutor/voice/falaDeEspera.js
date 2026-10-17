// Frase de espera FALADA na voz ao vivo (decisão do dono de 17/10/2026). Quando a busca no material passa de ~600 ms, a tela mostra a
// frase (frasesEspera.ts) e, se houver gravação (VINHETAS, mp3 em public/novo-assets/tutor/espera, Stazi JÁ afinado +3), toca pelo
// MESMO tocador da voz (tocarVinheta: a boca do personagem mexe e o afinador não é aplicado de novo).
// Regras: nunca por cima do professor (tocador ocupado) nem do aluno (falou há pouco, interrompendo, pausado); uma frase por vez; a
// resposta do professor, a fala do aluno ou a interrupção cortam na hora (parar). Sem gravação, sem ligação ou com erro de rede: só o
// texto aparece (o texto aparece sempre, inclusive com movimento reduzido).

const cache = new Map(); // url → Promise<ArrayBuffer>

/** Baixa a gravação (uma vez por endereço; erro não fica guardado). */
export function carregarVinheta(url, buscar = (u) => fetch(u)) {
  let p = cache.get(url);
  if (!p) {
    p = Promise.resolve()
      .then(() => buscar(url))
      .then((r) => {
        if (!r?.ok) throw new Error(`frase de espera ${r?.status ?? "sem resposta"}`);
        return r.arrayBuffer();
      });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p;
}

/** Baixa antes, em segundo plano, as gravações da personalidade da conversa (8 arquivos de ~10 a 20 KB). */
export function preCarregarVinhetas(urls, buscar) {
  for (const u of urls ?? []) if (u) carregarVinheta(u, buscar).catch(() => {});
}

/** Testes: esquece o que foi baixado. */
export const limparVinhetas = () => cache.clear();

export class FalaDeEspera {
  /**
   * controle(): o controle da voz aberta (tocarVinheta/pararVinheta), ou null. podeFalar(): ninguém está falando agora.
   * aoComecar(): a gravação começou (a tela põe o personagem falando). aoTerminar(completa): acabou ou foi cortada por fora.
   */
  constructor({ controle, podeFalar, aoComecar = () => {}, aoTerminar = () => {}, carregar = carregarVinheta }) {
    Object.assign(this, { controle, podeFalar, aoComecar, aoTerminar, carregar });
    this.vez = null;
    this.tocando = null;
  }
  get ativa() {
    return Boolean(this.tocando);
  }
  /** Toca a gravação `url`. Resolve true se tocou até o fim. */
  async tocar(url) {
    this.parar(false);
    const vez = {};
    this.vez = vez;
    const gem = this.controle();
    if (!url || typeof gem?.tocarVinheta !== "function" || !this.podeFalar()) return false;
    let audio;
    try {
      audio = await this.carregar(url);
    } catch {
      return false; // sem a gravação: fica só o texto
    }
    // enquanto baixava, a resposta pode ter chegado, o aluno pode ter falado ou a ligação mudado
    if (this.vez !== vez || this.controle() !== gem || !this.podeFalar()) return false;
    this.tocando = vez;
    this.aoComecar();
    let completa = false;
    try {
      completa = Boolean(await gem.tocarVinheta(audio));
    } catch {
      completa = false;
    }
    if (this.tocando === vez) {
      this.tocando = null;
      this.vez = null;
      this.aoTerminar(completa);
    }
    return completa;
  }
  /** Corta agora. `avisar` = chamar aoTerminar(false) se estava tocando. Devolve se estava tocando. */
  parar(avisar = true) {
    const estava = this.tocando;
    this.vez = null;
    this.tocando = null;
    try {
      this.controle()?.pararVinheta?.();
    } catch {
      // a voz já fechou
    }
    if (estava && avisar) this.aoTerminar(false);
    return Boolean(estava);
  }
}

// ---- o aluno está falando agora? (microfone, sem esperar a transcrição, que chega atrasada) ----
// Cada bloco do microfone (100 ms, Float32 a 16 kHz, o mesmo que vai para a voz) vira um nível RMS. Voz = nível acima de LIMIAR_VOZ
// (o navegador já tira eco e ruído: echoCancellation/noiseSuppression); "começou a falar" = 2 blocos seguidos com voz (~200 ms, tosse
// ou batida não contam); "está falando" = teve voz nos últimos FALANDO_MS.
export const LIMIAR_VOZ = 0.025;
const BLOCOS_PARA_COMECAR = 2;
const FALANDO_MS = 700;

export class OuvidoDoAluno {
  constructor(agora = () => (typeof performance !== "undefined" ? performance.now() : Date.now())) {
    this.agora = agora;
    this.seguidos = 0;
    this.vozEm = -1e12;
  }
  /** Um bloco do microfone. Devolve true no instante em que o aluno começa a falar. */
  ouvir(bloco) {
    let s = 0;
    const n = bloco?.length ?? 0;
    for (let i = 0; i < n; i++) s += bloco[i] * bloco[i];
    const voz = n > 0 && Math.sqrt(s / n) > LIMIAR_VOZ;
    if (!voz) {
      this.seguidos = 0;
      return false;
    }
    this.seguidos++;
    if (this.seguidos < BLOCOS_PARA_COMECAR) return false;
    this.vozEm = this.agora();
    return this.seguidos === BLOCOS_PARA_COMECAR;
  }
  get falando() {
    return this.agora() - this.vozEm < FALANDO_MS;
  }
}
