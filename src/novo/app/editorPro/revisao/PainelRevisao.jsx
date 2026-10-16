import React from "react";
import { SecaoPainel, Interruptor, useEstadoEditor } from "./painelLateral.jsx";
import { contarEditor, rotuloTempo } from "./contagem.js";
import { REGRAS_AUTOCORRECAO, assinarPrefs, definirPrefs, prefs } from "./preferencias.js";

export function usePrefsRevisao() {
  return React.useSyncExternalStore(assinarPrefs, prefs, prefs);
}

export function ResumoContagem({ editor }) {
  const c = useEstadoEditor(editor, (e) => JSON.stringify(contarEditor(e)));
  const { tudo, selecao } = JSON.parse(c);
  const linhas = (r) => (
    <dl className="ep-pl-contagem-lista">
      <dt>Palavras</dt><dd>{r.palavras}</dd>
      <dt>Caracteres (com espaços)</dt><dd>{r.caracteres}</dd>
      <dt>Caracteres (sem espaços)</dt><dd>{r.caracteresSemEspacos}</dd>
      <dt>Tempo de leitura</dt><dd>{rotuloTempo(r.minutosLeitura)}</dd>
    </dl>
  );
  return (
    <div data-testid="contagem">
      {linhas(tudo)}
      {selecao && (
        <>
          <h4 className="ep-pl-subtitulo">Trecho selecionado</h4>
          {linhas(selecao)}
        </>
      )}
    </div>
  );
}

export default function PainelRevisao({ editor }) {
  const p = usePrefsRevisao();
  return (
    <div className="ep-pl" data-testid="painel-revisao">
      <SecaoPainel titulo="Contagem">
        <ResumoContagem editor={editor} />
      </SecaoPainel>
      <SecaoPainel titulo="Ortografia" dica="Usa o corretor do navegador, em português do Brasil. Palavras desconhecidas ganham um sublinhado ondulado; clique com o botão direito para ver sugestões.">
        <Interruptor rotulo="Verificar ortografia ao digitar" marcado={p.ortografia} onChange={(v) => definirPrefs({ ortografia: v })} />
      </SecaoPainel>
      <SecaoPainel titulo="Autocorreção" dica="Só troca símbolos. Letras, números e termos médicos nunca são alterados. Apertar Backspace logo depois desfaz a troca.">
        <Interruptor rotulo="Corrigir símbolos ao digitar" marcado={p.autocorrecao} onChange={(v) => definirPrefs({ autocorrecao: v })} />
        {REGRAS_AUTOCORRECAO.map((r) => (
          <Interruptor key={r.id} rotulo={r.rotulo} detalhe={r.exemplo} marcado={p.regras[r.id]} disabled={!p.autocorrecao} onChange={(v) => definirPrefs({ regras: { [r.id]: v } })} />
        ))}
      </SecaoPainel>
    </div>
  );
}
