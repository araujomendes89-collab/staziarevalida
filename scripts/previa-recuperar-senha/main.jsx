// Prévia sem login: ?tela=login|forgot|nova|vencido  &tema=light|dark
//  login   -> AuthFlow comum (clique em "Esqueci minha senha" para chegar em Recuperar senha)
//  forgot  -> abre direto em Recuperar senha
//  nova    -> tela "Criar nova senha" (sessão de recuperação simulada)
//  vencido -> link do e-mail vencido (AuthFlow com link expirado)
// Senha com a palavra "vencido" simula o link vencendo na hora de salvar; e-mail com "falha" simula erro de envio.
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/novo/ds/styles.css";
import { SessionProvider, useSession } from "../../src/novo/app/session.jsx";
import { AuthFlow, NewPasswordScreen } from "../../src/novo/app/AuthScreens.jsx";

const q = new URLSearchParams(location.search);
document.documentElement.dataset.theme = q.get("tema") === "dark" ? "dark" : "light";
const tela = q.get("tela") || "forgot";

function Cena() {
  const s = useSession();
  const [recovery, setRecovery] = React.useState(true);
  React.useEffect(() => {
    if (tela === "forgot") {
      // abre direto em Recuperar senha: clica no link do login assim que ele aparece
      const t = setInterval(() => {
        const b = [...document.querySelectorAll("button")].find((x) => /esqueci minha senha/i.test(x.textContent));
        if (b) { b.click(); clearInterval(t); }
      }, 50);
      return () => clearInterval(t);
    }
  }, []);
  if (s.status === "loading") return null;
  if (tela === "nova") return recovery ? <NewPasswordScreen /> : <p style={{ padding: 24 }}>Entrou no app (prévia).</p>;
  if (tela === "vencido") return <AuthFlow link={{ kind: "expired" }} />;
  return <AuthFlow link={{ kind: null }} />;
}

createRoot(document.getElementById("root")).render(<SessionProvider><Cena /></SessionProvider>);
