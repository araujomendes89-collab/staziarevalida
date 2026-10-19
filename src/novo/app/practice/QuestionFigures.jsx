// Figuras que acompanham o enunciado (recortes do caderno oficial e figuras enviadas pela equipe). Toque/clique amplia.
// A figura do caderno tem endereço público (url). A enviada pela equipe fica num depósito privado (path): o servidor entrega um
// endereço assinado de curta duração (/api/question-figures), então o aluno nunca vê nome de arquivo.
import React from "react";
import { useSession } from "../session.jsx";
import { questionFigureUrl } from "../admin/questionFiguresApi.js";

/** Endereço da figura n da questão: o público, ou o assinado pedido ao servidor. { src } | { loading } | { error }. */
export function useFigureSrc(questionId, image, index) {
  const { backend } = useSession();
  const [state, setState] = React.useState(() => (image?.url ? { src: image.url } : { loading: true }));
  React.useEffect(() => {
    if (image?.url) {
      setState({ src: image.url });
      return undefined;
    }
    if (!image?.path || !questionId) {
      setState({ error: true });
      return undefined;
    }
    let alive = true;
    let blob = null;
    setState({ loading: true });
    questionFigureUrl(backend, questionId, index).then(
      (src) => {
        if (src?.startsWith("blob:")) blob = src;
        if (alive) setState({ src });
      },
      () => alive && setState({ error: true })
    );
    return () => {
      alive = false;
      if (blob) URL.revokeObjectURL?.(blob);
    };
  }, [backend, questionId, image?.url, image?.path, index]);
  return state;
}

const FAILED = "Não foi possível carregar a figura.";

/**
 * Figura do tipo "tabela" (recorte de tabela do caderno): sem o teto de altura das figuras e nunca mais estreita que LARGURA_LEGIVEL
 * (ou que o próprio arquivo, se ele for menor). Encolher um recorte de 733 px para os ~320 px do celular deixava a letra com ~8 px;
 * a 560 px ela fica com ~15 px. Em tela estreita (celular, ou tablet com o painel ao lado) a tabela rola para o lado dentro do cartão.
 */
export const LARGURA_LEGIVEL = 560;
const ehTabela = (image) => image?.tipo === "tabela";

