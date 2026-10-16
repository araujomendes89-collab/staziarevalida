import { BRAND } from '../../timeline';
import type { CenarioId } from '../tipos';

/** Identidade de cada cenario: tinta do texto, paleta de particulas e gradiente de apoio (cartoes e fallback). Tudo sobrio, escuro e cinematografico. */
export interface InfoCenario {
  nome: string;
  descricao: string;
  /** Todos os cenarios atuais sao escuros: texto claro. Mantido para temas futuros. */
  tinta: 'clara' | 'escura';
  paleta: readonly string[];
  fundo: string;
  /** Cor do brilho atras da lontra (rgba). */
  brilho: string;
}

const OURO = ['#FFFFFF', '#F5D98A', BRAND.gold, BRAND.orange, '#FFE9B8'];
const AZUL = ['#FFFFFF', BRAND.blue300, '#BFE0FF', BRAND.blue, '#F5D98A'];

export const CENARIO_INFO: Record<CenarioId, InfoCenario> = {
  madrugada: { nome: 'Madrugada urbana', descricao: 'Cidade antes do amanhecer, faixa quente no horizonte: primeiros dias.', tinta: 'escura', paleta: OURO, fundo: 'linear-gradient(180deg,#030B1F 0%,#0B2A5C 60%,#6B4A3E 100%)', brilho: 'rgba(255,190,120,.35)' },
  'estudio-escuro': { nome: 'Estúdio escuro', descricao: 'Luz volumétrica de cima, estante em silhueta: marcos de estudo.', tinta: 'escura', paleta: OURO, fundo: 'linear-gradient(180deg,#040E26 0%,#0A2250 100%)', brilho: 'rgba(255,214,150,.3)' },
  'noite-urbana': { nome: 'Noite urbana', descricao: 'Skyline com neon controlado: sequências longas.', tinta: 'escura', paleta: AZUL, fundo: 'linear-gradient(180deg,#020817 0%,#0A2250 100%)', brilho: 'rgba(0,143,254,.35)' },
  skyline: { nome: 'Skyline e holofotes', descricao: 'Holofotes cruzando a cidade e flares dourados: marcos épicos.', tinta: 'escura', paleta: OURO, fundo: 'linear-gradient(180deg,#02060F 0%,#0A1E4A 100%)', brilho: 'rgba(255,200,120,.35)' },
  palco: { nome: 'Palco de premiação', descricao: 'Holofotes volumétricos e pódio escuro com bordas douradas.', tinta: 'escura', paleta: OURO, fundo: 'linear-gradient(180deg,#02060F 0%,#0A2250 100%)', brilho: 'rgba(255,230,170,.3)' },
  'hospital-noite': { nome: 'Hospital ao anoitecer', descricao: 'Corredor moderno, janela com a cidade e ECG discreto.', tinta: 'escura', paleta: AZUL, fundo: 'linear-gradient(180deg,#06182E 0%,#0B2F52 100%)', brilho: 'rgba(120,220,255,.28)' },
  'arena-esports': { nome: 'Arena de e-sports', descricao: 'Piso em grade neon, treliças de luz e névoa.', tinta: 'escura', paleta: AZUL, fundo: 'linear-gradient(180deg,#030A1E 0%,#0A2A6A 100%)', brilho: 'rgba(0,143,254,.4)' },
  aurora: { nome: 'Aurora', descricao: 'Faixas de luz sobre montanhas escuras: novo recorde.', tinta: 'escura', paleta: AZUL, fundo: 'linear-gradient(180deg,#020B24 0%,#08275A 100%)', brilho: 'rgba(80,230,230,.3)' },
  nevoa: { nome: 'Névoa azul', descricao: 'Camadas de névoa e luz baixa: erro encorajador, sem festa.', tinta: 'escura', paleta: [BRAND.blue300], fundo: 'linear-gradient(180deg,#0B1B38 0%,#16325C 100%)', brilho: 'rgba(160,200,255,.25)' },
  'mesa-prova': { nome: 'Mesa de prova', descricao: 'Mesa escura, folha de gabarito e anel de resultado.', tinta: 'escura', paleta: AZUL, fundo: 'linear-gradient(180deg,#071429 0%,#0E2A52 100%)', brilho: 'rgba(0,143,254,.22)' },
  ambar: { nome: 'Luz âmbar', descricao: 'Janela com luz quente e bokeh discreto: volta depois de pausa.', tinta: 'escura', paleta: ['#FFE9B8', '#FFD28A', '#FFFFFF', BRAND.orange], fundo: 'linear-gradient(180deg,#0B1530 0%,#2B2338 60%,#7A4A2E 100%)', brilho: 'rgba(255,190,120,.35)' },
  ideia: { nome: 'Ideia', descricao: 'Lâmpada acendendo no escuro: dica do Stazi.', tinta: 'escura', paleta: ['#FFE9B8', '#FFFFFF', BRAND.blue300], fundo: 'linear-gradient(180deg,#050F26 0%,#0B2A5C 100%)', brilho: 'rgba(255,224,138,.35)' },
  horizonte: { nome: 'Horizonte', descricao: 'Trilha de luz subindo ao horizonte: nível e XP.', tinta: 'escura', paleta: OURO, fundo: 'linear-gradient(180deg,#040E26 0%,#0B3F8F 80%,#1B6FB8 100%)', brilho: 'rgba(120,200,255,.3)' },
  liga: { nome: 'Arena das ligas', descricao: 'Raios de luz e o emblema da nova liga subindo: promoção de liga.', tinta: 'escura', paleta: OURO, fundo: 'linear-gradient(180deg,#030A1E 0%,#0B3F8F 100%)', brilho: 'rgba(255,220,140,.4)' },
};
