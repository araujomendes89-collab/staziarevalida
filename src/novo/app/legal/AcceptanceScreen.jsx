// Tela de aceite: fica antes de todas as telas do app novo para o aluno (boot.legal.gate_required, calculado pelo servidor) que ainda não
// aceitou a versão vigente do Termo ou não informou o WhatsApp. O WhatsApp sozinho também é gravado por app_accept_terms (p_phone),
// repetindo o aceite da versão vigente (o servidor não duplica), como diz o spec seção 9.
import React from "react";
import "../auth/login.css";
import "./legal.css";
import { useSession } from "../session.jsx";
import { PhoneField } from "./PhoneField.jsx";
import { DocumentModal } from "./DocumentModal.jsx";
import { LegalText } from "./LegalText.jsx";
import { COUNTRIES, normalizePhone, phoneError } from "./phone.js";
import { takeGoogleAcceptance } from "./googleAcceptance.js";
import termoFonte from "./termo-uso-v1.0.md?raw";

const COUNTRY_CODES = new Set(COUNTRIES.filter((c) => c.code !== "outro").map((c) => c.code));
const OUTDATED = "Versão desatualizada do termo.";
const OUTDATED_NOTICE = "O termo foi atualizado. Leia a nova versão e aceite de novo.";
const FAILED_NOTICE = "Não foi possível registrar o aceite agora. Tente de novo.";
const ACCEPT_ERROR = "Para continuar, é preciso aceitar o Termo de Aceite e Uso e a Política de Privacidade.";

export function AcceptanceScreen() {
  const session = useSession();
  const legal = session.boot?.legal;
  const current = legal?.termo_uso?.current;
  const needsTerms = legal?.termo_uso?.accepted !== current;
  const needsPhone = Boolean(legal?.phone_missing);

  const [phone, setPhone] = React.useState({ code: "+55", number: "" });
  const [checked, setChecked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const [showErrors, setShowErrors] = React.useState(false);
  const [doc, setDoc] = React.useState(null);
  const closeDoc = React.useCallback(() => setDoc(null), []);
  // takeGoogleAcceptance apaga o registro ao ler: lê uma vez só (o StrictMode roda o efeito duas vezes em desenvolvimento)
  const googleTried = React.useRef(false);

  React.useEffect(() => {
    if (googleTried.current || !needsTerms || !current) return;
    googleTried.current = true;
    if (!takeGoogleAcceptance(current)) return;
    setBusy(true);
    session
      .acceptTerms({ document: "termo_uso", version: current, origin: "google" })
      .catch(() => setNotice(FAILED_NOTICE))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalized = needsPhone ? normalizePhone(phone.code, phone.number) : null;
  const msg = needsPhone ? phoneError(phone.code, phone.number) : null;
  const codeBad = msg && phone.number.trim() && !/^\+?[1-9][0-9]{0,2}$/.test(phone.code.trim()) && !COUNTRY_CODES.has(phone.code);
  const ready = (!needsTerms || checked) && (!needsPhone || Boolean(normalized));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!ready) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await session.acceptTerms({ document: "termo_uso", version: current, origin: "tela_aceite", phone: normalized || undefined });
    } catch (err) {
      if (err?.message === OUTDATED) {
        setChecked(false);
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
        <header className="lg-top"><img className="lg-logo" src="/novo-assets/logo-staziamed-revalida-v2-escuro.png" alt="StaziaMed Revalida" width="200" height="61" /></header>
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
            {needsPhone && (
              <PhoneField
                code={phone.code}
                number={phone.number}
                onChange={setPhone}
                error={showErrors && msg && !codeBad ? msg : undefined}
                codeError={showErrors && codeBad ? msg : undefined}
                id="aceite-phone"
              />
            )}
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
                    aria-invalid={showErrors && !checked ? "true" : "false"}
                    aria-describedby={showErrors && !checked ? "aceite-accept-error" : undefined}
                  />
                  <span>
                    Declaro que li e compreendi os{" "}
                    <button type="button" className="lg-link-btn" onClick={() => setDoc("termos")}>Termos de Aceite e Uso</button>
                    {" "}e a{" "}
                    <button type="button" className="lg-link-btn" onClick={() => setDoc("privacidade")}>Política de Privacidade</button>
                    {" "}do StaziaMed Revalida e concordo com suas condições.
                  </span>
                </label>
                {showErrors && !checked ? <span id="aceite-accept-error" className="lg-field-error">{ACCEPT_ERROR}</span> : null}
              </div>
            )}
            <button type="submit" className="lg-btn lg-btn-primary" disabled={busy || !ready}>{busy ? <><span className="lg-spin" />SALVANDO…</> : "Aceitar e continuar"}</button>
            <button type="button" className="lg-btn lg-btn-ghost" onClick={() => session.signOut()}>Sair</button>
          </form>
        </section>
      </div>
      {doc && <DocumentModal doc={doc} onClose={closeDoc} />}
    </div>
  );
}
