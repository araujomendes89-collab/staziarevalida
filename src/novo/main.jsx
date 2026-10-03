// Entrada do app novo (/novo), construído com o StaziaMed Design System.
// A estrutura (login, menu, rotas, perfil) usa dados reais; as telas internas são ligadas
// aos dados etapa por etapa (ver CONNECTED em ./app/App.jsx).
import React from "react";
import { createRoot } from "react-dom/client";
import "./ds/styles.css";
import { App } from "./app/App.jsx";

createRoot(document.getElementById("root")).render(<App />);
