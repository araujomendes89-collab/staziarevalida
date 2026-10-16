// Chamadas às rotas de imagens do Editor Profissional (/api/content-hub/doc-imagens)
// Utilizado tanto pelo painel de administração quanto pelo leitor do aluno.

import { BASE_DOC_IMAGENS, MAX_ENVIO_BYTES } from "../../../../shared/docImagens";

async function headers(backend, extra = {}) {
  const token = backend.accessToken ? await backend.accessToken() : null;
  if (!token) {
    throw new Error("Entre na sua conta para acessar as imagens.");
  }
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function parse(res) {
  if (res.ok) {
    return res.headers.get("content-type")?.includes("json") ? res.json() : res;
  }
  let message = `Erro ${res.status}.`;
  try {
    const j = await res.json();
    message = j.error || message;
  } catch {
    // resposta sem corpo json
  }
  throw new Error(message);
}

function carregarElementoImagem(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao abrir a imagem."));
    img.src = src;
  });
}

function canvasParaBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Falha ao converter imagem para arquivo."));
      },
      type,
      quality
    );
  });
}

/**
 * Prepara a imagem no navegador antes de enviar ao servidor:
 * - SVG vira PNG desenhado em canvas;
 * - PNG/JPEG/WebP grandes ou pesados são redimensionados proporcionalmente;
 * - GIF passa direto (se menor ou igual ao limite de bytes).
 */
