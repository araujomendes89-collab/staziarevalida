// @vitest-environment node
/**
 * Envio com porcentagem ao depósito do Supabase: mesma requisição que o storage-js faz em uploadToSignedUrl
 * (PUT, FormData com cacheControl e o arquivo, x-upsert), só que por XMLHttpRequest para ter o progresso.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { signedUploadWithProgress } from "../novo/data/signedUploadXhr";

class FakeXhr {
  static last: FakeXhr;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  responseText = "";
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeXhr.last = this;
  }
  open(m: string, u: string) {
    this.method = m;
    this.url = u;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(b: unknown) {
    this.body = b;
  }
}

const run = (over: Record<string, unknown> = {}) => {
  const file = new Blob(["%PDF-1"], { type: "application/pdf" });
  const onProgress = vi.fn();
  const p = signedUploadWithProgress({
    url: "https://x.supabase.co/storage/v1/object/upload/sign/content-hub/uploads/a b.pdf?token=tk",
    headers: { apikey: "anon", authorization: "Bearer anon" },
    file,
    onProgress,
    ...over,
  });
  return { p, onProgress, file, xhr: FakeXhr.last };
};

afterEach(() => vi.unstubAllGlobals());

describe("envio assinado com progresso", () => {
  it("manda a mesma requisição do storage-js: PUT, cabeçalhos, x-upsert e FormData (cacheControl + arquivo)", () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const { xhr, file } = run();
    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toBe("https://x.supabase.co/storage/v1/object/upload/sign/content-hub/uploads/a b.pdf?token=tk");
    expect(xhr.headers).toEqual({ apikey: "anon", authorization: "Bearer anon", "x-upsert": "false" });
    const body = xhr.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("cacheControl")).toBe("3600");
    expect(body.get("")).toBeInstanceOf(Blob);
    expect((body.get("") as Blob).size).toBe(file.size);
  });

  it("converte o progresso em porcentagem inteira de 0 a 100 e resolve com 200", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const { p, onProgress, xhr } = run();
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 450, total: 1000 });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1200, total: 1000 });
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 5, total: 0 });
    xhr.status = 200;
    xhr.onload?.();
    await expect(p).resolves.toBeUndefined();
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([45, 100]);
  });

  it("erro 400 rejeita com a mensagem do servidor (message ou error)", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const a = run();
    a.xhr.status = 400;
    a.xhr.responseText = JSON.stringify({ message: "Token expirado" });
    a.xhr.onload?.();
    await expect(a.p).rejects.toThrow("Token expirado");
    const b = run();
    b.xhr.status = 400;
    b.xhr.responseText = JSON.stringify({ error: "Arquivo grande demais" });
    b.xhr.onload?.();
    await expect(b.p).rejects.toThrow("Arquivo grande demais");
    const c = run();
    c.xhr.status = 500;
    c.xhr.responseText = "<html>";
    c.xhr.onload?.();
    await expect(c.p).rejects.toThrow("Não foi possível enviar o arquivo ao depósito.");
  });

  it("falha de rede rejeita com a mensagem de conexão", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const { p, xhr } = run();
    xhr.onerror?.();
    await expect(p).rejects.toThrow("Falha de conexão ao enviar o arquivo.");
  });
});
