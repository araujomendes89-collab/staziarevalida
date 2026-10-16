// "Medalhas e ligas — padrão 3D" (Medalhas.html do pacote): folha com todas as medalhas do banco por categoria e as ligas
// (app_league_current().leagues). É a folha de conferência da arte para o diretor de arte e o dono: NÃO é rota do app
// (só a prévia scripts/previa-novas-telas-onda2 abre, com ?rota=medalhas). Todas aparecem em cor cheia, como no pacote,
// porque a folha mostra o desenho, não o progresso do aluno.
import React from "react";
import { useSession } from "../session.jsx";
import { CATEGORY } from "./format.js";
import { PlayError, Skeleton } from "./components.jsx";
import { usePlayLoad } from "./usePlay.js";
import { ArteLiga, Medalha, Moeda, useArteLigada, useArtesDoPacote } from "./Medalha.jsx";
import { RARITY } from "./format.js";
import "./conquistas.css";

function Cartao({ item, artes }) {
  return (
    <article className="md-card">
      <Medalha item={{ ...item, unlocked_at: item.unlocked_at ?? "folha" }} size={104} artes={artes} lockPin={false} />
      <span className="cq-name">{item.name}</span>
      <span className="cq-req">{item.description}</span>
      <span className="cq-meta">
        <span className="cq-reward">
          <span className="cq-num">+{item.xp} XP</span>
          {item.coins ? (
            <>
              <Moeda artes={artes} />
              <span className="cq-num" aria-label={`${item.coins} moedas`}>{item.coins}</span>
            </>
          ) : null}
        </span>
        <span className={`cq-rar cq-rar--${item.rarity}`}>{RARITY[item.rarity] ?? item.rarity}</span>
      </span>
    </article>
  );
}

export function MedalhasPadrao({ arte } = {}) {
  const { backend } = useSession();
  const artes = useArtesDoPacote(useArteLigada(arte));
  const a = usePlayLoad(() => backend.rpc("app_gamification_achievements"), [backend]);
  const l = usePlayLoad(() => Promise.resolve(backend.rpc("app_league_current")).catch(() => null), [backend]);
  if (a.error) return <PlayError retry={a.reload} />;
  if (!a.data) return <Skeleton height={400} />;
  const items = a.data.items ?? [];
  const ligas = l.data?.leagues ?? [];
  const grupos = [
    ...Object.keys(CATEGORY).map((c) => [CATEGORY[c], items.filter((i) => i.category === c && !i.secret)]),
    ["Secretas", items.filter((i) => i.secret)],
  ].filter(([, lista]) => lista.length);
  return (
    <div className="ev md-page">
      <p className="md-intro">
        {items.length} medalhas{ligas.length ? ` e ${ligas.length} ligas` : ""}. O aro mostra a raridade: prata (comum), azul (rara), roxo com louros (épica), ouro com raios (lendária). A fita mostra a categoria. Bloqueadas aparecem desbotadas no app.
      </p>
      {ligas.length > 0 && (
        <section>
          <h2 className="md-h2">
            Ligas da semana <small>{ligas.length}</small>
          </h2>
          <div className="md-leagues">
            {ligas.map((lg) => (
              <div key={lg.slug} className="md-league">
                <ArteLiga league={lg} size={120} artes={artes} />
                <strong>{lg.name}</strong>
                <span>{lg.position}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {grupos.map(([titulo, lista]) => (
        <section key={titulo}>
          <h2 className="md-h2">
            {titulo} <small>{lista.length}</small>
          </h2>
          <div className="md-grid">
            {lista.map((item) => (
              <Cartao key={item.slug} item={item} artes={artes} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
