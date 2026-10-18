// Editor profissional (estilo Word), só na Administração. É uma casca: abas, botões, painéis e extensões vêm dos módulos
// registrados em ./modulos.js (cada módulo no próprio arquivo). Entra e sai o documento rico (src/shared/docRico), saneado.
import React from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { ABAS, ROTULOS_GRUPO, botoesDaAba, extensoesDe, paineis } from "./registroEditor.js";
import { sanear } from "../../../shared/docRico";
import { Botao, Grupo } from "./ui.jsx";
import { Icon } from "../../ds";
import "./modulos.js";
import "../textoRico/textoRico.css";
import "./editorPro.css";

/**
 * valor: documento rico ({ type: "doc", content }) · aoMudar(doc saneado, com "ref" nos blocos)
 * config / aoMudarConfig: configuração do documento inteiro (página, estilos...), uma chave por módulo.
 * contexto: dados da tela para os módulos (ex.: { versionId }). aoCriar(editor): para testes e telas que precisam do editor.
 * Os botões e painéis recebem ctx = { config, mudarConfig, contexto, somenteLeitura, abrirPainel(id), fecharPainel(), painelAberto }.
 * Painel com "atalho" (ex.: "Mod-f") abre com Ctrl/Cmd + a tecla, com o cursor no primeiro campo.
 * compacto: campo curto (alternativa, legenda...): folha sem margem de página.
 * somenteTexto: sem as ferramentas de formatação (ex.: roteiro de podcast, que vai para a voz): só desfazer, Revisão e Exibir.
 * semModulos: ids de módulos fora deste editor (extensões, botões e painéis). Ex.: ["imagens"] num campo de questão.
 * Celular (até 600 px; pedido do dono 18/10, só na Administração, que é onde o editor existe): barra curta com os botões principais
 * (negrito, itálico, lista com marcadores, lista numerada e link) e "Mais", que abre o resto da barra (abas, títulos, citação,
 * tabela, desfazer/refazer, limpar...). Tudo rola de lado DENTRO da caixa, sem estourar a tela; botões com 44 px de toque; o "Mais"
 * fecha com Esc e ao tocar fora. No computador a barra é a mesma de sempre. O conteúdo salvo não muda.
 */
