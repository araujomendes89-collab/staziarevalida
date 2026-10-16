// Fonte de imagens do editor profissional e do leitor do aluno.
// Fornece contexto de substituição (para testes e prévias) e funções de busca e envio.
import React from "react";
import { prepararNoNavegador, enviarImagem, linkEquipe, carregarImagemAluno } from "./api.js";
import { getBackend } from "../../../data";

/**
 * Contexto opcional para injetar provedor customizado de imagens (ex.: testes ou rascunhos).
 * Formato do valor: { carregar(id) => Promise<string>, enviar(file, {alt}) => Promise<{ id, alt_text }> }
 */
export const ContextoFiguras = React.createContext(null);

/**
 * Obtém a instância padrão do backend sem lançar exceção caso não esteja configurado.
 */
export async function backendPadrao() {
  try {
    return await getBackend();
  } catch {
    return null;
  }
}

/**
 * Obtém o link assinado curto ou blob da imagem para visualização pela equipe.
 */
export async function srcParaEquipe(backend, id) {
  if (!id) return null;
  let b = backend;
  if (b && typeof b.then === "function") {
    b = await b;
  }
  if (!b) return null;
  try {
    return await linkEquipe(b, id);
  } catch {
    return null;
  }
}

/**
 * Obtém a imagem para o aluno (bytes protegidos via servidor).
 * Tenta primeiro carregarImagemAluno; se falhar, tenta linkEquipe (ex.: rascunho de equipe);
 * se falhar de novo, lança erro "Imagem indisponível.".
 */
export async function srcParaAluno(backend, id) {
  if (!id) throw new Error("Imagem indisponível.");
  let b = backend;
  if (b && typeof b.then === "function") {
    b = await b;
  }
  if (b) {
    try {
      const src = await carregarImagemAluno(b, id);
      if (src) return src;
    } catch {
      // tenta linkEquipe como alternativa
    }
    try {
      const src = await linkEquipe(b, id);
      if (src) return src;
    } catch {
      // falhou de novo
    }
  }
  throw new Error("Imagem indisponível.");
}

/**
 * Envia uma lista de arquivos de imagem um a um.
 * Ignora arquivos que não são do tipo imagem com erro "«nome» não é imagem.".
 * Devolve { ok: [{id, alt}], erros: [mensagens em português] }.
 */
export async function enviarArquivos(files, { backend, unidade, aula, enviar } = {}) {
  const lista = files ? Array.from(files) : [];
  const ok = [];
  const erros = [];

  let b = backend;
  if (b && typeof b.then === "function") {
    b = await b;
  }
  if (!b && !enviar) {
    b = await backendPadrao();
  }

  for (const file of lista) {
    const nome = file?.name || "arquivo";
    const ehImagem = Boolean(file?.type && file.type.startsWith("image/"));
    if (!ehImagem) {
      erros.push(`«${nome}» não é imagem.`);
      continue;
    }

    try {
      if (enviar) {
        const res = await enviar(file, { alt: "", unidade, aula, nome });
        if (res && res.id) {
          ok.push({ id: res.id, alt: res.alt_text ?? res.alt ?? "" });
        } else {
          erros.push(`Falha ao enviar «${nome}».`);
        }
      } else {
        if (!b) {
          erros.push("Entre na sua conta para enviar imagens.");
          continue;
        }
        const preparado = await prepararNoNavegador(file);
        const res = await enviarImagem(b, preparado, { unidade, aula, nome });
        if (res && res.id) {
          ok.push({ id: res.id, alt: res.alt_text ?? res.alt ?? "" });
        } else {
          erros.push(`Falha ao enviar «${nome}».`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      erros.push(msg || `Erro ao enviar «${nome}».`);
    }
  }

  return { ok, erros };
}
