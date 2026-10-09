/**
 * Envio ao depósito do Supabase com porcentagem. O supabase-js usa fetch (sem progresso de envio); aqui vai a MESMA
 * requisição que o storage-js faz em uploadToSignedUrl (PUT, x-upsert, FormData com cacheControl e o arquivo),
 * só que por XMLHttpRequest, para ouvir xhr.upload.onprogress.
 */
export type SignedUploadXhrArgs = {
  url: string;
  headers: Record<string, string>;
  file: Blob;
  cacheControl?: string;
  onProgress?: (pct: number) => void;
};

export function signedUploadWithProgress({ url, headers, file, cacheControl = "3600", onProgress }: SignedUploadXhrArgs): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries({ ...headers, "x-upsert": "false" })) xhr.setRequestHeader(k, v);
    const body = new FormData();
    body.append("cacheControl", cacheControl);
    body.append("", file);
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !e.total) return;
      onProgress?.(Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100))));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = "";
      try {
        const j = JSON.parse(xhr.responseText);
        msg = String(j?.message || j?.error || "");
      } catch {
        // resposta que não é JSON: usa a mensagem padrão
      }
      reject(new Error(msg || "Não foi possível enviar o arquivo ao depósito."));
    };
    xhr.onerror = () => reject(new Error("Falha de conexão ao enviar o arquivo."));
    xhr.send(body);
  });
}
