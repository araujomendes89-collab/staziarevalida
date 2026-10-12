/**
 * Treinamento em Dupla · etapa 1 · tarefa 2: componentes base do design system (Dialog, Toast/useToast, Accordion, Textarea).
 * Comportamento copiado do pacote de design (components/feedback, layout/Accordion, forms/Textarea) com os tokens do app.
 * O CSS é lido do arquivo real: sem cor hexadecimal nos componentes e regra de painel de baixo no celular.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Accordion, Dialog, Textarea, Toast, useToast } from "../novo/ds/index.js";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const FILES = [
  "src/novo/ds/components/feedback/Dialog.jsx",
  "src/novo/ds/components/feedback/Toast.jsx",
  "src/novo/ds/components/surfaces/Accordion.jsx",
  "src/novo/ds/components/forms/Textarea.jsx",
];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function DialogHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Dialog
        open={open}
        title="Finalizar avaliação?"
        description="3 critérios ainda estão pendentes."
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        actions={
          <>
            <button>Voltar</button>
            <button>Finalizar</button>
          </>
        }
      >
        <input aria-label="Observação" />
      </Dialog>
    </div>
  );
}

describe("Dialog", () => {
  it("fechado não desenha nada", () => {
    render(<Dialog open={false} title="x" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("foco entra, Tab não sai, Esc e fundo chamam onClose e o foco volta ao botão que abriu", () => {
    const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    const opener = screen.getByText("Abrir");
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.parentElement?.parentElement).toBe(document.body); // portal em document.body (overlay > caixa)
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId!)?.textContent).toBe("Finalizar avaliação?");
    expect(screen.getByText("3 critérios ainda estão pendentes.")).toBeTruthy();

    // foco no primeiro elemento focável
    const input = screen.getByLabelText("Observação");
    const voltar = screen.getByText("Voltar");
    const finalizar = screen.getByText("Finalizar");
    expect(document.activeElement).toBe(input);

    // Tab no último volta ao primeiro; Shift+Tab no primeiro vai ao último
    finalizar.focus();
    fireEvent.keyDown(finalizar, { key: "Tab" });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(finalizar);
    // Tab com o foco fora da caixa traz o foco de volta
    opener.focus();
    fireEvent.keyDown(opener, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    voltar.focus();

    // Esc fecha e devolve o foco
    fireEvent.keyDown(voltar, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);

    // clique no fundo fecha; clique dentro da caixa não
    fireEvent.click(opener);
    const box = screen.getByRole("dialog");
    fireEvent.click(box);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(box.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("sem elemento focável, o foco vai para a própria caixa", () => {
    render(<Dialog title="Aviso" description="Só texto." />);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("no celular: regra de painel de baixo em components.css", () => {
    const css = read("src/novo/ds/components/components.css");
    const media = css.match(/@media\s*\(max-width:\s*900px\)\s*\{([\s\S]*?)\n\}/);
    expect(media).toBeTruthy();
    const body = media![1];
    expect(body).toMatch(/\.sm-dialog-overlay\s*\{[^}]*align-items:\s*flex-end/);
    expect(body).toMatch(/\.sm-dialog\s*\{[^}]*border-radius:\s*22px 22px 0 0/);
    expect(body).toMatch(/\.sm-dialog-overlay\s*\{[^}]*padding:\s*12px/);
  });
});

function ToastHarness() {
  const [node, show] = useToast();
  return (
    <div>
      <button onClick={() => show("Link copiado")}>Copiar</button>
      <button onClick={() => show("Não deu", "danger")}>Falhar</button>
      {node}
    </div>
  );
}

describe("Toast", () => {
  it("Toast avulso: role=status, título, mensagem e fechar", () => {
    const onClose = vi.fn();
    render(<Toast tone="warning" title="Atenção" message="Faltam critérios." onClose={onClose} />);
    const t = screen.getByRole("status");
    expect(t.textContent).toContain("Atenção");
    expect(t.textContent).toContain("Faltam critérios.");
    fireEvent.click(screen.getByLabelText("Fechar"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("useToast: aviso role=status que some em 2600 ms", () => {
    vi.useFakeTimers();
    render(<ToastHarness />);
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByText("Copiar"));
    expect(screen.getByRole("status").textContent).toContain("Link copiado");
    act(() => {
      vi.advanceTimersByTime(2599);
    });
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("useToast: um por vez; o novo troca o antigo e reinicia os 2600 ms; tom padrão = sucesso", () => {
    vi.useFakeTimers();
    render(<ToastHarness />);
    fireEvent.click(screen.getByText("Copiar"));
    expect(screen.getByRole("status").getAttribute("data-tone")).toBe("success");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.click(screen.getByText("Falhar"));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("Não deu");
    expect(screen.getByRole("status").getAttribute("data-tone")).toBe("danger");
    act(() => {
      vi.advanceTimersByTime(2000); // o primeiro prazo já teria vencido
    });
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("useToast: desmontar não deixa timer solto", () => {
    vi.useFakeTimers();
    const { unmount } = render(<ToastHarness />);
    fireEvent.click(screen.getByText("Copiar"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("posição no CSS: direita 24 px, 96 px do rodapé; até 900 px: 12 px dos lados, 84 px do rodapé", () => {
    const css = read("src/novo/ds/components/components.css");
    expect(css).toMatch(/\.sm-toast-host\s*\{[^}]*right:\s*24px[^}]*bottom:\s*96px/);
    const media = css.match(/@media\s*\(max-width:\s*900px\)\s*\{([\s\S]*?)\n\}/)![1];
    expect(media).toMatch(/\.sm-toast-host\s*\{[^}]*left:\s*12px[^}]*right:\s*12px[^}]*bottom:\s*84px/);
  });
});

describe("Accordion", () => {
  it("alterna aria-expanded e mostra o corpo", () => {
    render(
      <Accordion title="Cenário" icon="file-text" meta={<span>2/6</span>}>
        <p>Conteúdo do cenário</p>
      </Accordion>,
    );
    const head = screen.getByRole("button", { name: /Cenário/ });
    expect(head.getAttribute("aria-expanded")).toBe("false");
    const bodyId = head.getAttribute("aria-controls");
    expect(bodyId).toBeTruthy();
    expect(screen.getByText("Conteúdo do cenário")).not.toBeVisible();
    expect(screen.getByText("2/6")).toBeTruthy();

    fireEvent.click(head);
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Conteúdo do cenário")).toBeVisible();
    expect(document.getElementById(bodyId!)?.contains(screen.getByText("Conteúdo do cenário"))).toBe(true);

    fireEvent.click(head);
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Conteúdo do cenário")).not.toBeVisible();
  });

  it("é um botão de verdade (teclado nativo) e defaultOpen abre de início", () => {
    render(
      <Accordion title="Roteiro" defaultOpen>
        <p>Texto</p>
      </Accordion>,
    );
    const head = screen.getByRole("button", { name: /Roteiro/ });
    expect(head.tagName).toBe("BUTTON");
    expect(head.getAttribute("type")).toBe("button");
    expect(head.getAttribute("aria-expanded")).toBe("true");
  });

  it("controlado: open manda e onToggle recebe o novo valor", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <Accordion title="Controlado" open={false} onToggle={onToggle}>
        <p>Corpo</p>
      </Accordion>,
    );
    const head = screen.getByRole("button", { name: /Controlado/ });
    fireEvent.click(head);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(head.getAttribute("aria-expanded")).toBe("false"); // quem manda é o pai
    rerender(
      <Accordion title="Controlado" open onToggle={onToggle}>
        <p>Corpo</p>
      </Accordion>,
    );
    expect(head.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(head);
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });
});

describe("Textarea", () => {
  it("mostra 12/160 e respeita maxLength", () => {
    render(<Textarea label="Feedback" hint="Escreva com calma." showCount maxLength={160} defaultValue="Bom trabalho" />);
    const ta = screen.getByLabelText("Feedback") as HTMLTextAreaElement;
    expect(ta.tagName).toBe("TEXTAREA");
    expect(ta.maxLength).toBe(160);
    expect(screen.getByText("12/160")).toBeTruthy();
    expect(screen.getByText("Escreva com calma.")).toBeTruthy();
    fireEvent.change(ta, { target: { value: "Bom trabalho!!" } });
    expect(screen.getByText("14/160")).toBeTruthy();
    // a dica e o contador ficam ligados ao campo
    const described = ta.getAttribute("aria-describedby")!.split(" ");
    expect(described.length).toBe(2);
    expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual(["Escreva com calma.", "14/160"]);
  });

  it("controlado: o contador segue o value e onChange continua chegando", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Textarea label="Nota" showCount maxLength={50} value="abc" onChange={onChange} />);
    expect(screen.getByText("3/50")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Nota"), { target: { value: "abcd" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    rerender(<Textarea label="Nota" showCount maxLength={50} value="abcd" onChange={onChange} />);
    expect(screen.getByText("4/50")).toBeTruthy();
  });

  it("sem showCount não há contador; sem maxLength o contador mostra só o total", () => {
    const { rerender } = render(<Textarea label="A" defaultValue="oi" maxLength={10} />);
    expect(screen.queryByText("2/10")).toBeNull();
    rerender(<Textarea label="A" defaultValue="oi" showCount />);
    expect(screen.getByText("2")).toBeTruthy();
  });
});

describe("arquivos", () => {
  it("componentes e CSS novos sem cor hexadecimal, e cada um com o seu .d.ts", () => {
    for (const f of FILES) {
      expect(read(f), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(fs.existsSync(path.join(ROOT, f.replace(/\.jsx$/, ".d.ts"))), f).toBe(true);
    }
    const css = read("src/novo/ds/components/components.css");
    const mine = css
      .split("\n")
      .filter((l) => /^\.sm-(dialog|toast|acc|textarea)/.test(l) || /^\s+\.sm-(dialog|toast|acc|textarea)/.test(l))
      .join("\n");
    expect(mine.length).toBeGreaterThan(200);
    expect(mine).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(mine).not.toMatch(/rgba?\(/);
  });

  it("ds/index.js exporta os cinco novos", () => {
    const idx = read("src/novo/ds/index.js");
    for (const n of ["Dialog", "Toast", "useToast", "Accordion", "Textarea"]) expect(idx).toMatch(new RegExp(`\\b${n}\\b`));
  });
});
