// Textos do Termo 1.0 e 2.0 (e da Política que vai junto) guardados no próprio site. Da versão 3.0 em diante (migração …13740) os
// textos vêm do banco (vigente.js e DocumentoLegal.jsx); estes ficam como reserva para banco sem a 013740 e para mostrar o que foi
// aceito antes. O banco é quem liga uma versão nova.
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

/** O site traz o texto desta versão do Termo (1.0 e 2.0)? Da 3.0 em diante, o texto vem do banco. */
export function temNoSite(versao) {
  return Object.prototype.hasOwnProperty.call(DOCUMENTOS, versao ?? "");
}

/** Textos da versão pedida; versão desconhecida (ou nenhuma) cai na de versions.js. */
export function documentosDa(versao = TERMO_VERSAO) {
  return DOCUMENTOS[versao] ?? DOCUMENTOS[TERMO_VERSAO];
}

/** A caixa única do aceite (cadastro, volta do Google e tela de aceite): Termos, Política e a declaração de maioridade juntos. */
export const ACEITE_TEXTO = "Li e aceito os Termos de Uso e a Política de Privacidade e declaro ter 18 anos ou mais.";

/**
 * Contrato 3.0 em diante (textos do banco): a caixa única fala em Termos de Uso e Contrato de Assinatura e diz que a pessoa teve acesso
 * à Política (cláusula 6.1 do Contrato).
 * 18/10/2026 (ordem do dono): saíram da tela o trecho "e declaro ter 18 anos ou mais" da caixa e o aviso que ficava logo abaixo dela
 * ("Ao aceitar, você declara… Guardamos a data, a hora, o IP e o navegador…"). Só a tela mudou: a maioridade continua sendo declarada
 * pelo aceite do Contrato (cláusula 5.1, "Ao aceitar este contrato, você declara…") e segue gravada como antes (declares_adult /
 * declarations.adult, exigida pelo banco em legal_record); data, hora, IP e navegador continuam guardados no aceite. A frase da caixa
 * não é enviada ao servidor nem entra no código de integridade (o SHA-256 é do texto do Contrato), então os aceites antigos não mudam.
 */
export const ACEITE_TEXTO_V3 = "Li e aceito os Termos de Uso e o Contrato de Assinatura, declaro ter acesso à Política de Privacidade.";
/** Mensagem quando a pessoa tenta seguir sem marcar a caixa (textos-da-tela.md, item 1). */
export const ACEITE_ERRO_V3 = "Para continuar, aceite os Termos de Uso e o Contrato de Assinatura.";
export const ACEITE_ERRO_CADASTRO_V3 = "Para criar a conta, aceite os Termos de Uso e o Contrato de Assinatura.";

/** A versão vigente usa os textos novos (3.0 em diante, vindos do banco)? */
export function aceiteNovo(vigentes) {
  return vigentes?.fonte === "banco" && !temNoSite(vigentes.termo_uso?.version);
}
