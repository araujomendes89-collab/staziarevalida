// Casca nova das telas de Aprender (onda 4 das Novas telas): pecas compartilhadas por Temas Essenciais, Diretrizes e Atualizacoes
// e Mapas Mentais. So a moldura: filtro de area com bloco de icone, cabecalho de grupo e aviso recolhivel. Nenhum dado e inventado:
// tudo vem de quem usa. Ícones Lucide (o pacote traz arte 3D propria, que fica para a rodada do diretor de arte).
import React from "react";
import { Icon } from "../../ds";
import "./casca.css";

/** Visual de cada area: ícone Lucide e degrade pastel do bloco (tons do pacote de telas). */
export const AREA_VISUAL = {
  todas: { icon: "layout-grid", curto: "Todas", de: "#F2F8FF", ate: "#DCECFF" },
  cm: { icon: "stethoscope", curto: "Clínica", de: "#F4F7FE", ate: "#DFE7FB" },
  cir: { icon: "scissors", curto: "Cirurgia", de: "#FFF8F1", ate: "#FFE6D1" },
  go: { icon: "venus", propio: true, curto: "GO", de: "#FEF4F9", ate: "#F9DBE8" },
  ped: { icon: "baby", curto: "Pediatria", de: "#EFFAF5", ate: "#D3F1E3" },
  mfc: { icon: "house", curto: "MFC", de: "#EFFAF5", ate: "#D3F1E3" },
  sc: { icon: "shield-plus", curto: "Saúde Coletiva", de: "#F7F4FF", ate: "#E6DEFD" },
  sm: { icon: "brain", curto: "Saúde Mental", de: "#F7F4FF", ate: "#E6DEFD" },
};

/** Códigos de área das atualizações (Revalida) para a chave visual. */
export const AREA_CHAVE = {
  CLINICA_MEDICA: "cm",
  CIRURGIA_GERAL: "cir",
  PEDIATRIA: "ped",
  GINECOLOGIA_OBSTETRICIA: "go",
  MEDICINA_FAMILIA_COMUNIDADE: "mfc",
};

/** Símbolo feminino (Ginecologia e Obstetrícia): o Lucide desta versão não tem; traço igual ao dos demais ícones. */
function Venus({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="9" r="5" /><path d="M12 14v8M9 18h6" />
    </svg>
  );
}

export function AreaBloco({ k, tamanho = 32 }) {
  const v = AREA_VISUAL[k] ?? AREA_VISUAL.todas;
  return (
    <span className="ap-bloco" style={{ "--ap-t": `${tamanho}px`, "--ap-de": v.de, "--ap-ate": v.ate }} aria-hidden="true">
      {v.propio ? <Venus size={Math.round(tamanho * 0.58)} /> : <Icon name={v.icon} size={Math.round(tamanho * 0.58)} />}
    </span>
  );
}

/**
 * Filtro de area. Computador e tablet: pilulas com bloco de icone; celular: colunas de bloco com o nome curto embaixo, em fileira
 * que rola para o lado. `itens`: [{ id, label, k, curto?, count? }].
 */
export function AreaFiltro({ itens, valor, onChange, rotulo = "Grande área" }) {
  return (
    <div className="ap-areas" role="group" aria-label={rotulo}>
      {itens.map((a) => {
        const on = valor === a.id;
        const curto = a.curto ?? AREA_VISUAL[a.k]?.curto ?? a.label;
        return (
          <button key={a.id || "todas"} type="button" className="ap-area" aria-pressed={on} onClick={() => onChange(a.id)}>
            <span className="ap-area-ic"><AreaBloco k={a.k} tamanho={32} /></span>
            <span className="ap-area-tx ap-area-tx--cheio">{a.label}</span>
            <span className="ap-area-tx ap-area-tx--curto" aria-hidden="true">{curto}</span>
            {a.count != null && <span className="ap-area-n">{a.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Aviso que abre e fecha ("Como contamos"). O texto fica na pagina (so oculto), para leitor de tela e testes. */
export function Recolhivel({ titulo, children, inicio = false, icone = "info" }) {
  const [aberto, setAberto] = React.useState(inicio);
  const id = React.useId();
  return (
    <section className="ap-rec">
      <button type="button" className="ap-rec-bt" aria-expanded={aberto} aria-controls={id} onClick={() => setAberto(!aberto)}>
        <Icon name={icone} size={18} />
        <span className="ap-rec-tit">{titulo}</span>
        <Icon name="chevron-down" size={18} className="ap-rec-seta" />
      </button>
      <div id={id} className="ap-rec-txt" hidden={!aberto}>{children}</div>
    </section>
  );
}
