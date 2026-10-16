// Tela de login do app novo. Duas aparências com a MESMA lógica (useLoginForm.js):
//   LoginNovo  = pacote "Novas telas" (LoginWeb, LoginTablet, LoginMobile), padrão neste ramo;
//   LoginAtual = "Acesso seguro REVALIDA" (pacote "Pagina de Login", 2026-10-07), guardada para voltar.
// A escolha fica em loginVisual.js (LOGIN_VISUAL = "novo" | "atual").
import React from "react";
import { LoginAtual } from "./LoginAtual.jsx";
import { LoginNovo } from "./LoginNovo.jsx";
import { loginVisual } from "./loginVisual.js";

export { LOGIN_TEXT } from "./useLoginForm.js";

export function LoginScreen({ go, visual }) {
  const v = visual === "atual" || visual === "novo" ? visual : loginVisual();
  return v === "atual" ? <LoginAtual go={go} /> : <LoginNovo go={go} />;
}
