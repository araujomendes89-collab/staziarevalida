/**
 * Ícones ilustrados dos itens novos do menu (Trilha, Missões, Classificação, Conquistas e Perfil): desenham no mesmo
 * padrão do protótipo (svg 32×32 com as classes de animação), e os do protótipo continuam vindo de lá.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { AppRealIcon } from "../novo/app/AppIcons.jsx";

describe("Ícones ilustrados do menu", () => {
  it("os novos desenham um svg animável; os do protótipo seguem do protótipo; nome desconhecido não desenha nada", () => {
    for (const name of ["route", "target", "trophy", "award", "user"]) {
      const { container, unmount } = render(<>{AppRealIcon({ name, size: 22 })}</>);
      const svg = container.querySelector("svg");
      expect(svg, name).toBeTruthy();
      expect(svg!.getAttribute("viewBox")).toBe("0 0 32 32");
      expect(svg!.getAttribute("class")).toMatch(/^ri ri-(pop|bounce|wiggle)$/);
      expect(container.querySelectorAll("linearGradient").length).toBeGreaterThan(0);
      unmount();
    }
    const { container } = render(<>{AppRealIcon({ name: "house" })}</>);
    expect(container.querySelector("svg")!.getAttribute("class")).toBe("ri ri-bounce");
    expect(AppRealIcon({ name: "nao-existe" })).toBeNull();
  });
});
