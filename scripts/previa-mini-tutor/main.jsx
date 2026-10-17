// PRÉVIA do Mini Tutor: as 3 telas com a janelinha (dados simulados, respostas de exemplo, sem IA).
//   /?tela=questao&modo=treino|simulado&estado=respondendo|errado · /?tela=resultado · /?tela=aula · &saldo=pouco|acabou · &abrir=1
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../../src/novo/ds/styles.css";
import { PracticeSession } from "../../src/novo/app/practice/PracticeSession.jsx";
import { TemaAula } from "../../src/novo/app/study/TemaAula.jsx";
import { TutorDockProvider } from "../../src/novo/app/tutor/TutorDrawer.jsx";
import { saldo } from "./sessaoMini.jsx";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("tema") === "escuro" ? "dark" : "light";
const RESPOSTAS = {
  hint: "[Exemplo da prévia] Olhe a idade e o tempo de evolução: o que isso muda no raciocínio? Pense em qual dado do caso separa as alternativas.",
  message: "[Exemplo da prévia] Boa pergunta. Comece pelo dado que mais pesa no enunciado e veja qual alternativa conversa com ele. Quer uma pista?",
};
const realFetch = window.fetch.bind(window);
window.fetch = (url, init) => {
  const u = String(url);
  if (u.endsWith("/api/tutor/status")) return Promise.resolve(new Response(JSON.stringify({ ready: true, question_hint: false, live_voice: false, voice_hint: "gemini" }), { status: 200 }));
  if (u.endsWith("/api/tutor/turn")) {
    const body = JSON.parse(init.body);
    return new Promise((r) =>
      setTimeout(() => {
        saldo.usadas += 1;
        if (saldo.usadas > 40) return r(new Response(JSON.stringify({ error: "Você chegou ao limite de 40 interações de hoje. Amanhã tem mais." }), { status: 429 }));
        r(new Response(JSON.stringify({ message: { id: saldo.usadas, content: RESPOSTAS[body.action] ?? RESPOSTAS.message, hint_level: body.action === "hint" ? 1 : null, avatar: { emotion: "pleased", intensity: 0.5 } }, used_today: saldo.usadas, daily_limit: 40 }), { status: 200 }));
      }, 900)
    );
  }
  return realFetch(url, init);
};
const go = (route) => console.info("[prévia] navegação:", route);
const tela = params.get("tela") ?? "questao";
const TEMA = { id: "GR-069", title: "Bronquiolite viral aguda", area: "ped", area_name: "Pediatria", subarea: "Pneumologia", total: 5 };

createRoot(document.getElementById("root")).render(
  <MemoryRouter initialEntries={["/sessao?s=s-previa"]}>
    <TutorDockProvider go={go}>
      {tela === "aula" ? (
        <TemaAula tema={TEMA} mobile={window.innerWidth < 720} onBack={() => go("temas")} go={{ train: () => go("treino"), flash: () => go("flash") }} />
      ) : (
        <PracticeSession go={go} />
      )}
    </TutorDockProvider>
  </MemoryRouter>
);
