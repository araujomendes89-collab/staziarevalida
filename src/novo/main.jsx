// Entrada do app novo (/novo), construído com o StaziaMed Design System.
// Etapa 1: reproduz o protótipo do design system fielmente; as telas são ligadas
// aos dados reais nas próximas etapas (src/novo/screens).
import React from "react";
import { createRoot } from "react-dom/client";
import "./ds/styles.css";
import { App } from "./prototype/App.jsx";

createRoot(document.getElementById("root")).render(<App />);
