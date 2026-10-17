// Prévia sem login: ?tela=cadastro|login|vencido  &tema=light|dark
//  cadastro -> AuthFlow já em "Criar conta" (a confirmação está "ligada": o cadastro termina em "Confirme seu e-mail")
//  login    -> AuthFlow comum (e-mail com "pendente" simula conta ainda não confirmada)
//  vencido  -> link de confirmação vencido (AuthFlow com link { kind: "expired", signup: true })
// No reenvio, e-mail com "espera" simula o Supabase pedindo para aguardar 42 segundos.
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/novo/ds/styles.css";
import { SessionProvider, useSession } from "../../src/novo/app/session.jsx";
import { AuthFlow } from "../../src/novo/app/AuthScreens.jsx";

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
  if (tela === "vencido") return <AuthFlow link={{ kind: "expired", signup: true }} />;
  return <AuthFlow link={{ kind: null }} />;
}

createRoot(document.getElementById("root")).render(<SessionProvider><Cena /></SessionProvider>);
