// Cartão do aceite do Tutor (§34 do Termo): aparece no lugar do Tutor até o aluno aceitar a versão vigente.
// A versão vem do servidor (status.consent_version); o aceite vai por session.acceptTerms e só depois o Tutor abre.
import React from "react";
import { Banner, Button, Card, Checkbox } from "../../ds";
import { useSession } from "../session.jsx";

export const TUTOR_CONSENT_TEXT =
  "Estou ciente de que os Tutores do StaziaMed Revalida utilizam Inteligência Artificial e podem cometer erros. Entendo que alguns perfis possuem linguagem informal, humor, ironia, cobrança e, quando selecionados por mim, podem utilizar expressões mais intensas ou palavrões dentro do contexto educacional.";

/** onAccepted: chamado depois do aceite gravado. onOutdated: o servidor recusou por versão antiga (a tela relê o status). */
export function TutorConsentCard({ version, onAccepted, onOutdated }) {
  const session = useSession();
  const [checked, setChecked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!checked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await session.acceptTerms({ document: "tutor_ia", version, origin: "tutor" });
      // busy segue ligado: o cartão sai quando o status volta, e um segundo clique não pode aceitar de novo
      onAccepted?.();
    } catch (err) {
      setError(err?.message || "Não foi possível registrar o aceite agora. Tente de novo.");
      setChecked(false);
      setBusy(false);
      try {
        await onOutdated?.();
      } catch {
        /* o erro acima já está na tela */
      }
    }
  };

  return (
    <Card padding={20} style={{ borderRadius: 24 }}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, font: "var(--type-body)", color: "var(--text-primary)" }}>{TUTOR_CONSENT_TEXT}</p>
        {error && <Banner tone="danger">{error}</Banner>}
        <Checkbox label="Li e concordo" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <div>
          <Button type="submit" disabled={!checked || busy}>Continuar</Button>
        </div>
      </form>
    </Card>
  );
}
