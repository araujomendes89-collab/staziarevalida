// Ponto de integração com Temas Essenciais: componentes próprios, sem tocar no cartão do tema.
// - <BotaoMapaMental codigo go/>  : botão "Mapa mental" (some se o tema não tem mapa)
// - <MapaDoTema codigo/>          : o mapa do tema, ou "Mapa em preparação" (nunca conteúdo inventado)
import React from "react";
import { EmptyState } from "../../ds";
import { MapaMental } from "./MapaMental.jsx";
import { mapaPorCodigo, mapaPorSlug } from "./mapas.js";
import "./mapas.css";

export const temMapa = (codigo) => !!mapaPorCodigo(codigo);

export function MapaEmPreparacao() {
  return (
    <EmptyState icon="network" title="Mapa em preparação" description="O mapa mental deste tema ainda está sendo preparado e revisado. Assim que estiver pronto, aparece aqui." />
  );
}

/** Mostra o mapa do tema (por código interno vindo do cartão do tema, ou por slug do endereço). */
export function MapaDoTema({ codigo, slug, modoInicial }) {
  const mapa = slug ? mapaPorSlug(slug) : mapaPorCodigo(codigo);
  if (!mapa) return <MapaEmPreparacao />;
  return <MapaMental mapa={mapa} modoInicial={modoInicial} />;
}

/** Botão para o cartão do tema: abre a tela Mapas Mentais já no mapa deste tema. Sem mapa, não aparece. */
export function BotaoMapaMental({ codigo, go, className = "", compacto = false }) {
  const mapa = mapaPorCodigo(codigo);
  if (!mapa) return null;
  return (
    <button type="button" className={"mm-botao " + className} data-compacto={compacto || undefined} onClick={(e) => { e.stopPropagation(); go("mapas", { tema: mapa.slug }); }} aria-label={`Mapa mental: ${mapa.titulo}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><circle cx="4.5" cy="5" r="1.8" /><circle cx="19.5" cy="5" r="1.8" /><circle cx="4.5" cy="19" r="1.8" /><circle cx="19.5" cy="19" r="1.8" /><path d="M10 10 6 6.200M14 10l4-3.800M10 14l-4 3.800M14 14l4 3.800" /></svg>
      {!compacto && <span>Mapa mental</span>}
    </button>
  );
}

/** Miniatura do pôster para o cartão do tema (Temas Essenciais): imagem pequena que abre o mapa. Sem mapa ou sem imagem, não aparece. */
export function MiniaturaMapa({ codigo, go, className = "" }) {
  const mapa = mapaPorCodigo(codigo);
  if (!mapa?.poster?.webp) return null;
  return (
    <button type="button" className={"mm-mini " + className} onClick={(e) => { e.stopPropagation(); go("mapas", { tema: mapa.slug }); }} aria-label={`Mapa mental: ${mapa.titulo}`}>
      <img src={mapa.poster.webp} alt="" loading="lazy" onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }} />
    </button>
  );
}