export async function prepararNoNavegador(
  file,
  { ladoMaximo = 2400, maxBytes = MAX_ENVIO_BYTES } = {}
) {
  // 1. GIF passa direto (se > maxBytes, recusa)
  if (file.type === "image/gif" || file.name?.toLowerCase().endsWith(".gif")) {
    if (file.size > maxBytes) {
      throw new Error("GIF acima de 4 MB.");
    }
    return file;
  }

  // 2. SVG: converte sempre para PNG
  const isSvg = file.type === "image/svg+xml" || file.name?.toLowerCase().endsWith(".svg");
  if (isSvg) {
    const url = URL.createObjectURL(file);
    try {
      const img = await carregarElementoImagem(url);
      const w = img.naturalWidth || img.width || 1024;
      const h = img.naturalHeight || img.height || 1024;
      const escala = Math.max(w, h) > ladoMaximo ? ladoMaximo / Math.max(w, h) : 1;
      const finalW = Math.max(1, Math.round(w * escala));
      const finalH = Math.max(1, Math.round(h * escala));

      const canvas = document.createElement("canvas");
      canvas.width = finalW;
      canvas.height = finalH;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, finalW, finalH);

      const blob = await canvasParaBlob(canvas, "image/png");
      const novoNome = (file.name || "imagem.svg").replace(/\.svg$/i, ".png");
      return typeof File !== "undefined"
        ? new File([blob], novoNome, { type: "image/png" })
        : blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // 3. PNG, JPEG ou WebP
  let w = 0;
  let h = 0;
  let source = null;
  let url = null;

  if (typeof createImageBitmap !== "undefined") {
    try {
      source = await createImageBitmap(file);
      w = source.width;
      h = source.height;
    } catch {
      source = null;
    }
  }

  if (!source) {
    url = URL.createObjectURL(file);
    const img = await carregarElementoImagem(url);
    source = img;
    w = img.naturalWidth || img.width;
    h = img.naturalHeight || img.height;
  }

  try {
    const precisaReduzir = Math.max(w, h) > ladoMaximo || file.size > maxBytes;
    if (!precisaReduzir) {
      if (source && typeof source.close === "function") source.close();
      return file;
    }

    const escala = Math.max(w, h) > ladoMaximo ? ladoMaximo / Math.max(w, h) : 1;
    const finalW = Math.max(1, Math.round(w * escala));
    const finalH = Math.max(1, Math.round(h * escala));

    const canvas = document.createElement("canvas");
    canvas.width = finalW;
    canvas.height = finalH;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(source, 0, 0, finalW, finalH);
    if (source && typeof source.close === "function") source.close();

    const isJpeg = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name || "");
    let blob;

    if (isJpeg) {
      blob = await canvasParaBlob(canvas, "image/jpeg", 0.85);
    } else {
      blob = await canvasParaBlob(canvas, "image/png");
      if (blob.size > maxBytes) {
        try {
          const webpBlob = await canvasParaBlob(canvas, "image/webp", 0.9);
          if (webpBlob && webpBlob.type === "image/webp" && webpBlob.size <= maxBytes) {
            blob = webpBlob;
          } else {
            blob = await canvasParaBlob(canvas, "image/jpeg", 0.85);
          }
        } catch {
          blob = await canvasParaBlob(canvas, "image/jpeg", 0.85);
        }
      }
    }

    const extFinal =
      blob.type === "image/jpeg" ? ".jpg" : blob.type === "image/webp" ? ".webp" : ".png";
    const novoNome = (file.name || "imagem").replace(/\.[^.]+$/, "") + extFinal;
    return typeof File !== "undefined"
      ? new File([blob], novoNome, { type: blob.type })
      : blob;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/**
 * Envia uma imagem ao servidor com corpo bruto e cabeçalhos de metadados.
 */
export async function enviarImagem(
  backend,
  file,
  { unidade, aula, substitui, alt, nome } = {}
) {
  const params = new URLSearchParams();
  if (unidade) params.set("unidade", unidade);
  if (aula) params.set("aula", aula);
  if (substitui) params.set("substitui", substitui);
  const query = params.toString() ? `?${params.toString()}` : "";

  const h = await headers(backend, {
    "Content-Type": file.type || "application/octet-stream",
    "X-File-Name": encodeURIComponent(nome || file.name || "imagem"),
    "X-Texto-Alternativo": encodeURIComponent(alt || ""),
  });

  const res = await parse(
    await fetch(`${BASE_DOC_IMAGENS}${query}`, {
      method: "POST",
      headers: h,
      body: file,
    })
  );
  return res.imagem;
}

/**
 * Lista as imagens da galeria de acordo com os filtros.
 */
export async function listarImagens(backend, filtro = {}) {
  const params = new URLSearchParams();
  if (filtro.unidade) params.set("unidade", filtro.unidade);
  if (filtro.aula) params.set("aula", filtro.aula);
  if (filtro.busca) params.set("busca", filtro.busca);
  if (filtro.arquivadas) params.set("arquivadas", "1");
  if (filtro.todas_versoes) params.set("todas_versoes", "1");
  if (filtro.limite != null) params.set("limite", String(filtro.limite));
  if (filtro.pagina != null) params.set("pagina", String(filtro.pagina));
  const query = params.toString() ? `?${params.toString()}` : "";

  return parse(
    await fetch(`${BASE_DOC_IMAGENS}${query}`, {
      headers: await headers(backend),
    })
  );
}

/**
 * Obtém os detalhes completos de uma imagem (metadados, versões e histórico).
 */
export async function detalheImagem(backend, id) {
  return parse(
    await fetch(`${BASE_DOC_IMAGENS}/${id}`, {
      headers: await headers(backend),
    })
  );
}

/**
 * Atualiza o texto alternativo da imagem.
 */
export async function salvarTextoAlternativo(backend, id, texto) {
  return parse(
    await fetch(`${BASE_DOC_IMAGENS}/${id}/texto-alternativo`, {
      method: "PUT",
      headers: await headers(backend, { "Content-Type": "application/json" }),
      body: JSON.stringify({ texto: texto || "" }),
    })
  );
}

/**
 * Arquiva ou desarquiva uma imagem.
 */
export async function arquivarImagem(backend, id, arquivar = true) {
  return parse(
    await fetch(`${BASE_DOC_IMAGENS}/${id}/arquivar`, {
      method: "POST",
      headers: await headers(backend, { "Content-Type": "application/json" }),
      body: JSON.stringify({ arquivar: Boolean(arquivar) }),
    })
  );
}

// ── Memória de links da equipe (com validade e renovação antecipada) ──────────

const memoriasEquipe = new WeakMap();

function memoriaEquipeDo(backend) {
  let m = memoriasEquipe.get(backend);
  if (!m) {
    m = new Map();
    memoriasEquipe.set(backend, m);
  }
  return m;
}

/**
 * Obtém os endereços de exibição para a equipe (/links assinado ou fallback para blob de /arquivo).
 */
export async function linksEquipe(backend, ids) {
  if (!ids || !ids.length) return {};
  const memoria = memoriaEquipeDo(backend);
  const agora = Date.now();
  const precisando = ids.filter((id) => {
    const entrada = memoria.get(id);
    if (!entrada) return true;
    // Renova 30 s antes de expirar
    return entrada.expiraEm - 30_000 <= agora;
  });

  if (precisando.length > 0) {
    const h = await headers(backend, { "Content-Type": "application/json" });
    const dados = await parse(
      await fetch(`${BASE_DOC_IMAGENS}/links`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ ids: precisando }),
      })
    );
    const ttlMs = (dados.expira_em_segundos || 300) * 1000;
    const links = dados.links || {};

    for (const id of precisando) {
      const urlAssinada = links[id];
      if (urlAssinada) {
        memoria.set(id, {
          src: urlAssinada,
          expiraEm: agora + ttlMs,
          isBlob: false,
        });
      } else {
        // Fallback: baixa os bytes por /:id/arquivo e gera object URL
        try {
          const res = await parse(
            await fetch(`${BASE_DOC_IMAGENS}/${id}/arquivo`, {
              headers: await headers(backend),
            })
          );
          const blob = await res.blob();
          const src = URL.createObjectURL(blob);
          memoria.set(id, {
            src,
            expiraEm: agora + ttlMs,
            isBlob: true,
          });
        } catch {
          // Mantém não resolvido em caso de falha de rede
        }
      }
    }
  }

  const resultado = {};
  for (const id of ids) {
    resultado[id] = memoria.get(id)?.src || null;
  }
  return resultado;
}

