import React from "react";
import { SecaoPainel, LinhaCampos, BotaoPainel, Interruptor, AvisoPainel, useEstadoEditor } from "./painelLateral.jsx";
import { estadoLocalizar } from "./localizar.js";

export default function PainelLocalizar({ editor, ctx }) {
  const [termo, setTermo] = React.useState("");
  const [troca, setTroca] = React.useState("");
  const [maiusculas, setMaiusculas] = React.useState(false);
  const [palavraInteira, setPalavraInteira] = React.useState(false);
  const [aviso, setAviso] = React.useState("");
  const total = useEstadoEditor(editor, (e) => estadoLocalizar(e.state).achados.length);
  const atual = useEstadoEditor(editor, (e) => estadoLocalizar(e.state).atual);

  const buscar = (t, m, p) => editor.commands.buscar(t, { maiusculas: m, palavraInteira: p });
  // ao fechar o painel, as marcações somem
  React.useEffect(() => () => { if (!editor.isDestroyed) editor.commands.limparBusca(); }, [editor]);

  const leitura = ctx.somenteLeitura;
  const tem = total > 0;
  return (
    <div className="ep-pl" data-testid="painel-localizar">
      <SecaoPainel titulo="Localizar">
        <input
          className="ep-pl-campo"
          type="search"
          placeholder="Texto a localizar"
          aria-label="Texto a localizar"
          value={termo}
          onChange={(e) => { setTermo(e.target.value); setAviso(""); buscar(e.target.value, maiusculas, palavraInteira); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? editor.commands.buscarAnterior() : editor.commands.buscarProximo(); } }}
        />
        <Interruptor rotulo="Diferenciar maiúsculas de minúsculas" marcado={maiusculas} onChange={(v) => { setMaiusculas(v); buscar(termo, v, palavraInteira); }} />
        <Interruptor rotulo="Palavra inteira" marcado={palavraInteira} onChange={(v) => { setPalavraInteira(v); buscar(termo, maiusculas, v); }} />
        <LinhaCampos>
          <BotaoPainel icon="chevron-up" titulo="Anterior (Shift+Enter)" disabled={!tem} onClick={() => editor.commands.buscarAnterior()}>Anterior</BotaoPainel>
          <BotaoPainel icon="chevron-down" titulo="Próximo (Enter)" disabled={!tem} onClick={() => editor.commands.buscarProximo()}>Próximo</BotaoPainel>
        </LinhaCampos>
        <p className="ep-pl-contagem" aria-live="polite" data-testid="resultado-busca">
          {!termo ? "Digite para procurar." : tem ? `${atual + 1} de ${total}` : "Nenhum resultado."}
        </p>
      </SecaoPainel>
      <SecaoPainel titulo="Substituir por" dica={leitura ? "O documento está em somente leitura." : "Desfazer (Ctrl+Z) volta a troca inteira."}>
        <input className="ep-pl-campo" type="text" placeholder="Novo texto (vazio apaga)" aria-label="Substituir por" value={troca} disabled={leitura} onChange={(e) => { setTroca(e.target.value); setAviso(""); }} />
        <LinhaCampos>
          <BotaoPainel disabled={!tem || leitura} onClick={() => editor.commands.substituirAtual(troca)}>Substituir</BotaoPainel>
          <BotaoPainel
            primario
            disabled={!tem || leitura}
            onClick={() => {
              const n = total;
              editor.commands.substituirTudo(troca);
              setAviso(`${n} ${n === 1 ? "trecho substituído" : "trechos substituídos"}.`);
            }}
          >
            Substituir tudo
          </BotaoPainel>
        </LinhaCampos>
        {aviso && <AvisoPainel>{aviso}</AvisoPainel>}
      </SecaoPainel>
    </div>
  );
}
