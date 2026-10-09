/** Adaptadores do assistente por aba. As Tarefas 8 e 10 acrescentam uma linha cada (Atualizações e Planos). */
import type { AssistTab } from "../../../src/shared/adminAssistant/types";
import type { TabAdapter } from "../types";
import { questoesAdapter } from "./questoes";

export const ADAPTERS: Partial<Record<AssistTab, TabAdapter>> = { questoes: questoesAdapter };