const ESTREITO = "(max-width: 600px)";
function useEstreito() {
  const consulta = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(ESTREITO).matches : false);
  const [estreito, setEstreito] = React.useState(consulta);
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(ESTREITO);
    const mudou = () => setEstreito(mq.matches);
    mudou();
    mq.addEventListener?.("change", mudou);
    return () => mq.removeEventListener?.("change", mudou);
  }, []);
  return estreito;
}
// Botões da barra curta do celular (na ordem); o link abre o painel "Hiperlink". Campo só texto (fala de podcast), que não tem
// formatação: desfazer e refazer ficam à vista. O estado do rascunho (aulas) aparece numa linha embaixo da barra curta.
const RAPIDOS = ["negrito", "italico", "lista", "numerada"];
const RAPIDOS_SO_TEXTO = ["desfazer", "refazer"];
const PAINEL_LINK = "hiperlink";
const ESTADO = "rascunho";
export default function EditorDocumento({ valor, aoMudar, config = {}, aoMudarConfig, contexto, somenteLeitura = false, rotulo, id, aoCriar, somenteTexto = false, compacto = false, semModulos = [] }) {
  const [aba, setAba] = React.useState("inicio");
  const [painel, setPainel] = React.useState(null);
  const estreito = useEstreito();
  const [mais, setMais] = React.useState(false);
  const maisRef = React.useRef(null);
  const barraRef = React.useRef(null);
  const idBarra = `ep-mais-${React.useId().replace(/:/g, "")}`;
  // "Mais" aberto: tocar fora dele (no texto, em outro campo, na página) fecha
  React.useEffect(() => {
    if (!estreito || !mais) return undefined;
    const tocouFora = (e) => {
      const alvo = e.target;
      if (maisRef.current?.contains(alvo) || barraRef.current?.contains(alvo)) return;
      setMais(false);
    };
    document.addEventListener("pointerdown", tocouFora, true);
    document.addEventListener("mousedown", tocouFora, true);
    return () => {
      document.removeEventListener("pointerdown", tocouFora, true);
      document.removeEventListener("mousedown", tocouFora, true);
    };
  }, [estreito, mais]);
  const ultimo = React.useRef(JSON.stringify(valor ?? null));
  const aoMudarRef = React.useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  const ctxInicial = React.useRef({ config, contexto, somenteLeitura });
  const fora = React.useRef(semModulos).current;

  const editor = useEditor({
    extensions: extensoesDe(ctxInicial.current, fora),
    content: valor,
    editable: !somenteLeitura,
    editorProps: { attributes: { class: "ep-folha tr-doc", role: "textbox", "aria-multiline": "true", ...(rotulo ? { "aria-label": rotulo } : {}), spellcheck: "true", lang: "pt-BR" } },
    onUpdate: ({ editor: e }) => {
      const doc = sanear(e.getJSON());
      const s = JSON.stringify(doc);
      if (s === ultimo.current) return;
      ultimo.current = s;
      aoMudarRef.current?.(doc);
    },
  });
  // a barra se redesenha a cada mudança (botões ativos/desligados)
  useEditorState({ editor, selector: (snap) => snap.transactionNumber });

  React.useEffect(() => {
    if (editor) aoCriar?.(editor);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps
  // valor trocado por fora (Cancelar, outra aula): recarrega sem marcar como alteração
  React.useEffect(() => {
    const s = JSON.stringify(valor ?? null);
    if (!editor || s === ultimo.current) return;
    ultimo.current = s;
    editor.commands.setContent(valor, { emitUpdate: false });
  }, [editor, valor]);
  React.useEffect(() => {
    if (editor && editor.isEditable === somenteLeitura) editor.setEditable(!somenteLeitura);
  }, [editor, somenteLeitura]);

  // painel lateral aberto por botão de módulo ou atalho (ex.: Ctrl+F abre "Localizar e substituir" e põe o cursor no campo)
  const painelRef = React.useRef(null);
  const [focarPainel, setFocarPainel] = React.useState(0);
  const abrirPainel = (pid, { focar = true } = {}) => {
    if (!paineis().some((p) => p.id === pid && !fora.includes(p.modulo))) return false;
    setPainel(pid);
    if (focar) setFocarPainel((n) => n + 1);
    return true;
  };
  React.useEffect(() => {
    if (!focarPainel) return;
    const campo = painelRef.current?.querySelector("input:not([disabled]), textarea:not([disabled]), select:not([disabled])");
    campo?.focus();
    campo?.select?.();
  }, [focarPainel]);
  const aoTeclar = (e) => {
    if (e.key === "Escape" && estreito && mais) {
      // Esc fecha o "Mais"; se o foco estava dentro dele, volta para o botão "Mais"
      const dentro = barraRef.current?.contains(document.activeElement);
      setMais(false);
      if (dentro) maisRef.current?.focus();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const tecla = String(e.key || "").toLowerCase();
    const alvo = paineis().find((p) => !fora.includes(p.modulo) && typeof p.atalho === "string" && p.atalho.toLowerCase() === `mod-${tecla}`);
    if (alvo && abrirPainel(alvo.id)) e.preventDefault();
  };

  const ctx = {
    config,
    mudarConfig: (chave, v) => aoMudarConfig?.({ ...config, [chave]: v }),
    contexto,
    somenteLeitura,
    abrirPainel,
    fecharPainel: () => setPainel(null),
    painelAberto: painel,
  };
  if (!editor) return null;

  const permitido = (b) => !fora.includes(b.modulo) && (!somenteTexto || b.grupo === "historico" || b.aba === "revisao" || b.aba === "exibir");
  // celular: os botões da barra curta não se repetem dentro do "Mais" (e uma aba que ficaria vazia some)
  const doInicio = (ids) => (estreito ? ids.map((rid) => botoesDaAba("inicio").find((b) => b.id === rid)).filter((b) => b && permitido(b)) : []);
  const principais = doInicio(RAPIDOS);
  const rapidos = principais.length ? principais : doInicio(RAPIDOS_SO_TEXTO);
  const estado = doInicio([ESTADO]);
  const naBarraCurta = new Set([...rapidos, ...estado].map((b) => b.id));
  const naBarra = (b) => permitido(b) && !naBarraCurta.has(b.id);
  const abas = ABAS.filter((a) => botoesDaAba(a.id).some(naBarra));
  const abaAtiva = abas.some((a) => a.id === aba) ? aba : abas[0]?.id;
  const grupos = [];
  for (const b of botoesDaAba(abaAtiva).filter(naBarra)) {
    const g = grupos[grupos.length - 1];
    if (g && g.id === b.grupo) g.botoes.push(b);
    else grupos.push({ id: b.grupo, botoes: [b] });
  }
  const listaPaineis = paineis().filter((p) => !fora.includes(p.modulo));
  const aberto = listaPaineis.find((p) => p.id === painel);
  const painelLink = estreito && !somenteTexto ? listaPaineis.find((p) => p.id === PAINEL_LINK) : null;
  const paineisDaBarra = painelLink ? listaPaineis.filter((p) => p.id !== PAINEL_LINK) : listaPaineis;

  return (
    <div className={`ep-container${compacto ? " ep-container--compacto" : ""}${aberto ? " ep-container--painel" : ""}${estreito ? " ep-container--estreito" : ""}`} id={id} onKeyDown={aoTeclar}>
      {estreito && (
        <div className="ep-rapida" role="toolbar" aria-label="Ferramentas principais">
          {rapidos.map(({ id: bid, Componente }) => <Componente key={bid} editor={editor} ctx={ctx} />)}
          {painelLink && <Botao icon={painelLink.icone} label="Link" ativo={painel === painelLink.id} onClick={() => setPainel(painel === painelLink.id ? null : painelLink.id)} />}
          <button
            type="button"
            ref={maisRef}
            className={`ep-mais${mais ? " ep-ativo" : ""}`}
            aria-label="Mais"
            title="Mais ferramentas"
            aria-expanded={mais}
            aria-controls={idBarra}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMais((m) => !m)}
          >
            <Icon name={mais ? "chevron-up" : "ellipsis"} size={18} />
            <span>Mais</span>
          </button>
        </div>
      )}
      {estreito && estado.length > 0 && (
        <div className="ep-rapida-estado">
          {estado.map(({ id: bid, Componente }) => <Componente key={bid} editor={editor} ctx={ctx} />)}
        </div>
      )}
      <div className="ep-toolbar" ref={barraRef} {...(estreito ? { id: idBarra, role: "group", "aria-label": "Mais ferramentas", hidden: !mais } : {})}>
        <div className="ep-tablist" role="tablist" aria-label="Abas do editor">
          {abas.map((a) => (
            <button key={a.id} type="button" role="tab" aria-selected={abaAtiva === a.id} className={`ep-tab${abaAtiva === a.id ? " ep-tab--ativa" : ""}`} onClick={() => setAba(a.id)}>
              {a.rotulo}
            </button>
          ))}
          {paineisDaBarra.length > 0 && (
            <div className="ep-paineis-btn">
              {paineisDaBarra.map((p) => (
                <Botao key={p.id} icon={p.icone} label={p.titulo} ativo={painel === p.id} onClick={() => setPainel(painel === p.id ? null : p.id)} />
              ))}
            </div>
          )}
        </div>
        <div className="ep-tools" role="toolbar" aria-label="Ferramentas do editor">
          {grupos.map((g, i) => (
            <React.Fragment key={g.id}>
              {i > 0 && <span className="ep-sep" aria-hidden="true" />}
              <Grupo rotulo={ROTULOS_GRUPO[g.id] ?? g.id}>
                {g.botoes.map(({ id: bid, Componente }) => <Componente key={bid} editor={editor} ctx={ctx} />)}
              </Grupo>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="ep-corpo">
        <div className="ep-area-texto">
          <EditorContent editor={editor} />
        </div>
        {aberto && (
          <aside className="ep-painel" aria-label={aberto.titulo} ref={painelRef}>
            <div className="ep-painel-header">
              {aberto.titulo}
              <button type="button" className="ep-painel-fechar" onClick={() => setPainel(null)} aria-label="Fechar painel">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="ep-painel-corpo">
              <aberto.Componente editor={editor} ctx={ctx} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
