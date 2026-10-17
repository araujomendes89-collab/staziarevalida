// Textos de cada versão do Termo (e da Política que vai junto). A tela de aceite mostra o texto da versão que o BANCO diz que está
// vigente (boot.legal.termo_uso.current); o cadastro e as páginas públicas, o da versão de versions.js (TERMO_VERSAO).
// Assim o banco é quem liga uma versão nova: o 2.0 só aparece depois de colar supabase/migrations/…11510_termo_v2_ativar.sql.
import termoV1 from "./termo-uso-v1.0.md?raw";
import termoV2 from "./termo-uso-v2.0.md?raw";
import { PRIVACIDADE } from "./privacidade.js";
import { PRIVACIDADE_V2 } from "./privacidade-v2.js";
import { TERMO_VERSAO } from "./versions.js";

/**
 * declaracoes: a versão pede a declaração de maioridade junto do aceite. Desde 17/10/2026 (decisão do dono) ela vem na PRÓPRIA caixa
 * do aceite (ACEITE_TEXTO) e a declaração de formação em Medicina não é mais pedida (migração …13661_aceite_com_maioridade).
 */
const DOCUMENTOS = {
  "1.0": { termo: termoV1, privacidade: PRIVACIDADE, declaracoes: false },
  "2.0": { termo: termoV2, privacidade: PRIVACIDADE_V2, declaracoes: true },
};

/** Textos da versão pedida; versão desconhecida (ou nenhuma) cai na de versions.js. */
export function documentosDa(versao = TERMO_VERSAO) {
  return DOCUMENTOS[versao] ?? DOCUMENTOS[TERMO_VERSAO];
}

/** A caixa única do aceite (cadastro, volta do Google e tela de aceite): Termos, Política e a declaração de maioridade juntos. */
export const ACEITE_TEXTO = "Li e aceito os Termos de Uso e a Política de Privacidade e declaro ter 18 anos ou mais.";
