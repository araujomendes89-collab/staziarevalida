import type { WeekDay } from './timeline';

/** DADOS CONTROLADOS de demonstracao. No app real, vem do banco; a animacao so os le. */
export const DEMO_STREAK = { previousStreak: 29, newStreak: 30 } as const;

/** Semana de demonstracao: quinta-feira e "hoje" (30o dia seguido); sexta e sabado ainda por vir. */
export const DEMO_WEEK: readonly WeekDay[] = [
  { label: 'D', name: 'Domingo', done: true },
  { label: 'S', name: 'Segunda-feira', done: true },
  { label: 'T', name: 'Terça-feira', done: true },
  { label: 'Q', name: 'Quarta-feira', done: true },
  { label: 'Q', name: 'Quinta-feira', done: true, isToday: true },
  { label: 'S', name: 'Sexta-feira', done: false },
  { label: 'S', name: 'Sábado', done: false },
];