/** A figura como imagem, com o texto alternativo; enquanto carrega ou se falhar, mostra um aviso em português. */
export function FigureImage({ questionId, image, index, onOpen, style, onLargura }) {
  const fig = useFigureSrc(questionId, image, index);
  const tabela = ehTabela(image);
  // largura do arquivo (só para a tabela): define a largura mínima legível sem esticar recorte pequeno
  const [largura, setLargura] = React.useState(0);
  const imgRef = React.useRef(null);
  const medir = React.useCallback(
    (el) => {
      const w = el?.naturalWidth || 0;
      if (!tabela || !w) return;
      setLargura(w);
      onLargura?.(w);
    },
    [tabela, onLargura]
  );
  // imagem que já estava no cache do navegador: pode terminar de carregar antes do onLoad ser ligado
  React.useLayoutEffect(() => {
    if (imgRef.current?.complete) medir(imgRef.current);
  }, [fig.src, medir]);
  if (fig.error)
    return (
      <div role="status" style={{ padding: 12, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        {FAILED}
        <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 4 }}>{image.alt}</div>
      </div>
    );
  if (!fig.src) return <div aria-busy="true" style={{ minHeight: 120, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--surface-sunken)" }} />;
  // largura legível só no enunciado do aluno (com "Ampliar"); a miniatura da Administração continua encolhendo
  const legivel = tabela && onOpen && largura > 0 ? Math.min(LARGURA_LEGIVEL, largura) : 0;
  const estiloImg = legivel
    ? { display: "block", width: "100%", height: "auto", maxWidth: "none", maxHeight: "none", margin: 0, borderRadius: "var(--radius-md)", ...style }
    : { display: "block", maxWidth: "100%", maxHeight: tabela ? "none" : 420, margin: "0 auto", borderRadius: "var(--radius-md)", ...style };
  const img = <img ref={imgRef} src={fig.src} alt={image.alt} loading="lazy" onLoad={(e) => medir(e.currentTarget)} style={estiloImg} />;
  const caixa = legivel ? { width: "100%", maxWidth: largura + 2, minWidth: legivel + 2, boxSizing: "border-box" } : { maxWidth: "100%" };
  return onOpen ? (
    <button type="button" onClick={() => onOpen({ ...image, src: fig.src })} aria-label={`Ampliar: ${image.alt}`} style={{ display: "block", padding: 0, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "#fff", cursor: "zoom-in", ...caixa }}>
      {img}
    </button>
  ) : (
    img
  );
}

/** Uma figura do tipo tabela: rola para o lado dentro do cartão quando não cabe na largura legível (com o aviso de deslizar). */
function FiguraTabela({ image, index, questionId, onOpen }) {
  const [larga, setLarga] = React.useState(false);
  const onLargura = React.useCallback((w) => setLarga(w >= LARGURA_LEGIVEL), []);
  return (
    <figure className="tq-fig-tabela" data-larga={larga ? "true" : "false"} style={{ margin: 0 }}>
      <div className="tq-tabela-rolagem" style={{ overflowX: "auto", maxWidth: "100%" }}>
        <FigureImage questionId={questionId} image={image} index={index} onOpen={onOpen} onLargura={onLargura} />
      </div>
      {/* aparece só quando a tabela não cabe (tela-questao.css, @container); fora da tela de questão, nunca */}
      <div className="tq-fig-tabela__dica" aria-hidden="true" style={{ display: "none" }}>
        Deslize para o lado para ver a tabela inteira. Toque para ampliar.
      </div>
    </figure>
  );
}

/**
 * Um grupo de figuras do enunciado, na posição em que a prova as mostra. `indices` são as posições ORIGINAIS em `images` (o endereço
 * da figura segue essa numeração, mesmo quando a figura aparece em outro ponto do texto). Legenda "Figura N" só quando há mais de uma
 * figura comum; as do tipo "tabela" não ganham legenda (a prova não tem; a tabela já traz o próprio título).
 */
export function FigurasDaQuestao({ images, indices, questionId, onOpen }) {
  if (!images?.length || !indices?.length) return null;
  const comuns = images.map((image, i) => (ehTabela(image) ? -1 : i)).filter((i) => i >= 0);
  return (
    <div className="tq-figs" style={{ display: "flex", flexDirection: "column", gap: 12, margin: "16px 0" }}>
      {indices.map((i) => {
        const img = images[i];
        if (!img) return null;
        const chave = img.path ?? img.url ?? i;
        if (ehTabela(img)) return <FiguraTabela key={chave} image={img} index={i} questionId={questionId} onOpen={onOpen} />;
        return (
          <figure key={chave} style={{ margin: 0 }}>
            <FigureImage questionId={questionId} image={img} index={i} onOpen={onOpen} />
            {comuns.length > 1 && <figcaption style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 4 }}>Figura {comuns.indexOf(i) + 1}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}

/**
 * A figura ampliada (um diálogo só por cartão). `figura`: { src, alt, tipo? } ou null. A tabela abre no tamanho do arquivo, com
 * rolagem (encaixar na tela do celular quase não aumentava a letra); as demais figuras encaixam na tela, como sempre.
 */
export function FiguraAmpliada({ figura, onClose }) {
  if (!figura) return null;
  const tabela = ehTabela(figura);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={figura.alt}
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--surface-overlay)", display: "flex", padding: 16, overflow: "auto", ...(tabela ? {} : { alignItems: "center", justifyContent: "center" }) }}
    >
      <img
        src={figura.src}
        alt={figura.alt}
        style={tabela ? { margin: "auto", flexShrink: 0, maxWidth: "none", maxHeight: "none", background: "#fff", borderRadius: "var(--radius-md)" } : { maxWidth: "100%", maxHeight: "100%", background: "#fff", borderRadius: "var(--radius-md)" }}
      />
      <button type="button" autoFocus aria-label="Fechar" className="sm-btn sm-btn--secondary sm-btn--sm" style={{ position: "fixed", top: 16, right: 16 }} onClick={onClose}>
        Fechar
      </button>
    </div>
  );
}

/** Todas as figuras em bloco, na ordem do array (prévia da Administração). */
export function QuestionFigures({ images, questionId }) {
  const [open, setOpen] = React.useState(null);
  if (!images?.length) return null;
  return (
    <>
      <FigurasDaQuestao images={images} indices={images.map((_, i) => i)} questionId={questionId} onOpen={setOpen} />
      <FiguraAmpliada figura={open} onClose={() => setOpen(null)} />
    </>
  );
}
