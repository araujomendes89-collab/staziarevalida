// Textos de cada versão do Termo (e da Política que vai junto). A tela de aceite mostra o texto da versão que o BANCO diz que está
// vigente (boot.legal.termo_uso.current); o cadastro e as páginas públicas, o da versão de versions.js (TERMO_VERSAO).
// Assim o banco é quem liga uma versão nova: o 2.0 só aparece depois de colar supabase/ativar/…11500_termo_v2.ativar.sql.
import termoV1 from "./termo-uso-v1.0.md?raw";
import termoV2 from "./termo-uso-v2.0.md?raw";
import { PRIVACIDADE } from "./privacidade.js";
import { PRIVACIDADE_V2 } from "./privacidade-v2.js";
import { TERMO_VERSAO } from "./versions.js";

/** declaracoes: a versão pede as declarações de maioridade e de formação em Medicina junto do aceite. */
const DOCUMENTOS = {
  "1.0": { termo: termoV1, privacidade: PRIVACIDADE, declaracoes: false },
  "2.0": { termo: termoV2, privacidade: PRIVACIDADE_V2, declaracoes: true },
};

/** Textos da versão pedida; versão desconhecida (ou nenhuma) cai na de versions.js. */
export function documentosDa(versao = TERMO_VERSAO) {
  return DOCUMENTOS[versao] ?? DOCUMENTOS[TERMO_VERSAO];
}

export const DECLARACAO_ADULTO = "Declaro que tenho 18 anos ou mais.";
export const DECLARACAO_MEDICO = "Declaro que sou médico(a), com a graduação em Medicina concluída.";
export const DECLARACOES_ERRO = "Para continuar, confirme que você tem 18 anos ou mais e que é médico(a).";
