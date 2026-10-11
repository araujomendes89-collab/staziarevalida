/** Adaptadores do assistente por aba. A Tarefa 10 acrescenta uma linha (Planos). */
import type { AssistTab } from "../../../src/shared/adminAssistant/types";
import type { TabAdapter } from "../types";
import { atualizacoesAdapter } from "./atualizacoes";
import { questoesAdapter } from "./questoes";

export const ADAPTERS: Partial<Record<AssistTab, TabAdapter>> = { questoes: questoesAdapter, atualizacoes: atualizacoesAdapter };
