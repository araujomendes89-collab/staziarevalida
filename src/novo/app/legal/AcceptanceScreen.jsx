// Tela de aceite: fica antes de todas as telas do app novo para o ALUNO (boot.legal.gate_required, calculado pelo servidor) que ainda não
// aceitou a versão vigente do Contrato/Termo (ou outra do mesmo grupo de aceite: termo_uso.valid, migração …13740). Equipe e revisores
// médicos não passam por aqui (regra do servidor, legal_is_student).
//
// Desde a versão 3.0 (17/10/2026), no mesmo padrão das telas de acesso (RecoveryLayout: claro/escuro, celular e computador):
//   * quem já tinha aceitado uma versão anterior vê "Atualizamos nosso Contrato" e o resumo do que mudou (legal_texts.changes, tirado
//     dos próprios textos); quem nunca aceitou vê "Antes de começar";
//   * os textos completos abrem por cima (Contrato, Política e Regulamento), sempre a versão que o banco diz que está vigente;
//   * uma caixa só (ACEITE_TEXTO_V3); desde 18/10/2026 sem "e declaro ter 18 anos ou mais" e sem o aviso de baixo (a maioridade vem
//     da cláusula 5.1 e continua gravada; data, hora, IP e navegador continuam guardados);
//   * sem aceitar, a pessoa não entra no app, mas pode baixar os próprios dados, pedir o cancelamento ao suporte ou sair da conta
//     (Contrato 3.0, cláusula 6.5-A).
// Com o Termo 1.0/2.0 vigente (banco sem a 013740), a mesma tela vale com a caixa e os textos de antes.
import React from "react";
import "../auth/criar-conta.css";
import "./legal.css";
import { useSession } from "../session.jsx";
import { DocumentModal } from "./DocumentModal.jsx";
import { takeGoogleAcceptanceFull } from "./googleAcceptance.js";
import { ACEITE_ERRO_V3, ACEITE_TEXTO, ACEITE_TEXTO_V3, temNoSite } from "./documentos.js";
import { AceiteFrase } from "./AceiteFrase.jsx";
import { useVigentes } from "./vigente.js";
import { FieldError, RecoveryButton, RecoveryLayout, RecoveryLink, RecoveryMessage } from "../auth/RecoveryLayout.jsx";
import { useSupportEmail } from "../support/supportContact.jsx";

const OUTDATED = "Versão desatualizada do termo.";
const OUTDATED_NOTICE = "O contrato foi atualizado agora há pouco. Leia a nova versão e aceite de novo.";
const FAILED_NOTICE = "Não foi possível registrar o aceite agora. Tente de novo.";
const ERRO_ANTIGO = "Para continuar, aceite os Termos de Uso e a Política de Privacidade e declare ter 18 anos ou mais.";

/** O Contrato/Termo vigente já está aceito (a mesma versão ou outra do mesmo grupo de aceite)? */
export function termoAceito(legal) {
  const t = legal?.termo_uso;
  if (!t?.current) return false;
  if (typeof t.valid === "boolean") return t.valid;
  return t.accepted === t.current;
}

/**
 * A tela de aceite vale para esta abertura do app? Quem decide é o servidor (gate_required). Única exceção, de segurança: se o Termo
 * vigente já foi aceito e o único motivo que sobra é o WhatsApp vazio (banco ainda sem a migração …13660_cadastro_sem_whatsapp), a
 * tela não aparece, porque ela não pede mais o WhatsApp e a pessoa ficaria presa. Com a 13660 no banco, isto é igual a gate_required.
 */
/**
 * Contrato 3.0, cláusula 6.5-A: o aluno com plano pago ativo que ainda não aceitou a versão nova continua usando o app até o fim do
 * período pago (o servidor manda grace_until e gate_required falso). Nesse prazo o app mostra um aviso com "Ler e aceitar".
 */
export function emPrazoDeAceite(legal) {
  return Boolean(legal?.grace_until) && !legal?.gate_required && !termoAceito(legal);
}

/** Data (dia/mês/ano) no fuso de Brasília. */
export function dataBR(iso) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

export function precisaTelaDeAceite(legal) {
  if (!legal?.gate_required) return false;
  return !(termoAceito(legal) && legal.phone_missing);
}