/**
 * Obtém o endereço de exibição para a equipe de uma única imagem.
 */
export async function linkEquipe(backend, id) {
  const res = await linksEquipe(backend, [id]);
  return res[id] || null;
}

// ── Memória de imagens do aluno (bytes pelo servidor em blobs) ───────────────

const LIMITE_ALUNO = 24;
const memoriasAluno = new WeakMap();

function memoriaAlunoDo(backend) {
  let m = memoriasAluno.get(backend);
  if (!m) {
    m = new Map();
    memoriasAluno.set(backend, m);
  }
  return m;
}

function enxugarAluno(memoria) {
  for (const [k, e] of memoria) {
    if (memoria.size <= LIMITE_ALUNO) return;
    if (e.uso > 0 || !e.src) continue;
    memoria.delete(k);
    URL.revokeObjectURL?.(e.src);
  }
}

/**
 * Baixa e decodifica a imagem protegida do aluno como blob URL.
 * Mantém cache em memória por sessão; falhas não são cacheadas.
 */
export function carregarImagemAluno(backend, id) {
  const memoria = memoriaAlunoDo(backend);
  const achada = memoria.get(id);
  if (achada) {
    memoria.delete(id);
    memoria.set(id, achada);
    return achada.promessa;
  }

  const e = { uso: 0, src: null };
  e.promessa = (async () => {
    const token = backend.accessToken ? await backend.accessToken() : null;
    const res = await fetch(`${BASE_DOC_IMAGENS}/aluno/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let msg = `Erro ${res.status}.`;
      try {
        msg = (await res.json()).error || msg;
      } catch {
        // sem json
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const src = URL.createObjectURL(blob);
    e.src = src;
    return src;
  })();

  // Erro não fica guardado: a próxima chamada tentará novamente
  e.promessa.catch(() => {
    if (memoria.get(id) === e) memoria.delete(id);
  });

  memoria.set(id, e);
  enxugarAluno(memoria);
  return e.promessa;
}
