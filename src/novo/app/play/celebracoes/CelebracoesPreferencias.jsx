// Conta → Comemorações e sons: as três escolhas do aluno (guardadas neste aparelho) e o histórico das comemorações importantes.
import React from "react";
import { Banner, Icon, SectionHeader, Switch } from "../../../ds";
import { useCelebracoesApp } from "./CelebracoesProvider.jsx";

const QUANDO = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function usePedeMenosMovimento() {
  const ler = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false);
  const [v, setV] = React.useState(ler);
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setV(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return v;
}

function Opcao({ children }) {
  return <div style={{ padding: "12px 14px", borderRadius: 14, border: "1px solid var(--border-subtle)" }}>{children}</div>;
}

export function HistoricoCelebracoes({ itens }) {
  return (
    <section aria-labelledby="cel-historico-titulo" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3 id="cel-historico-titulo" style={{ margin: 0, font: "var(--type-label)", color: "var(--text-primary)" }}>
        Comemorações recentes
      </h3>
      {itens.length === 0 ? (
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Nenhuma comemoração importante ainda neste aparelho.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {itens.map((h, i) => (
            <li key={`${h.chave ?? h.id}-${h.quando}-${i}`} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 12, background: "var(--surface-subtle)" }}>
              <Icon name="party-popper" size={18} style={{ color: "var(--text-brand)", flex: "none" }} />
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ font: "600 14px/1.3 var(--font-sans)", color: "var(--text-primary)" }}>{h.rotulo}</span>
                {h.complemento && h.complemento !== h.rotulo && !h.rotulo.includes(h.complemento) && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{h.complemento}</span>}
              </span>
              <time dateTime={new Date(h.quando).toISOString()} style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", flex: "none" }}>
                {QUANDO.format(new Date(h.quando))}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CelebracoesPreferencias() {
  const { ativo, preferencias, mudarPreferencias, recarregarPreferencias, historico } = useCelebracoesApp();
  const menosMovimento = usePedeMenosMovimento();
  // o botão de som dentro da comemoração muda o mesmo mudo: relê ao abrir esta tela
  React.useEffect(() => recarregarPreferencias(), [recarregarPreferencias]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeader title="Comemorações e sons" subtitle="Como o Stazi comemora seus avanços: sequência, medalhas, nível, missões, simulados e ligas." />
      {!ativo && <Banner tone="info">A Stazia Arena está desligada no momento, então não há comemorações. Suas escolhas ficam guardadas.</Banner>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
        <Opcao>
          <Switch checked={preferencias.sons} onChange={(e) => mudarPreferencias({ sons: e.target.checked })} label="Sons" description="Efeitos curtos, em volume baixo. Só tocam depois que você toca na tela." />
        </Opcao>
        <Opcao>
          <Switch
            checked={preferencias.voz}
            onChange={(e) => mudarPreferencias({ voz: e.target.checked })}
            label="Voz da Durona"
            description={preferencias.sons ? "Falas curtas e firmes, sem ofensa. Desligada, os efeitos continuam." : "Com os sons desligados, a voz também fica em silêncio."}
          />
        </Opcao>
        <Opcao>
          <Switch
            checked={preferencias.reduzidas}
            onChange={(e) => mudarPreferencias({ reduzidas: e.target.checked })}
            label="Animações reduzidas"
            description={menosMovimento ? "Seu aparelho já pede menos movimento: a comemoração aparece parada e sem som." : "Comemorações menores, mais calmas e mais baixas."}
          />
        </Opcao>
      </div>
      <p style={{ margin: 0, font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
        Nenhuma comemoração interrompe uma questão: durante treinos e simulados elas esperam o fim. Para dispensar na hora, use Fechar (ou Esc); as pequenas somem sozinhas ou com um toque. Estas escolhas valem para este aparelho.
      </p>
      <HistoricoCelebracoes itens={historico} />
    </div>
  );
}
