/**
 * Barra de porcentagem do envio do PDF (Importar PDF e PDF de fonte): aparece enquanto envia, com o número,
 * troca para "Conferindo o arquivo…" sem número e some quando termina.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { UploadProgress } from "../novo/app/admin/content/ui.jsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement | null = null;
const show = (el: React.ReactElement) => {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => createRoot(host!).render(el));
  return host;
};
afterEach(() => host?.remove());

describe("UploadProgress", () => {
  it("enviando: mostra a barra acessível com a porcentagem", () => {
    const h = show(<UploadProgress stage="enviando" pct={45} />);
    const bar = h.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBe("45");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(h.textContent).toContain("Enviando o arquivo… 45%");
  });
  it("conferindo: sem porcentagem", () => {
    const h = show(<UploadProgress stage="conferindo" pct={100} />);
    expect(h.textContent).toContain("Conferindo o arquivo…");
    expect(h.textContent).not.toContain("%");
  });
  it("sem etapa: nada na tela", () => {
    expect(show(<UploadProgress stage={null} pct={0} />).querySelector('[role="progressbar"]')).toBeNull();
  });
});
