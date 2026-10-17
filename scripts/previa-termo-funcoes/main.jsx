// Prévia: ?tela=cadastro (Criar conta) | conta (Minha Conta; &secao=priv|ajuda|docs) e &tema=light|dark
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/novo/ds/styles.css";
import { SessionProvider, useSession } from "../../src/novo/app/session.jsx";
import { AuthFlow } from "../../src/novo/app/AuthScreens.jsx";
import { AccountScreen } from "../../src/novo/app/account/AccountScreen.jsx";

const q = new URLSearchParams(location.search);
document.documentElement.dataset.theme = q.get("tema") === "dark" ? "dark" : "light";
const tela = q.get("tela") || "cadastro";

function Cena() {
  const s = useSession();
  React.useEffect(() => {
    if (tela !== "cadastro") return undefined;
    const t = setInterval(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /^criar conta$/i.test(x.textContent.trim()));
      if (b) { b.click(); clearInterval(t); }
    }, 50);
    return () => clearInterval(t);
  }, []);
  if (s.status === "loading") return null;
  if (tela === "conta") {
    if (s.status !== "ready") return <p>Carregando…</p>;
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-app)", padding: "24px 16px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <AccountScreen go={() => {}} />
        </div>
      </div>
    );
  }
  return <AuthFlow link={{ kind: null }} />;
}

createRoot(document.getElementById("root")).render(<SessionProvider><Cena /></SessionProvider>);
