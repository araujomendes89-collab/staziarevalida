import { sanear } from "../../../../shared/docRico";

export const localStorageSeguro = {
  ler(chave) {
    try {
      const v = localStorage.getItem(chave);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      // falha = ignora
    }
  },
  apagar(chave) {
    try {
      localStorage.removeItem(chave);
    } catch {
      // falha = ignora
    }
  },
};

export class ControleHistorico {
  constructor({
    editor,
    contexto,
    somenteLeitura = false,
    guarda = localStorageSeguro,
    tempo = {},
  }) {
    this.editor = editor;
    this.contexto = contexto;
    this.somenteLeitura = Boolean(somenteLeitura);
    this.guarda = guarda;
    this.tempo = {
      agora: tempo.agora ?? (() => Date.now()),
      setTimeout: tempo.setTimeout ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimeout: tempo.clearTimeout ?? ((id) => clearTimeout(id)),
      setInterval: tempo.setInterval ?? ((fn, ms) => setInterval(fn, ms)),
      clearInterval: tempo.clearInterval ?? ((id) => clearInterval(id)),
    };

    this.chave = `stazia.editorPro.rascunho.${this.contexto?.versionId ?? ""}`;
    this.backend = null;
    this.ctx = null;
    this.ligado = false;

    this._assinantes = new Set();
    this._estado = {
      ativo: false,
      fase: "parado",
      guardadoEm: null,
      trava: null,
      recuperavel: null,
      erro: null,
    };

    this._timerLocal = null;
    this._timerServidor = null;
    this._primeiraMudancaEm = null;
    this.travaInterval = null;

    this._onPageHide = null;
    this._onBeforeUnload = null;
    this._onVisibilityChange = null;
  }

  assinar(fn) {
    this._assinantes.add(fn);
    fn(this.estado());
    return () => {
      this._assinantes.delete(fn);
    };
  }

  estado() {
    return {
      ativo: this._estado.ativo,
      fase: this._estado.fase,
      guardadoEm: this._estado.guardadoEm,
      trava: this._estado.trava ? { ...this._estado.trava } : null,
      recuperavel: this._estado.recuperavel ? { ...this._estado.recuperavel } : null,
      erro: this._estado.erro,
    };
  }

  _notificar() {
    const s = this.estado();
    for (const fn of this._assinantes) {
      try {
        fn(s);
      } catch {
        // ignora erros de assinantes
      }
    }
  }

  atualizarCtx(ctxAtual) {
    this.ctx = ctxAtual;
    if (ctxAtual?.somenteLeitura !== undefined) {
      this.somenteLeitura = Boolean(ctxAtual.somenteLeitura);
    }
  }

