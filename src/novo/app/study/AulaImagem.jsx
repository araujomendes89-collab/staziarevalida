// Imagens protegidas da aula (Revisão da Aula e flashcards ilustrados): vêm do servidor como bytes, com o login do aluno
// (/api/content-hub/aula-aluno/<tema>/<revisao|frente|verso>/<n>); nunca há endereço de arquivo, baixar, arrastar nem menu de imagem.
// O rodapé das imagens prontas traz o código interno e "Ministério da Saúde": a faixa PROVISÓRIA do aula.css (.al-face::after e
// .al-a4::after) cobre esse trecho. O cartão do baralho usa as mesmas classes, então a cobertura vale nos dois lugares.
//
// Lentidão ao virar/responder (15/10/2026): cada imagem leva o tempo do servidor (login + banco + depósito + envio) e antes só era
// pedida no clique. Agora a imagem baixada fica guardada NA MEMÓRIA da aba (não no cache do navegador: o servidor segue "no-store"),
// já decodificada; o verso é pedido logo depois da frente e a tela de revisão adianta o próximo cartão. Assim o clique só vira.
import React from "react";
import { useSession } from "../session.jsx";
import "./aula.css";

export const noMenu = (e) => e.preventDefault();

// ── memória das imagens (por sessão do banco; some ao recarregar a página) ─────────────────────────────────────────────────
const LIMITE = 12; // imagens guardadas (frente e verso de ~6 cartões); as em uso na tela nunca saem
const memorias = new WeakMap();
const memoriaDo = (backend) => {
  let m = memorias.get(backend);
  if (!m) memorias.set(backend, (m = new Map()));
  return m;
};
const chave = (temaId, qual, n) => `${temaId}/${qual}/${n}`;

function enxugar(memoria) {
  for (const [k, e] of memoria) {
    if (memoria.size <= LIMITE) return;
    if (e.uso > 0 || !e.src) continue;
    memoria.delete(k);
    URL.revokeObjectURL?.(e.src);
  }
}

function entrada(backend, temaId, qual, n) {
  const memoria = memoriaDo(backend);
  const k = chave(temaId, qual, n);
  const achada = memoria.get(k);
  if (achada) {
    memoria.delete(k); // a mais usada por último vai para o fim (sai por último)
    memoria.set(k, achada);
    return achada;
  }
  const e = { uso: 0, src: null };
  e.promessa = (async () => {
    const token = backend.accessToken ? await backend.accessToken() : null;
    const res = await fetch(`/api/content-hub/aula-aluno/${temaId}/${qual}/${n}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error("falhou");
    const src = URL.createObjectURL(await res.blob());
    // decodifica fora da tela antes de mostrar: o cartão não trava no meio do giro para abrir a imagem
    if (typeof Image !== "undefined") {
      const im = new Image();
      im.src = src;
      if (im.decode) await im.decode().catch(() => {});
    }
    e.src = src;
    return src;
  })();
  // erro não fica guardado: a próxima vez tenta de novo
  e.promessa.catch(() => memoria.get(k) === e && memoria.delete(k));
  memoria.set(k, e);
  enxugar(memoria);
  return e;
}

/** Baixa (uma vez) e devolve o endereço local da imagem já decodificada. */
export function carregarAulaImagem(backend, temaId, qual, n) {
  return entrada(backend, temaId, qual, n).promessa;
}

/** Adianta frente e depois verso de um cartão ilustrado ({ tema, n }); nunca falha. */
export function preCarregarCartao(backend, cartao) {
  if (!backend || !cartao?.tema) return Promise.resolve();
  return carregarAulaImagem(backend, cartao.tema, "frente", cartao.n)
    .then(() => carregarAulaImagem(backend, cartao.tema, "verso", cartao.n))
    .catch(() => {});
}

/** Imagem protegida pelo servidor: baixa com o login e mostra como blob. { src } | { error } | {}. */
export function useAulaImage(temaId, qual, n, enabled = true) {
  const { backend } = useSession();
  // já guardada e decodificada: aparece no primeiro desenho, sem passar pelo "carregando"
  const [state, setState] = React.useState(() => {
    const e = enabled && backend ? memoriaDo(backend).get(chave(temaId, qual, n)) : null;
    return e?.src ? { src: e.src } : {};
  });
  React.useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const e = entrada(backend, temaId, qual, n);
    e.uso += 1;
    e.promessa.then(
      (src) => alive && setState((s) => (s.src === src ? s : { src })),
      () => alive && setState({ error: true })
    );
    return () => {
      alive = false;
      e.uso -= 1;
    };
  }, [backend, temaId, qual, n, enabled]);
  return state;
}

export function ProtectedImage({ temaId, qual, n = 1, alt, enabled }) {
  const img = useAulaImage(temaId, qual, n, enabled);
  if (img.error) return <div role="status" style={{ padding: 16, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Não foi possível carregar a imagem agora.</div>;
  if (!img.src) return <div aria-busy="true" style={{ width: "100%", height: "100%", minHeight: 120, background: "var(--surface-sunken)" }} />;
  return <img src={img.src} alt={alt} decoding="async" draggable={false} onContextMenu={noMenu} onDragStart={noMenu} />;
}

/** O verso é pedido assim que a frente chega (ou no primeiro clique, o que vier antes): ao virar, a resposta já está pronta. */
export function useVersoPronto(tema, n, seen, ativo = true) {
  const { backend } = useSession();
  const [pronto, setPronto] = React.useState(false);
  React.useEffect(() => {
    if (!ativo) return undefined;
    let alive = true;
    carregarAulaImagem(backend, tema, "frente", n).then(
      () => alive && setPronto(true),
      () => {}
    );
    return () => {
      alive = false;
    };
  }, [backend, tema, n, ativo]);
  return seen || pronto;
}

/** Cartão ilustrado do baralho/revisão: vira por clique, toque, espaço ou Enter; mesmo estado "virado" da tela de revisão. */
export function CartaoIlustrado({ tema, n, front, back, flipped, onFlip }) {
  const [seen, setSeen] = React.useState(false);
  React.useEffect(() => { if (flipped) setSeen(true); }, [flipped]);
  const verso = useVersoPronto(tema, n, seen);
  const flip = () => { setSeen(true); onFlip(!flipped); };
  return (
    <div style={{ width: "100%", maxWidth: 420, margin: "0 auto" }}>
      <button type="button" className={`al-flip${flipped ? " on" : ""}`} onClick={flip} aria-pressed={flipped} aria-label={flipped ? "Mostrar pergunta" : "Mostrar resposta"} onContextMenu={noMenu}>
        <div className="al-flip-in">
          <div className="al-face">
            <ProtectedImage temaId={tema} qual="frente" n={n} alt={`Pergunta: ${front}`} />
          </div>
          <div className="al-face back">
            <ProtectedImage temaId={tema} qual="verso" n={n} alt={`Resposta: ${back}`} enabled={verso} />
          </div>
        </div>
      </button>
    </div>
  );
}
