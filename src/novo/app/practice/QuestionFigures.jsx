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

/** A figura como imagem, com o texto alternativo; enquanto carrega ou se falhar, mostra um aviso em português. */
export function FigureImage({ questionId, image, index, onOpen, style }) {
  const fig = useFigureSrc(questionId, image, index);
  if (fig.error)
    return (
      <div role="status" style={{ padding: 12, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        {FAILED}
        <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 4 }}>{image.alt}</div>
      </div>
    );
  if (!fig.src) return <div aria-busy="true" style={{ minHeight: 120, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--surface-sunken)" }} />;
  const img = <img src={fig.src} alt={image.alt} loading="lazy" style={{ display: "block", maxWidth: "100%", maxHeight: 420, margin: "0 auto", borderRadius: "var(--radius-md)", ...style }} />;
  return onOpen ? (
    <button type="button" onClick={() => onOpen({ ...image, src: fig.src })} aria-label={`Ampliar: ${image.alt}`} style={{ display: "block", padding: 0, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "#fff", cursor: "zoom-in", maxWidth: "100%" }}>
      {img}
    </button>
  ) : (
    img
  );
}

/** Figura do tipo "tabela" (recorte de tabela do caderno): usa a largura toda, sem o teto de altura das figuras. */
const ESTILO_TABELA = { maxHeight: "none" };

/**
 * Um grupo de figuras do enunciado, na posição em que a prova as mostra. `indices` são as posições ORIGINAIS em `images`: o endereço
 * da figura e a legenda "Figura N" seguem essa numeração, mesmo quando a figura aparece em outro ponto do texto.
 */
export function FigurasDaQuestao({ images, indices, questionId, onOpen }) {
  if (!images?.length || !indices?.length) return null;
  return (
    <div className="tq-figs" style={{ display: "flex", flexDirection: "column", gap: 12, margin: "16px 0" }}>
      {indices.map((i) => {
        const img = images[i];
        if (!img) return null;
        return (
          <figure key={img.path ?? img.url ?? i} style={{ margin: 0 }}>
            <FigureImage questionId={questionId} image={img} index={i} onOpen={onOpen} style={img.tipo === "tabela" ? ESTILO_TABELA : undefined} />
            {images.length > 1 && <figcaption style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 4 }}>Figura {i + 1}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}

/** A figura ampliada (um diálogo só por cartão). `figura`: { src, alt } ou null. */
export function FiguraAmpliada({ figura, onClose }) {
  if (!figura) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={figura.alt} onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()} style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--surface-overlay)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <img src={figura.src} alt={figura.alt} style={{ maxWidth: "100%", maxHeight: "100%", background: "#fff", borderRadius: "var(--radius-md)" }} />
      <button type="button" autoFocus aria-label="Fechar" className="sm-btn sm-btn--secondary sm-btn--sm" style={{ position: "absolute", top: 16, right: 16 }} onClick={onClose}>
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