/** @param {{ onAgoraNao?: () => void }} props onAgoraNao: aberta pelo aviso do prazo (cláusula 6.5-A); mostra "Agora não". */
export function AcceptanceScreen({ onAgoraNao } = {}) {
  const session = useSession();
  const supportEmail = useSupportEmail();
  const legal = session.boot?.legal;
  const current = legal?.termo_uso?.current;
  const needsTerms = !termoAceito(legal);
  const needsDecl = needsTerms && Boolean(legal?.declarations_required);
  const novo = Boolean(current) && !temNoSite(current); // 3.0 em diante: textos do banco
  const atualizacao = Boolean(legal?.termo_uso?.accepted); // já tinha aceitado uma versão anterior
  const vig = useVigentes();
  const mudancas = atualizacao && vig.vigentes?.termo_uso?.version === current ? (vig.vigentes.termo_uso.changes ?? []) : [];

  const [checked, setChecked] = React.useState(false);
  const [erroCaixa, setErroCaixa] = React.useState(null);
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
    // versão com a declaração: só aceita sozinho se o cadastro guardou a maioridade (senão a pessoa marca aqui)
    if (needsDecl && !google.adult) return;
    setBusy(true);
    session
      .acceptTerms({ document: "termo_uso", version: current, origin: "google", declarations: needsDecl ? { adult: true } : undefined })
      .catch(() => setNotice(FAILED_NOTICE))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (needsTerms && !checked) {
      setErroCaixa(novo ? ACEITE_ERRO_V3 : ERRO_ANTIGO);
      document.getElementById("aceite-accept")?.focus();
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await session.acceptTerms({
        document: "termo_uso", version: current, origin: "tela_aceite",
        declarations: needsDecl ? { adult: true } : undefined,
      });
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

  const cancelamento = `mailto:${supportEmail}?subject=${encodeURIComponent("Pedido de cancelamento da assinatura")}&body=${encodeURIComponent(
    `Olá. Não aceitei a versão ${current ?? ""} do Contrato e quero pedir o cancelamento da minha assinatura.\nE-mail da conta: ${session.user?.email ?? ""}\n`,
  )}`;

  const titulo = atualizacao ? "Atualizamos nosso Contrato" : "Antes de começar";
  const prazo = onAgoraNao && legal?.grace_until ? dataBR(legal.grace_until) : null;
  const sub = prazo
    ? `Versão ${current}. Você pode usar o seu plano até ${prazo}; para renovar depois disso, aceite a nova versão.`
    : atualizacao
    ? `Versão ${current}. Veja o que mudou, leia os textos completos e aceite para continuar.`
    : "Leia e aceite os Termos de Uso e o Contrato de Assinatura para usar o StaziaMed.";

  return (
    <RecoveryLayout
      label="Aceite do contrato"
      title={titulo}
      sub={sub}
      aside={{
        title: "Por que estou vendo isto?",
        copy: atualizacao
          ? "As regras do serviço mudaram. Sem o novo aceite, não dá para usar o app. Se não quiser aceitar, você pode baixar seus dados, pedir o cancelamento ou sair da conta."
          : "Precisamos do seu aceite antes do primeiro uso. Se não quiser aceitar, você pode sair da conta.",
      }}
    >
      <form onSubmit={submit} className="rc-fields cc-fields ac3-form" noValidate>
        {notice && <RecoveryMessage tone="danger">{notice}</RecoveryMessage>}

        {mudancas.length > 0 && (
          <section className="ac3-mudou" aria-labelledby="ac3-mudou-t">
            <h2 id="ac3-mudou-t" className="ac3-h2">O que mudou</h2>
            <ul className="ac3-lista">
              {mudancas.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="ac3-docs">
          <span className="ac3-docs-t">Leia os textos completos:</span>
          <button type="button" className="cc-inline-link" onClick={() => setDoc("termos")}>
            {novo ? "Termos de Uso e Contrato" : "Termo de Aceite e Uso"}
          </button>
          <button type="button" className="cc-inline-link" onClick={() => setDoc("privacidade")}>Política de Privacidade</button>
          {novo && (
            <button type="button" className="cc-inline-link" onClick={() => setDoc("regulamento")}>Regulamento de Coins e Ligas</button>
          )}
        </div>

        {needsTerms && (
          <div className={`cc-consent${erroCaixa ? " is-error" : ""}`}>
            <div className="cc-item">
              <label className="cc-check">
                <input
                  id="aceite-accept"
                  aria-label={novo ? ACEITE_TEXTO_V3 : ACEITE_TEXTO}
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setChecked(e.target.checked);
                    if (e.target.checked) setErroCaixa(null);
                  }}
                  aria-invalid={erroCaixa ? "true" : "false"}
                  aria-describedby={erroCaixa ? "aceite-accept-error" : undefined}
                />
                <AceiteFrase onDoc={setDoc} linkClassName="cc-inline-link" novo={novo} />
              </label>
              {erroCaixa ? <FieldError id="aceite-accept-error">{erroCaixa}</FieldError> : null}
            </div>
          </div>
        )}

        <RecoveryButton type="submit" loading={busy} loadingText="SALVANDO…">ACEITAR E CONTINUAR</RecoveryButton>

        <div className="rc-actions ac3-acoes">
          {onAgoraNao && <RecoveryLink onClick={onAgoraNao}>Agora não</RecoveryLink>}
          {atualizacao && !onAgoraNao && (
            <>
              <a className="ln-link rc-back ac3-link" href={cancelamento}>
                <span>Não aceito: pedir o cancelamento</span>
              </a>
            </>
          )}
          <RecoveryLink onClick={() => session.signOut()}>Sair da conta</RecoveryLink>
        </div>
      </form>
      {doc && <DocumentModal doc={doc} onClose={closeDoc} versao={current} />}
    </RecoveryLayout>
  );
}
