import React from "react";
import { OPCOES_FIGURA, figurasSemAlt } from "../../../../shared/docRico/modulos/imagens";
import { figuraSelecionada } from "./extensaoFigura.js";
import "./figura.css";
import "../tabelas/tabelas.css";

export function PainelFormatarImagem({ editor, ctx }) {
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!editor) return;
    const onTransacao = () => setTick((t) => t + 1);
    editor.on("transaction", onTransacao);
    editor.on("selectionUpdate", onTransacao);
    return () => {
      editor.off("transaction", onTransacao);
      editor.off("selectionUpdate", onTransacao);
    };
  }, [editor]);

  const desabilitado = Boolean(ctx?.somenteLeitura);
  const figura = figuraSelecionada(editor);
  const docJson = editor ? editor.getJSON() : null;
  const semAltTotal = docJson ? figurasSemAlt(docJson) : 0;

  if (!figura) {
    return (
      <div className="ep-form" data-testid="painel-formatar-imagem">
        <p className="ep-aviso">Clique numa imagem do texto para formatar.</p>
        {semAltTotal > 0 && (
          <p className="ep-erro">
            {semAltTotal} imagem(ns) sem texto alternativo: a aula não pode ser publicada assim.
          </p>
        )}
      </div>
    );
  }

  const attrs = figura.attrs || {};
  const mudar = (novos) => {
    editor.commands.atualizarFigura(novos);
  };

  const semAltAtual = !attrs.alt || !String(attrs.alt).trim();
  const larguraAtual = typeof attrs.largura === "number" ? attrs.largura : 100;

  return (
    <div className="ep-form" data-testid="painel-formatar-imagem">
      <label className="ep-campo">
        Texto alternativo
        <textarea
          rows={3}
          maxLength={500}
          value={attrs.alt || ""}
          onChange={(e) => mudar({ alt: e.target.value })}
          disabled={desabilitado}
          placeholder="Descreva a imagem para acessibilidade..."
        />
        {semAltAtual && (
          <p className="ep-erro">
            Obrigatório para publicar: descreva a imagem para quem não pode vê-la.
          </p>
        )}
      </label>

      <label className="ep-campo">
        Legenda
        <input
          type="text"
          maxLength={300}
          value={attrs.legenda || ""}
          onChange={(e) => mudar({ legenda: e.target.value })}
          disabled={desabilitado}
          placeholder="Legenda da figura"
        />
        <span className="ep-aviso">
          Aparece como “Figura N – …”; o número é automático.
        </span>
      </label>

      <label className="ep-campo">
        Disposição
        <select
          value={attrs.disposicao || "linha"}
          onChange={(e) => mudar({ disposicao: e.target.value })}
          disabled={desabilitado}
        >
          {OPCOES_FIGURA.disposicoes.map((d) => (
            <option key={d.valor} value={d.valor}>
              {d.rotulo}
            </option>
          ))}
        </select>
      </label>

      <label className="ep-campo">
        Alinhamento
        <select
          value={attrs.alinhamento || "centro"}
          onChange={(e) => mudar({ alinhamento: e.target.value })}
          disabled={desabilitado}
        >
          {OPCOES_FIGURA.alinhamentos.map((a) => (
            <option key={a.valor} value={a.valor}>
              {a.rotulo}
            </option>
          ))}
        </select>
      </label>

      <label className="ep-campo">
        Largura (%)
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <input
            type="number"
            min={10}
            max={100}
            style={{ width: "70px" }}
            value={larguraAtual}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n)) {
                mudar({ largura: Math.max(10, Math.min(100, n)) });
              }
            }}
            disabled={desabilitado}
          />
          {[25, 50, 75, 100].map((w) => (
            <button
              key={w}
              type="button"
              className={`ep-btn${larguraAtual === w ? " ep-ativo" : ""}`}
              onClick={() => mudar({ largura: w })}
              disabled={desabilitado}
            >
              {w}%
            </button>
          ))}
        </div>
        <span className="ep-aviso">A altura acompanha: a proporção é mantida.</span>
      </label>

      <label className="ep-campo">
        Borda
        <select
          value={attrs.borda || ""}
          onChange={(e) => mudar({ borda: e.target.value || null })}
          disabled={desabilitado}
        >
          <option value="">Sem borda</option>
          {OPCOES_FIGURA.bordas.map((b) => (
            <option key={b.valor} value={b.valor}>
              {b.rotulo}
            </option>
          ))}
        </select>
      </label>

      <label className="ep-campo">
        Cantos
        <select
          value={attrs.cantos || "retos"}
          onChange={(e) => mudar({ cantos: e.target.value })}
          disabled={desabilitado}
        >
          {OPCOES_FIGURA.cantos.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </label>

      <label className="ep-campo ep-campo--linha">
        <input
          type="checkbox"
          checked={Boolean(attrs.sombra)}
          onChange={(e) => mudar({ sombra: e.target.checked })}
          disabled={desabilitado}
        />
        Sombra
      </label>

      {semAltTotal > 0 && (
        <p className="ep-erro">
          {semAltTotal} imagem(ns) sem texto alternativo: a aula não pode ser publicada assim.
        </p>
      )}
    </div>
  );
}
export default PainelFormatarImagem;
