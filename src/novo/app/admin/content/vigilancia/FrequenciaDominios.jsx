// Frequência da vigilância por domínio (proposta do dono de 2026-10-12, frequências): de quantos em quantos dias as fontes de cada
// site são verificadas. A equipe muda o intervalo (1 a 90 dias) e confirma antes de gravar.
import React from "react";
import { Button, TextField } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { Section, useAction } from "../ui.jsx";
import { chamar, Confirmacao, legenda, plural, quando, tentar, texto } from "./comum.jsx";

const celula = { padding: "8px 10px", borderBottom: "1px solid var(--border-subtle)", textAlign: "left", verticalAlign: "middle" };
const COLUNAS = ["Domínio", "Fontes", "Frequência", "Última verificação", "Próxima verificação"];

export const frequencia = (dias) => {
  const n = Number(dias);
  if (!Number.isFinite(n) || n <= 0) return "sem frequência";
  return n === 1 ? "todo dia" : `a cada ${n} dias`;
};

function quemPassa(fontes) {
  const n = Number(fontes) || 0;
  if (n === 1) return "A única fonte deste domínio passa a ser verificada";
  if (n === 0) return "As fontes deste domínio passam a ser verificadas";
  return `As ${n} fontes deste domínio passam a ser verificadas`;
}

export function FrequenciaDominios({ dominios, aoSalvar }) {
  const { backend } = useSession();
  const acao = useAction();
  const [editando, setEditando] = React.useState(null);
  const [valor, setValor] = React.useState("");
  const [confirmando, setConfirmando] = React.useState(false);
  const [feito, setFeito] = React.useState(null);
  const lista = Array.isArray(dominios) ? dominios : [];
  const atual = lista.find((d) => d.dominio === editando) ?? null;
  const limpo = valor.trim();
  const dias = /^\d+$/.test(limpo) ? Number(limpo) : NaN;
  const valido = Number.isInteger(dias) && dias >= 1 && dias <= 90;
  const mudou = Boolean(atual) && valido && dias !== Number(atual.intervalo_dias);
  const abrir = (d) => {
    setEditando(d.dominio);
    setValor(String(d.intervalo_dias ?? ""));
    setConfirmando(false);
    setFeito(null);
  };
  const fechar = () => {
    setEditando(null);
    setValor("");
    setConfirmando(false);
  };
  const salvar = async () => {
    const dominio = atual.dominio;
    const r = await tentar(acao, () => chamar(backend, "app_admin_vigilance_set_interval", { p_domain: dominio, p_interval_days: dias }));
    if (!r.ok) return;
    const gravado = r.resultado?.intervalo_dias ?? dias;
    fechar();
    setFeito(`Frequência salva: o domínio ${dominio} passa a ser verificado ${frequencia(gravado)}.`);
    aoSalvar?.();
  };
  return (
    <Section title="Frequência por domínio">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ ...texto, margin: 0 }}>
          Sugestão da proposta do dono: Ministério da Saúde, Conitec e Anvisa todo dia; Inep todo dia em período de prova; PubMed, Crossref (retratações), sociedades médicas, OMS/OPAS e NICE uma vez por semana. Busca aberta na internet só ajuda a descobrir: a fonte é sempre confirmada no órgão que a publicou.
        </p>
        {feito && (
          <p role="status" style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--success-text)" }}>
            {feito}
          </p>
        )}
        {lista.length === 0 ? (
          <span style={legenda}>Nenhum domínio vigiado ainda.</span>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table aria-label="Frequência por domínio" style={{ width: "100%", borderCollapse: "collapse", font: "var(--type-body-sm)" }}>
              <thead>
                <tr style={{ color: "var(--text-tertiary)" }}>
                  {COLUNAS.map((c) => (
                    <th key={c} scope="col" style={celula}>
                      {c}
                    </th>
                  ))}
                  <th scope="col" style={celula}>
                    <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((d) => (
                  <tr key={d.dominio} aria-label={d.dominio}>
                    <td style={{ ...celula, overflowWrap: "anywhere" }}>{d.dominio}</td>
                    <td style={celula}>{d.fontes ?? "—"}</td>
                    <td style={celula}>{frequencia(d.intervalo_dias)}</td>
                    <td style={celula}>{quando(d.ultima_verificacao, "ainda não houve")}</td>
                    <td style={celula}>{quando(d.proxima_verificacao, "não agendada")}</td>
                    <td style={celula}>
                      <Button size="sm" variant="ghost" icon="pencil" aria-label={`Mudar a frequência de ${d.dominio}`} onClick={() => abrir(d)}>
                        Mudar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {atual && (
          <div role="group" aria-label={`Frequência de ${atual.dominio}`} style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 12, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <strong style={{ font: "var(--type-label)", overflowWrap: "anywhere" }}>Mudar a frequência de {atual.dominio}</strong>
            <span style={legenda}>Hoje: {frequencia(atual.intervalo_dias)} · {plural(Number(atual.fontes) || 0, "fonte", "fontes")}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ width: 240 }}>
                <TextField
                  label="A cada quantos dias? (1 a 90)"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="90"
                  value={valor}
                  onChange={(e) => (setValor(e.target.value), setConfirmando(false))}
                  error={limpo !== "" && !valido ? "Use um número inteiro de 1 a 90." : undefined}
                />
              </div>
              <Button size="sm" icon="save" disabled={!mudou} onClick={() => setConfirmando(true)}>
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={fechar}>
                Fechar
              </Button>
            </div>
            {confirmando && mudou && (
              <Confirmacao titulo={`Mudar a frequência de ${atual.dominio}?`} rotulo="Sim, mudar a frequência" icone="calendar-clock" ocupado={acao.busy} aoConfirmar={salvar} aoCancelar={() => setConfirmando(false)}>
                <span style={texto}>{`${quemPassa(atual.fontes)} ${frequencia(dias)} (hoje: ${frequencia(atual.intervalo_dias)}).`}</span>
              </Confirmacao>
            )}
            {acao.feedback}
          </div>
        )}
      </div>
    </Section>
  );
}
