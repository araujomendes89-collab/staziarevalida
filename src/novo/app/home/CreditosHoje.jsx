// Início do aluno · bloco discreto "Créditos de hoje": quantos créditos a pessoa ainda tem para usar hoje.
// Não aparece com a cota desligada, para a equipe (não gasta crédito) nem para plano sem número. Mostra só o saldo do próprio aluno.
import React from "react";
import { Button, Card, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { isPhase2Locked } from "../admin/common.jsx";
import { ACABARAM, TITULO, VER_PLANOS, VOLTAM_AMANHA, modeloCreditosHoje, useCreditosHoje } from "./creditosHoje.js";

const mono = { font: "700 15px var(--font-mono)", color: "var(--text-primary)" };
const mudo = { font: "var(--type-body-sm)", color: "var(--text-tertiary)" };

/** A parte visual, sem leitura de dados (a prévia e os testes a usam direto). `modelo` vem de `modeloCreditosHoje`. */
export function CreditosHojeView({ modelo, go }) {
  if (!modelo) return null;
  return (
    <Card>
      <section aria-label={TITULO} data-testid="creditos-hoje" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="ticket" size={16} />
          <h3 style={{ margin: 0, font: "var(--type-label)", color: "var(--text-primary)" }}>{TITULO}</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {modelo.linhas.map((l) => (
            <div key={l.rotulo} style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "4px 12px" }}>
              <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", minWidth: 140 }}>{l.rotulo}</span>
              {l.limite > 0 && (
                <span style={mono} data-testid={`creditos-${l.rotulo}`}>
                  {l.resto} de {l.limite}
                </span>
              )}
              {l.bonus > 0 && <span style={mudo}>{`+ ${l.bonus} de bônus`}</span>}
              {l.comprados > 0 && <span style={mudo}>{`+ ${l.comprados} ${l.comprados === 1 ? "comprado" : "comprados"}`}</span>}
            </div>
          ))}
        </div>
        {modelo.esgotado ? (
          <div role="status" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <span style={{ font: "var(--type-body-sm)", color: "var(--warning-text)" }}>
              {ACABARAM}
              {modelo.voltaAmanha ? ` ${VOLTAM_AMANHA}` : ""}
            </span>
            {go && (
              <Button size="sm" variant="secondary" onClick={() => go("planos")}>
                {VER_PLANOS}
              </Button>
            )}
          </div>
        ) : (
          <p style={{ ...mudo, margin: 0 }}>{modelo.detalhe}</p>
        )}
      </section>
    </Card>
  );
}

// Os créditos são do Treino em Dupla (2ª fase): com a 2ª fase "Em breve" para quem olha, o bloco não aparece e nem lê o saldo.
export function CreditosHoje({ go }) {
  const { boot, dupla } = useSession();
  if (isPhase2Locked(boot?.role, dupla)) return null;
  return <CreditosHojeLido go={go} />;
}

function CreditosHojeLido({ go }) {
  const { backend } = useSession();
  const { estado } = useCreditosHoje(backend);
  const modelo = estado ? modeloCreditosHoje(estado.match, estado.ia) : null;
  return <CreditosHojeView modelo={modelo} go={go} />;
}
