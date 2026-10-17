// Tela de aceite: fica antes de todas as telas do app novo para o aluno (boot.legal.gate_required, calculado pelo servidor) que ainda não
// aceitou a versão vigente do Termo. Desde 17/10/2026 (decisão do dono) não pede mais o WhatsApp: o banco deixou de exigir o telefone
// (migração …13660_cadastro_sem_whatsapp) e o aceite vai sem p_phone (o WhatsApp continua opcional em Minha conta).
// Termo 2.0 em diante (boot.legal.declarations_required): também as declarações de maioridade e de formação em Medicina, gravadas
// junto do aceite (app_accept_terms_declared). O texto mostrado é o da versão que o banco diz que está vigente.
import React from "react";
import "../auth/login.css";
import "./legal.css";
import { useSession } from "../session.jsx";
import { DocumentModal } from "./DocumentModal.jsx";
import { LegalText } from "./LegalText.jsx";
import { takeGoogleAcceptanceFull } from "./googleAcceptance.js";
import { DECLARACAO_ADULTO, DECLARACAO_MEDICO, DECLARACOES_ERRO, documentosDa } from "./documentos.js";

const OUTDATED = "Versão desatualizada do termo.";
const OUTDATED_NOTICE = "O termo foi atualizado. Leia a nova versão e aceite de novo.";
const FAILED_NOTICE = "Não foi possível registrar o aceite agora. Tente de novo.";

/**
 * A tela de aceite vale para esta abertura do app? Quem decide é o servidor (gate_required). Única exceção, de segurança: se o Termo
 * vigente já foi aceito e o único motivo que sobra é o WhatsApp vazio (banco ainda sem a migração …13660_cadastro_sem_whatsapp), a
 * tela não aparece, porque ela não pede mais o WhatsApp e a pessoa ficaria presa. Com a 13660 no banco, isto é igual a gate_required.
 */
export function precisaTelaDeAceite(legal) {
  if (!legal?.gate_required) return false;
  const termoAceito = legal.termo_uso?.current != null && legal.termo_uso?.accepted === legal.termo_uso?.current;
  return !(termoAceito && legal.phone_missing);
}

export function AcceptanceScreen() {
  const session = useSession();
  const legal = session.boot?.legal;
  const current = legal?.termo_uso?.current;
  const needsTerms = legal?.termo_uso?.accepted !== current;
  const needsDecl = needsTerms && Boolean(legal?.declarations_required);
  const termoFonte = documentosDa(current).termo;

  const [checked, setChecked] = React.useState(false);
  const [adult, setAdult] = React.useState(false);
  const [physician, setPhysician] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const [doc, setDoc] = React.useState(null);
  const closeDoc = React.useCallback(() => setDoc(null), []);
  // takeGoogleAcceptance apaga o registro ao ler: lê uma vez só (o StrictMode roda o efeito duas vezes em desenvolvimento)
  const googleTried = React.useRef(false);

  React.useEffect(() => {
    if (googleTried.current || !needsTerms || !current) return;
    googleTried.current = true;
    const google = takeGoogleAcceptanceFull(current);
    if (!google) return;
    // versão com declarações: só aceita sozinho se o cadastro guardou as duas (senão a pessoa marca aqui)
    if (needsDecl && !(google.adult && google.physician)) return;
    setBusy(true);
    session
      .acceptTerms({ document: "termo_uso", version: current, origin: "google", declarations: needsDecl ? { adult: true, physician: true } : undefined })
      .catch(() => setNotice(FAILED_NOTICE))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // o botão vale assim que cada caixa exigida está marcada
  const filled = (!needsTerms || checked) && (!needsDecl || (adult && physician));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!filled) return;
    setBusy(true);
    setNotice(null);
    try {
      await session.acceptTerms({
        document: "termo_uso", version: current, origin: "tela_aceite",
        declarations: needsDecl ? { adult: true, physician: true } : undefined,
      });
    } catch (err) {
      if (err?.message === OUTDATED) {
        setChecked(false);
        setAdult(false);
        setPhysician(false);
        try {
          await session.refresh();
        } catch {
          /* o aviso abaixo vale mesmo sem recarregar */
        }
        setNotice(OUTDATED_NOTICE);
      } else {
        setNotice(FAILED_NOTICE);
      }
    }
    setBusy(false);
  };

  return (
    <div className="lg-root">
      <div className="lg-shell lg-shell--auth">
        <header className="lg-top"><img className="lg-logo" src="/brand/horizontal-escuro-480w.png" alt="StaziaMed Revalida" width="200" height="62" /></header>
        <section className="lg-card lga-card" aria-label="Termo de Aceite e Uso">
          <form onSubmit={submit} className="lg-auth-fields" noValidate>
            <div>
              <h1 className="lg-h2">Termo de Aceite e Uso</h1>
              <p className="lg-sub">Versão {current}</p>
            </div>
            {notice && <div className="lg-msg lg-msg--error" role="alert">{notice}</div>}
            <div className="lga-text lgl-paper" tabIndex={0} role="region" aria-label="Texto do Termo de Aceite e Uso">
              <LegalText source={termoFonte} />
            </div>
            {needsTerms && (
              <div className="lg-field">
                <label className="lg-accept">
                  <input
                    id="aceite-accept"
                    aria-label="Declaro que li e compreendi os Termos de Aceite e Uso e a Política de Privacidade do StaziaMed Revalida e concordo com suas condições."
                    type="checkbox"
                    className="lg-check"
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                    aria-invalid="false"
                  />
                  <span>
                    Declaro que li e compreendi os{" "}
                    <button type="button" className="lg-link-btn" onClick={() => setDoc("termos")}>Termos de Aceite e Uso</button>
                    {" "}e a{" "}
                    <button type="button" className="lg-link-btn" onClick={() => setDoc("privacidade")}>Política de Privacidade</button>
                    {" "}do StaziaMed Revalida e concordo com suas condições.
                  </span>
                </label>
              </div>
            )}
            {needsDecl && (
              <div className="lg-field" role="group" aria-label={DECLARACOES_ERRO}>
                <label className="lg-accept">
                  <input id="aceite-adulto" aria-label={DECLARACAO_ADULTO} type="checkbox" className="lg-check" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
                  <span>{DECLARACAO_ADULTO}</span>
                </label>
                <label className="lg-accept">
                  <input id="aceite-medico" aria-label={DECLARACAO_MEDICO} type="checkbox" className="lg-check" checked={physician} onChange={(e) => setPhysician(e.target.checked)} />
                  <span>{DECLARACAO_MEDICO}</span>
                </label>
              </div>
            )}
            <button type="submit" className="lg-btn lg-btn-primary" disabled={busy || !filled}>{busy ? <><span className="lg-spin" />SALVANDO…</> : "Aceitar e continuar"}</button>
            <button type="button" className="lg-btn lg-btn-ghost" onClick={() => session.signOut()}>Sair</button>
          </form>
        </section>
      </div>
      {doc && <DocumentModal doc={doc} onClose={closeDoc} versao={current} />}
    </div>
  );
}
