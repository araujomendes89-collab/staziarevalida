import React from "react";
import { useOptionalSession } from "../../session.jsx";
import { controleDe } from "./controle.js";
import { textoDoDoc } from "../../../../shared/docRico";

export function formatarHora(dataOuIso) {
  if (!dataOuIso) return "";
  const d = typeof dataOuIso === "number" || typeof dataOuIso === "string" ? new Date(dataOuIso) : dataOuIso;
  if (isNaN(d.getTime())) return "";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function formatarDataHoraCurta(dataOuIso) {
  if (!dataOuIso) return "";
  const d = typeof dataOuIso === "number" || typeof dataOuIso === "string" ? new Date(dataOuIso) : dataOuIso;
  if (isNaN(d.getTime())) return "";
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes} ${formatarHora(d)}`;
}

export function EstadoRascunho({ controle, ctx, emBloco = false }) {
  const [estado, setEstado] = React.useState(() => controle?.estado() ?? null);

  React.useEffect(() => {
    if (!controle) return;
    const unsub = controle.assinar(setEstado);
    return unsub;
  }, [controle]);

  if (!controle || !estado) return null;

  const { trava, recuperavel, fase, guardadoEm } = estado;
  const dicaPadrao = "O rascunho automático não muda a aula. Ela só muda quando você clica em Salvar texto.";

  // 1. Trava de outra pessoa
  if (trava && trava.minha === false) {
    const quem = trava.quem || "Outra pessoa";
    const hora = formatarHora(trava.desde);
    const texto = `${quem} está editando desde ${hora}. O editor ficou só para leitura.`;
    const aoAssumir = async () => {
      const ok = window.confirm(
        "A outra pessoa não vai conseguir salvar por cima. O texto dela fica guardado no rascunho dela."
      );
      if (ok) {
        await controle.assumir();
      }
    };

    if (emBloco) {
      return (
        <div className="eph-estado-bloco eph-estado-bloco--aviso" role="status" aria-live="polite" title={dicaPadrao}>
          <div className="eph-estado-texto">{texto}</div>
          <div className="eph-estado-acoes">
            <button type="button" className="eph-btn" onMouseDown={(e) => e.preventDefault()} onClick={aoAssumir}>
              Assumir a edição
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="eph-indicador eph-indicador--aviso" role="status" aria-live="polite" title={dicaPadrao}>
        <span>{texto}</span>
        <button type="button" className="eph-btn" onMouseDown={(e) => e.preventDefault()} onClick={aoAssumir}>
          Assumir a edição
        </button>
      </div>
    );
  }

  // 2. Trava da própria pessoa, mas aula mudou no servidor
  if (trava && trava.minha && trava.mudou) {
    const texto = "Esta aula foi salva por outra pessoa depois que você abriu.";
    const aoRecarregar = () => {
      ctx?.contexto?.aoRecarregar?.();
    };

    if (emBloco) {
      return (
        <div className="eph-estado-bloco eph-estado-bloco--perigo" role="status" aria-live="polite" title={dicaPadrao}>
          <div className="eph-estado-texto">{texto}</div>
          <div className="eph-estado-acoes">
            <button type="button" className="eph-btn eph-btn--primario" onMouseDown={(e) => e.preventDefault()} onClick={aoRecarregar}>
              Recarregar
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="eph-indicador eph-indicador--perigo" role="status" aria-live="polite" title={dicaPadrao}>
        <span>{texto}</span>
        <button type="button" className="eph-btn eph-btn--primario" onMouseDown={(e) => e.preventDefault()} onClick={aoRecarregar}>
          Recarregar
        </button>
      </div>
    );
  }

  // 3. Rascunho recuperável
  if (recuperavel) {
    const ondeTexto = recuperavel.onde === "local" ? "neste computador" : "no servidor";
    const dataHora = formatarDataHoraCurta(recuperavel.em);
    const textoBase = `Texto não salvo de ${dataHora} (${ondeTexto}).`;

    const aoRecuperar = () => {
      controle.recuperar();
    };

    const aoDescartar = () => {
      controle.descartar();
    };

    const aoCopiar = async () => {
      try {
        const txt = textoDoDoc(recuperavel.doc);
        await navigator.clipboard.writeText(txt);
      } catch {
        // ignora
      }
    };

    if (recuperavel.mesmaBase) {
      if (emBloco) {
        return (
          <div className="eph-estado-bloco eph-estado-bloco--aviso" role="status" aria-live="polite" title={dicaPadrao}>
            <div className="eph-estado-texto">{textoBase}</div>
            <div className="eph-estado-acoes">
              <button type="button" className="eph-btn eph-btn--primario" onMouseDown={(e) => e.preventDefault()} onClick={aoRecuperar}>
                Recuperar
              </button>
              <button type="button" className="eph-btn" onMouseDown={(e) => e.preventDefault()} onClick={aoDescartar}>
                Descartar
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="eph-indicador eph-indicador--aviso" role="status" aria-live="polite" title={dicaPadrao}>
          <span>{textoBase}</span>
          <button type="button" className="eph-btn eph-btn--primario" onMouseDown={(e) => e.preventDefault()} onClick={aoRecuperar}>
            Recuperar
          </button>
          <button type="button" className="eph-btn" onMouseDown={(e) => e.preventDefault()} onClick={aoDescartar}>
            Descartar
          </button>
        </div>
      );
    }

    const textoMudou = `${textoBase} A aula mudou depois desse rascunho.`;
    if (emBloco) {
      return (
        <div className="eph-estado-bloco eph-estado-bloco--aviso" role="status" aria-live="polite" title={dicaPadrao}>
          <div className="eph-estado-texto">{textoMudou}</div>
          <div className="eph-estado-acoes">
            <button type="button" className="eph-btn" onMouseDown={(e) => e.preventDefault()} onClick={aoCopiar}>
              Copiar o texto
            </button>
            <button type="button" className="eph-btn" onMouseDown={(e) => e.preventDefault()} onClick={aoDescartar}>
              Descartar
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="eph-indicador eph-indicador--aviso" role="status" aria-live="polite" title={dicaPadrao}>
        <span>{textoMudou}</span>
        <button type="button" className="eph-btn" onMouseDown={(e) => e.preventDefault()} onClick={aoCopiar}>
          Copiar o texto
        </button>
        <button type="button" className="eph-btn" onMouseDown={(e) => e.preventDefault()} onClick={aoDescartar}>
          Descartar
        </button>
      </div>
    );
  }

  // 4. Estados normais do rascunho
  let mensagem = "Rascunho automático ligado";
  if (fase === "pendente") {
    mensagem = "Alterações ainda não salvas";
  } else if (fase === "guardando") {
    mensagem = "Guardando rascunho…";
  } else if (fase === "guardado") {
    mensagem = `Rascunho guardado às ${formatarHora(guardadoEm)}`;
  } else if (fase === "so_local") {
    mensagem = "Sem conexão: rascunho guardado só neste computador";
  }

  if (emBloco) {
    return (
      <div className="eph-estado-bloco" role="status" aria-live="polite" title={dicaPadrao}>
        <div className="eph-estado-texto">{mensagem}</div>
      </div>
    );
  }

  return (
    <div className="eph-indicador" role="status" aria-live="polite" title={dicaPadrao}>
      <span>{mensagem}</span>
    </div>
  );
}

export default function IndicadorRascunho({ editor, ctx, backend: propBackend }) {
  const controle = controleDe(editor);
  const sessao = useOptionalSession();
  const backend = propBackend ?? sessao?.backend ?? null;

  if (controle) {
    controle.atualizarCtx(ctx);
  }

  React.useEffect(() => {
    if (controle && backend) {
      controle.ligar(backend, ctx);
    }
  }, [controle, backend, ctx]);

  if (!controle || !ctx?.contexto?.versionId) {
    return null;
  }

  return <EstadoRascunho controle={controle} ctx={ctx} emBloco={false} />;
}
