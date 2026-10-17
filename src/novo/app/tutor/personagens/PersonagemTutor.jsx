// O personagem do Tutor no lugar da esfera: mesmas props da StaziaVoiceOrb (conversationState, emotion, emotionIntensity,
// inputStream, outputStream, personality, onFrame) + `personagem` ("stazi" | "stazia") e `motor` ("2d" | "3d").
// O 2D (sprites) é o padrão. O 3D (Three.js 2.5D) só baixa quando pedido e, se o aparelho não tiver WebGL, o 2D assume.
import React from "react";
import { PersonagemTutor2D } from "./PersonagemTutor2D.jsx";

const PersonagemTutor3D = React.lazy(() => import("./PersonagemTutor3D.jsx").then((m) => ({ default: m.PersonagemTutor3D })));

function temWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function PersonagemTutor({ motor = "2d", ...props }) {
  const usar3d = motor === "3d" && typeof document !== "undefined" && temWebGL();
  if (!usar3d) return <PersonagemTutor2D {...props} />;
  return (
    <React.Suspense fallback={<PersonagemTutor2D {...props} />}>
      <PersonagemTutor3D {...props} />
    </React.Suspense>
  );
}
