// Prévia sem login: ?tela=cadastro|login|documentos  &tema=light|dark  (&banco=site: banco sem a 013740, textos antigos do site)
//  documentos -> Minha Conta → Documentos (com um aceite do Contrato 3.0; "Ver" abre o leitor)
//  cadastro -> AuthFlow já em "Criar conta" (a confirmação está "ligada": o cadastro termina em "Confirme seu e-mail")
//  login    -> AuthFlow comum (o botão "Criar conta" leva ao cadastro)
// No e-mail, "existe" simula conta já existente e "lento" deixa o envio parado em "CRIANDO CONTA…".
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/novo/ds/styles.css";
import { SessionProvider, useSession } from "../../src/novo/app/session.jsx";
import { AuthFlow } from "../../src/novo/app/AuthScreens.jsx";
import { DocumentosSection } from "../../src/novo/app/account/DocumentosSection.jsx";
import "../../src/novo/app/account/account.css";

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
  if (tela === "documentos") {
    const Cabecalho = ({ title, subtitle }) => (<header><h1 style={{ margin: 0, font: "var(--type-h2)" }}>{title}</h1><p style={{ margin: 0 }}>{subtitle}</p></header>);
    return <main style={{ padding: 16, background: "var(--bg-app)", color: "var(--text-primary)", minHeight: "100vh" }}><DocumentosSection Cabecalho={Cabecalho} /></main>;
  }
  return <AuthFlow link={{ kind: null }} />;
}

createRoot(document.getElementById("root")).render(<SessionProvider><Cena /></SessionProvider>);
