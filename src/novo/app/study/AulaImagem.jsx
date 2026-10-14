// Imagens protegidas da aula (Revisão da Aula e flashcards ilustrados): vêm do servidor como bytes, com o login do aluno
// (/api/content-hub/aula-aluno/<tema>/<revisao|frente|verso>/<n>); nunca há endereço de arquivo, baixar, arrastar nem menu de imagem.
// O rodapé das imagens prontas traz o código interno e "Ministério da Saúde": a faixa PROVISÓRIA do aula.css (.al-face::after e
// .al-a4::after) cobre esse trecho. O cartão do baralho usa as mesmas classes, então a cobertura vale nos dois lugares.
import React from "react";
import { useSession } from "../session.jsx";
import "./aula.css";

export const noMenu = (e) => e.preventDefault();

/** Imagem protegida pelo servidor: baixa com o login e mostra como blob. { src } | { error } | {}. */
export function useAulaImage(temaId, qual, n, enabled = true) {
  const { backend } = useSession();
  const [state, setState] = React.useState({});
  React.useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    let url = null;
    (async () => {
      try {
        const token = backend.accessToken ? await backend.accessToken() : null;
        const res = await fetch(`/api/content-hub/aula-aluno/${temaId}/${qual}/${n}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) throw new Error("falhou");
        url = URL.createObjectURL(await res.blob());
        if (alive) setState({ src: url });
      } catch {
        if (alive) setState({ error: true });
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL?.(url);
    };
  }, [backend, temaId, qual, n, enabled]);
  return state;
}

export function ProtectedImage({ temaId, qual, n = 1, alt, enabled }) {
  const img = useAulaImage(temaId, qual, n, enabled);
  if (img.error) return <div role="status" style={{ padding: 16, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Não foi possível carregar a imagem agora.</div>;
  if (!img.src) return <div aria-busy="true" style={{ width: "100%", height: "100%", minHeight: 120, background: "var(--surface-sunken)" }} />;
  return <img src={img.src} alt={alt} draggable={false} onContextMenu={noMenu} onDragStart={noMenu} />;
}


/** Cartão ilustrado do baralho/revisão: vira por clique, toque, espaço ou Enter; mesmo estado "virado" da tela de revisão. */
export function CartaoIlustrado({ tema, n, front, back, flipped, onFlip }) {
  const [seen, setSeen] = React.useState(false);
  React.useEffect(() => { if (flipped) setSeen(true); }, [flipped]);
  const flip = () => { setSeen(true); onFlip(!flipped); };
  return (
    <div style={{ width: "100%", maxWidth: 420, margin: "0 auto" }}>
      <button type="button" className={`al-flip${flipped ? " on" : ""}`} onClick={flip} aria-pressed={flipped} aria-label={flipped ? "Mostrar pergunta" : "Mostrar resposta"} onContextMenu={noMenu}>
        <div className="al-flip-in">
          <div className="al-face">
            <ProtectedImage temaId={tema} qual="frente" n={n} alt={`Pergunta: ${front}`} />
          </div>
          <div className="al-face back">
            <ProtectedImage temaId={tema} qual="verso" n={n} alt={`Resposta: ${back}`} enabled={seen} />
          </div>
        </div>
      </button>
    </div>
  );
}