  async ligar(backend, ctxAtual) {
    if (!this.contexto?.versionId || this.somenteLeitura) {
      this.ctx = ctxAtual;
      return;
    }

    if (this.ligado) {
      this.atualizarCtx(ctxAtual);
      return;
    }

    if (!backend) {
      this.ctx = ctxAtual;
      return;
    }

    this.backend = backend;
    this.atualizarCtx(ctxAtual);
    this.ligado = true;
    this._estado.ativo = true;
    this._notificar();

    await this.pegarTrava(false);
    await this.carregarRascunhos();

    this.travaInterval = this.tempo.setInterval(() => {
      this.pegarTrava(false);
    }, 30000);

    if (typeof window !== "undefined") {
      this._onPageHide = () => this.gravarLocalAgora();
      this._onBeforeUnload = () => this.gravarLocalAgora();
      window.addEventListener("pagehide", this._onPageHide);
      window.addEventListener("beforeunload", this._onBeforeUnload);
    }

    if (typeof document !== "undefined") {
      this._onVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          this.enviarAgora();
        }
      };
      document.addEventListener("visibilitychange", this._onVisibilityChange);
    }
  }

  async pegarTrava(assumir = false) {
    if (!this.backend || !this.contexto?.versionId) return;

    try {
      const res = await this.backend.rpc("app_ch_doc_trava", {
        p_version_id: this.contexto.versionId,
        p_base_hash: this.contexto.contentHash,
        p_assumir: Boolean(assumir),
      });

      this._estado.erro = null;

      if (!res || res.minha === false) {
        this.editor?.setEditable(false);
        this._estado.trava = {
          minha: false,
          quem: res?.quem ?? "",
          desde: res?.desde ?? null,
        };
      } else if (res.mudou) {
        this.editor?.setEditable(false);
        this._estado.trava = {
          minha: true,
          quem: res?.quem ?? "",
          desde: res?.desde ?? null,
          mudou: true,
        };
      } else {
        this.editor?.setEditable(!this.somenteLeitura);
        this._estado.trava = {
          minha: true,
          quem: res?.quem ?? "",
          desde: res?.desde ?? null,
          mudou: false,
        };
      }
    } catch (err) {
      this._estado.trava = null;
      this._estado.erro = err?.message || String(err);
    }

    this._notificar();
  }

  aoMudar() {
    if (!this.contexto?.versionId || this.somenteLeitura) return;
    if (this._estado.trava && this._estado.trava.minha === false) return;

    this._estado.fase = "pendente";
    this._notificar();

    // 1 s de espera para gravar no localStorage
    this.tempo.clearTimeout(this._timerLocal);
    this._timerLocal = this.tempo.setTimeout(() => {
      this.gravarLocalAgora();
    }, 1000);

    // 10 s parado (debounce), mas no máximo 60 s depois da primeira mudança pendente
    if (this._primeiraMudancaEm == null) {
      this._primeiraMudancaEm = this.tempo.agora();
    }
    this.tempo.clearTimeout(this._timerServidor);
    const decorrido = this.tempo.agora() - this._primeiraMudancaEm;
    const restanteMax = Math.max(0, 60000 - decorrido);
    const espera = Math.min(10000, restanteMax);
    this._timerServidor = this.tempo.setTimeout(() => {
      this.enviarAgora();
    }, espera);
  }

  gravarLocalAgora() {
    if (!this.contexto?.versionId) return;
    this.tempo.clearTimeout(this._timerLocal);
    this._timerLocal = null;

    try {
      const doc = sanear(this.editor.getJSON());
      const config = this.ctx?.config ?? {};
      const agoraIso = new Date(this.tempo.agora()).toISOString();
      this.guarda.gravar(this.chave, {
        doc,
        config,
        base_hash: this.contexto.contentHash,
        em: agoraIso,
      });
    } catch {
      // falha = ignora
    }
  }

  async enviarAgora() {
    if (this._estado.fase !== "pendente") return;
    if (!this.backend || !this.contexto?.versionId) return;

    this.tempo.clearTimeout(this._timerServidor);
    this._timerServidor = null;
    this._primeiraMudancaEm = null;

    this.gravarLocalAgora();

    this._estado.fase = "guardando";
    this._notificar();

    try {
      const doc = sanear(this.editor.getJSON());
      const config = this.ctx?.config ?? {};
      const res = await this.backend.rpc("app_ch_doc_rascunho_salvar", {
        p_version_id: this.contexto.versionId,
        p_doc: doc,
        p_config: config,
        p_base_hash: this.contexto.contentHash,
      });

      if (this._estado.fase === "guardando") {
        this._estado.fase = "guardado";
        this._estado.guardadoEm = res?.em ? new Date(res.em).getTime() : this.tempo.agora();
      }
    } catch (err) {
      if (this._estado.fase === "guardando") {
        this._estado.fase = "so_local";
      }
      this._estado.erro = err?.message || String(err);
    }

    this._notificar();
  }

  async carregarRascunhos() {
    let rascunhoServidor = null;
    if (this.backend && this.contexto?.versionId) {
      try {
        rascunhoServidor = await this.backend.rpc("app_ch_doc_rascunho_ler", {
          p_version_id: this.contexto.versionId,
        });
      } catch {
        // erro = ignora
      }
    }

    let rascunhoLocal = null;
    try {
      rascunhoLocal = this.guarda.ler(this.chave);
    } catch {
      // ignora
    }

    let rascunho = null;
    let onde = null;
    if (rascunhoServidor && rascunhoLocal) {
      const tServidor = new Date(rascunhoServidor.em).getTime();
      const tLocal = new Date(rascunhoLocal.em).getTime();
      if (tLocal > tServidor) {
        rascunho = rascunhoLocal;
        onde = "local";
      } else {
        rascunho = rascunhoServidor;
        onde = "servidor";
      }
    } else if (rascunhoServidor) {
      rascunho = rascunhoServidor;
      onde = "servidor";
    } else if (rascunhoLocal) {
      rascunho = rascunhoLocal;
      onde = "local";
    }

    if (!rascunho || !rascunho.doc) {
      this._estado.recuperavel = null;
      this._notificar();
      return;
    }

    // Se o texto dele for igual ao documento aberto agora -> apaga os dois e não mostra nada
    const docAtual = sanear(this.editor.getJSON(), { semRef: true });
    const configAtual = this.ctx?.config ?? {};
    const sAtual = JSON.stringify({ doc: docAtual, config: configAtual });

    const docRascunho = sanear(rascunho.doc, { semRef: true });
    const configRascunho = rascunho.config ?? {};
    const sRascunho = JSON.stringify({ doc: docRascunho, config: configRascunho });

    if (sAtual === sRascunho) {
      this.guarda.apagar(this.chave);
      if (this.backend && this.contexto?.versionId) {
        this.backend.rpc("app_ch_doc_rascunho_apagar", {
          p_version_id: this.contexto.versionId,
        }).catch(() => {});
      }
      this._estado.recuperavel = null;
    } else {
      this._estado.recuperavel = {
        doc: rascunho.doc,
        config: configRascunho,
        em: rascunho.em,
        onde,
        mesmaBase: rascunho.base_hash === this.contexto.contentHash,
      };
    }

    this._notificar();
  }

  async recuperar() {
    const rec = this._estado.recuperavel;
    if (!rec || !rec.mesmaBase) return;

    if (rec.config && typeof rec.config === "object" && this.ctx?.mudarConfig) {
      for (const [chave, valor] of Object.entries(rec.config)) {
        if (JSON.stringify(this.ctx.config?.[chave] ?? null) !== JSON.stringify(valor ?? null)) {
          const ctxAntigo = this.ctx;
          this.ctx.mudarConfig(chave, valor);
          const inicio = this.tempo.agora();
          while (this.ctx === ctxAntigo && (this.tempo.agora() - inicio) < 500) {
            await new Promise((resolve) => this.tempo.setTimeout(resolve, 20));
          }
        }
      }
    }

    this.editor.commands.setContent(rec.doc, { emitUpdate: true });
    this._estado.recuperavel = null;
    this._notificar();
  }

  async descartar() {
    this.guarda.apagar(this.chave);
    if (this.backend && this.contexto?.versionId) {
      try {
        await this.backend.rpc("app_ch_doc_rascunho_apagar", {
          p_version_id: this.contexto.versionId,
        });
      } catch {
        // ignora
      }
    }
    this._estado.recuperavel = null;
    this._notificar();
  }

  async assumir() {
    return this.pegarTrava(true);
  }

  desligar() {
    if (this.travaInterval) {
      this.tempo.clearInterval(this.travaInterval);
      this.travaInterval = null;
    }
    if (this._timerLocal) {
      this.tempo.clearTimeout(this._timerLocal);
      this._timerLocal = null;
    }
    if (this._timerServidor) {
      this.tempo.clearTimeout(this._timerServidor);
      this._timerServidor = null;
    }

    if (typeof window !== "undefined") {
      if (this._onPageHide) window.removeEventListener("pagehide", this._onPageHide);
      if (this._onBeforeUnload) window.removeEventListener("beforeunload", this._onBeforeUnload);
    }
    if (typeof document !== "undefined") {
      if (this._onVisibilityChange) document.removeEventListener("visibilitychange", this._onVisibilityChange);
    }

    if (this._estado.fase === "pendente") {
      this.gravarLocalAgora();
      this.enviarAgora();
    }

    if (this.backend && this.contexto?.versionId) {
      this.backend.rpc("app_ch_doc_trava_soltar", {
        p_version_id: this.contexto.versionId,
      }).catch(() => {});
    }

    this.ligado = false;
    this._estado.ativo = false;
  }
}

export function controleDe(editor) {
  return editor?.storage?.historicoRascunho?.controle ?? null;
}
