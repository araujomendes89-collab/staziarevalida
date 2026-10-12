// "Relatar um problema": o aluno escolhe a tela, escreve o que aconteceu e a mensagem chega à Administração
// (Configurações > Relatos dos alunos). O banco confere o tamanho (10 a 1000 letras) e o limite de 5 por 24 horas.
import React from "react";
import { Banner, Button, SelectField } from "../../ds";
import { useSession } from "../session.jsx";
import { TextArea } from "../admin/common.jsx";
import { OTHER_SCREEN, SCREEN_NAMES, screenBeforeAccount } from "./lastScreen.js";
import { SupportMail } from "./supportContact.jsx";

export const REPORT_MAX = 1000;
export const REPORT_MIN = 10;
const SCREEN_OPTIONS = [...new Set([...Object.values(SCREEN_NAMES).filter((n) => n !== "Conta"), "Conta", OTHER_SCREEN])];

// O que o banco diz em português simples vale; qualquer outro erro vira texto geral.
const KNOWN = /pelo menos 10 letras|no máximo 1000|5 relatos nas últimas 24 horas|Entre na sua conta/;
function failText(error, email) {
  const message = String(error?.message ?? "");
  if (KNOWN.test(message)) return { text: message };
  if (/Could not find the function|PGRST202|does not exist|app_report_problem/i.test(message))
    return { text: "O envio de relatos ainda não está disponível. Escreva para o suporte:", mail: email };
  if (error?.code === "network" || /fetch|network/i.test(message)) return { text: "Falha de conexão. Verifique sua internet e tente de novo." };
  return { text: "Não foi possível enviar agora. Tente de novo ou escreva para o suporte:", mail: email };
}

export function ReportProblem({ email }) {
  const { backend } = useSession();
  const [screen, setScreen] = React.useState(() => screenBeforeAccount() ?? OTHER_SCREEN);
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [failure, setFailure] = React.useState(null);
  const [tooShort, setTooShort] = React.useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setDone(false);
    setFailure(null);
    if (message.trim().length < REPORT_MIN) {
      setTooShort(true);
      return;
    }
    setTooShort(false);
    setSending(true);
    try {
      await backend.rpc("app_report_problem", { p_screen: screen, p_message: message.trim() });
      setMessage("");
      setDone(true);
    } catch (error) {
      setFailure(failText(error, email));
    }
    setSending(false);
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate aria-label="Relatar um problema">
      {done && <Banner tone="success">Relato enviado. Obrigado! A equipe vai ler e, se precisar, fala com você pelo e-mail da sua conta.</Banner>}
      {failure && (
        <Banner tone="danger">
          {failure.text}
          {failure.mail && (
            <>
              {" "}
              <SupportMail email={failure.mail} />.
            </>
          )}
        </Banner>
      )}
      <SelectField label="Em qual tela aconteceu?" value={screen} onChange={(e) => setScreen(e.target.value)} options={SCREEN_OPTIONS.map((name) => ({ value: name, label: name }))} />
      <TextArea
        label="O que aconteceu?"
        rows={5}
        maxLength={REPORT_MAX}
        value={message}
        onChange={(text) => (setMessage(text), setTooShort(false), setDone(false))}
        placeholder="Conte o que você tentou fazer e o que apareceu na tela."
        hint={tooShort ? `Conte com um pouco mais de detalhe (pelo menos ${REPORT_MIN} letras).` : `${message.length} de ${REPORT_MAX} letras. Não escreva senhas nem dados de pacientes.`}
      />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button type="submit" loading={sending}>
          Enviar relato
        </Button>
      </div>
    </form>
  );
}
