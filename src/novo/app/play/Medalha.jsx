// Desenho de uma medalha ou liga. Com a arte do pacote ligada (VITE_MEDALHAS_ARTE_PACOTE=1, hoje só na prévia) usa o SVG 3D
// do pacote; desligada (padrão do app) mostra o ícone Lucide que o banco manda (achievements.icon) num selo com o aro da raridade.
// Bloqueada: desbotada (como no pacote) com um cadeado no canto. Secreta bloqueada: nunca mostra a arte nem o ícone real.
import React from "react";
import { Icon } from "../../ds";
import { arteDaLiga, arteDaMedalha, carregarArtesDoPacote } from "../../ds/medalhas-pacote/index.js";
import { medalhasArtePacote } from "../features.js";

let cache = null;
let promessa = null;

/** Mapa nome -> URL das artes do pacote, ou null quando a arte está desligada (ou ainda carregando). */
export function useArtesDoPacote(ligada) {
  const [artes, setArtes] = React.useState(cache);
  React.useEffect(() => {
    if (!ligada || cache) return undefined;
    let vivo = true;
    promessa ??= carregarArtesDoPacote().then((m) => (cache = m));
    promessa.then((m) => vivo && setArtes(m)).catch(() => {});
    return () => {
      vivo = false;
    };
  }, [ligada]);
  return ligada ? artes : null;
}

/** A arte do pacote vale nesta tela? `arte` (true/false) força; sem ele, segue a flag do build. */
export function useArteLigada(arte) {
  return arte ?? medalhasArtePacote();
}

/**
 * Selo da medalha. size = largura em px (altura proporcional à arte, 120x140).
 * item: { slug, icon, rarity, secret, unlocked_at }.
 */
export function Medalha({ item, size = 54, artes, lockPin = true }) {
  const unlocked = Boolean(item?.unlocked_at);
  const nome = artes ? arteDaMedalha(item) : null;
  const url = nome ? artes[nome] : null;
  const pin = lockPin && !unlocked;
  const h = Math.round(size * (140 / 120));
  return (
    <span className={`cq-medal${unlocked ? "" : " cq-medal--locked"}`} style={{ width: size, height: h }} aria-hidden="true">
      {url ? (
        <img src={url} alt="" width={size} height={h} className="cq-medal__art" draggable="false" loading="lazy" decoding="async" />
      ) : (
        <span className={`cq-seal cq-seal--${item?.rarity ?? "comum"}`} style={{ width: size * 0.84, height: size * 0.84 }}>
          <Icon name={!unlocked && item?.secret ? "lock" : item?.icon || "award"} size={Math.round(size * 0.4)} />
        </span>
      )}
      {pin && (
        <span className="cq-medal__pin" style={{ width: size >= 50 ? 20 : 18, height: size >= 50 ? 20 : 18 }}>
          <Icon name="lock" size={11} />
        </span>
      )}
    </span>
  );
}

/** Escudo da liga (só com a arte do pacote); sem arte, o ícone Lucide da liga na cor do token do banco. */
export function ArteLiga({ league, size = 120, artes }) {
  const nome = artes ? arteDaLiga(league?.slug) : null;
  const url = nome ? artes[nome] : null;
  const h = Math.round(size * (130 / 120));
  if (url) return <img src={url} alt="" width={size} height={h} className="cq-league__art" draggable="false" loading="lazy" decoding="async" />;
  return (
    <span className="cq-league__seal" style={{ width: size * 0.7, height: size * 0.7, color: league?.color_token ? `var(${league.color_token})` : "var(--league)" }} aria-hidden="true">
      <Icon name={league?.icon || "medal"} size={Math.round(size * 0.36)} />
    </span>
  );
}

/** Moeda da recompensa: a moeda 3D do pacote com a arte ligada; senão o ícone Lucide "coins". */
export function Moeda({ artes, size = 14 }) {
  const url = artes?.moeda;
  if (url) return <img src={url} alt="" width={size} height={size} draggable="false" style={{ display: "block" }} />;
  return <Icon name="coins" size={size} />;
}
