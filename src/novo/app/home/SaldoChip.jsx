// Início do aluno · chip compacto do SALDO de IA, ao lado da sequência ("0 dias"), no celular e no computador.
// Toque: abre a tela de Planos (detalhe do plano e do saldo). Regras e fonte do número: ./saldo.js.
import React from "react";
import { Icon } from "../../ds";
import { modeloSaldo, useSaldo } from "./saldo.js";

/** A parte visual, sem leitura de dados (testes e prévia usam direto). */
export function SaldoChipView({ modelo, go }) {
  if (!modelo) return null;
  return (
    <button
      type="button"
      className={`smn-saldo${modelo.esgotado ? " is-esgotado" : ""}`}
      data-testid="saldo-chip"
      onClick={() => go && go("planos")}
      aria-label={modelo.aria}
      title={modelo.detalhe}
    >
      {modelo.ilimitado ? (
        <>
          <Icon name="sparkles" size={14} />
          <span>IA ilimitada</span>
        </>
      ) : (
        <>
          <Icon name="sparkles" size={14} />
          <span className="smn-mono" data-testid="saldo-ia">{modelo.ia}</span>
          <span className="smn-saldo-rot">{modelo.iaRotulo}</span>
          {modelo.voz != null && (
            <>
              <span className="smn-saldo-sep" aria-hidden="true" />
              <Icon name="mic" size={14} />
              <span className="smn-mono" data-testid="saldo-voz">{modelo.voz}</span>
              <span>min</span>
            </>
          )}
        </>
      )}
    </button>
  );
}

export function SaldoChip({ go }) {
  const saldo = useSaldo();
  return <SaldoChipView modelo={modeloSaldo(saldo)} go={go} />;
}
