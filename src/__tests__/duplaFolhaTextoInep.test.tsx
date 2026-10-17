/**
 * Folha do candidato em TEXTO (estação sem imagem): mesmos títulos da imagem (folha-1.2, opção B "Igual ao INEP", 17/10):
 * INSTRUÇÕES AO PARTICIPANTE, CENÁRIO DE ATENDIMENTO, DESCRIÇÃO DO CASO com as tarefas dentro e ATENÇÃO em destaque,
 * sem o prefixo "Observação:". O texto da estação é o mesmo.
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CandidateSheet } from "../novo/app/dupla/room/CandidateSheet.jsx";

const actions = { printUrl: async () => null };
const station = (o: Record<string, unknown> = {}) => ({
  duration_ms: 600000,
  candidate_sheet: { has_image: false },
  doctor_scene: "Nível de atenção: primária.\n\nDESCRIÇÃO DO CASO\nVocê atende um paciente de 36 anos.",
  doctor_tasks: "1. realizar anamnese;\n2. solicitar exame físico;\nObservação: ATENÇÃO! CASO JULGUE NECESSÁRIO, VERBALIZE! O PACIENTE NÃO DEVERÁ SER TOCADO.",
  ...o,
});

afterEach(() => cleanup());

describe("folha do candidato em texto, com os títulos do INEP", () => {
  it("títulos, blocos, tarefas dentro da descrição e ATENÇÃO sem 'Observação:'", async () => {
    render(<CandidateSheet station={station()} content={{ pressings: [] }} actions={actions} />);
    await screen.findByText("INSTRUÇÕES AO PARTICIPANTE");
    expect(screen.getByText("CENÁRIO DE ATENDIMENTO")).toBeTruthy();
    expect(screen.getByText("DESCRIÇÃO DO CASO")).toBeTruthy();
    expect(screen.getByText("Nos 10 minutos de duração da estação, você deverá executar as seguintes tarefas:")).toBeTruthy();
    expect(screen.getByText("Nível de atenção: primária.")).toBeTruthy();
    expect(screen.getByText("Você atende um paciente de 36 anos.")).toBeTruthy();
    expect(screen.getByText("realizar anamnese;")).toBeTruthy();
    expect(screen.getByText("01")).toBeTruthy();
    expect(screen.getByText("02")).toBeTruthy();
    const corpo = document.body.textContent ?? "";
    expect(corpo).toContain("ATENÇÃO! CASO JULGUE NECESSÁRIO, VERBALIZE!");
    expect(corpo).toContain("O PACIENTE NÃO DEVERÁ SER TOCADO.");
    expect(corpo).not.toMatch(/Observação:|Enunciado|CENÁRIO DE ATUAÇÃO|PARA O\(A\)|execute:/);
    // ordem: cenário, descrição, tarefas, aviso
    expect(corpo.indexOf("CENÁRIO DE ATENDIMENTO")).toBeLessThan(corpo.indexOf("DESCRIÇÃO DO CASO"));
    expect(corpo.indexOf("DESCRIÇÃO DO CASO")).toBeLessThan(corpo.indexOf("realizar anamnese"));
    expect(corpo.indexOf("realizar anamnese")).toBeLessThan(corpo.indexOf("ATENÇÃO!"));
  });

  it("sem 'DESCRIÇÃO DO CASO' no cenário: tudo no cenário de atendimento e as tarefas num bloco sem título", async () => {
    render(<CandidateSheet station={station({ doctor_scene: "Cenário simples.", doctor_tasks: "1. fazer algo;" })} content={{ pressings: [] }} actions={actions} />);
    await screen.findByText("INSTRUÇÕES AO PARTICIPANTE");
    expect(screen.getByText("CENÁRIO DE ATENDIMENTO")).toBeTruthy();
    expect(screen.queryByText("DESCRIÇÃO DO CASO")).toBeNull();
    expect(screen.getByText("fazer algo;")).toBeTruthy();
  });

  it("bloco OBSERVAÇÃO do fim do cenário sai depois das tarefas, com marcadores", async () => {
    render(
      <CandidateSheet
        station={station({ doctor_scene: "Você atende.\n\nOBSERVAÇÃO\nO hospital possui:\n• radiologia;\n• laboratório.", doctor_tasks: "1. atender;" })}
        content={{ pressings: [] }}
        actions={actions}
      />
    );
    await screen.findByText("INSTRUÇÕES AO PARTICIPANTE");
    expect(screen.getByText("OBSERVAÇÃO")).toBeTruthy();
    expect(screen.getByText("radiologia;")).toBeTruthy();
    const corpo = document.body.textContent ?? "";
    expect(corpo.indexOf("atender;")).toBeLessThan(corpo.indexOf("OBSERVAÇÃO"));
    expect(corpo.indexOf("Você atende.")).toBeLessThan(corpo.indexOf("atender;"));
  });
});
