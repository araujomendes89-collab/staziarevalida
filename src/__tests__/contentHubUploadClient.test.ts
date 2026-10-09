// @vitest-environment node
/**
 * Navegador da Central de Conteúdo: com o Supabase, o PDF vai direto ao depósito (envio assinado) e só a confirmação,
 * pequena, passa pelo servidor do site; no banco local, o PDF segue pelo servidor. Abrir o original usa o endereço
 * assinado quando houver.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { hubDocumentUrl, hubUploadPdf } from "../novo/app/admin/content/api.js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pdf = () => new File([new Uint8Array([37, 80, 68, 70, 45, 49])], "Diretriz grande.pdf", { type: "application/pdf" });

afterEach(() => vi.unstubAllGlobals());

describe("Importar PDF", () => {
  it("com envio assinado: prepara, envia direto ao depósito e confirma com os metadados (o arquivo não vai ao servidor)", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/upload")) return json({ mode: "signed", bucket: "content-hub", key: "uploads/abc.pdf", path: "uploads/abc.pdf", token: "tk" });
      return json({ id: "doc-1", duplicate: false, sha256: "f".repeat(64), job: { id: "job-1" } }, 201);
    });
    const uploadToSignedUrl = vi.fn(async () => undefined);
    const backend = { accessToken: async () => "sessao", uploadToSignedUrl };
    const file = pdf();
    const r = await hubUploadPdf(backend, "/documents", file, { author: "Autor", publisher: " ", rights_status: "unknown" });
    expect(r).toMatchObject({ id: "doc-1", duplicate: false });
    expect(calls.map((c) => c.url)).toEqual(["/api/content-hub/documents/upload", "/api/content-hub/documents/confirm"]);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ size_bytes: file.size });
    expect(uploadToSignedUrl).toHaveBeenCalledWith("content-hub", "uploads/abc.pdf", "tk", file, "application/pdf", undefined);
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ author: "Autor", rights_status: "unknown", key: "uploads/abc.pdf", name: "Diretriz grande.pdf" });
    for (const c of calls) expect(c.init.body).not.toBe(file);
  });

  it("PDF de fonte oficial usa o mesmo caminho, nas rotas da fonte", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return url.endsWith("/upload") ? json({ mode: "signed", bucket: "content-hub", key: "uploads/x.pdf", path: "uploads/x.pdf", token: "t" }) : json({ id: "d" }, 201);
    });
    await hubUploadPdf({ accessToken: async () => "s", uploadToSignedUrl: async () => undefined }, "/sources/s1/document", pdf());
    expect(urls).toEqual(["/api/content-hub/sources/s1/document/upload", "/api/content-hub/sources/s1/document/confirm"]);
  });

  it("sem envio assinado (banco local): o PDF segue pelo servidor, com os metadados na consulta", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return url.endsWith("/upload") ? json({ mode: "direct" }) : json({ id: "doc-2" }, 201);
    });
    const file = pdf();
    await hubUploadPdf({ accessToken: async () => "s" }, "/documents", file, { author: "Autor" });
    expect(calls[1].url).toBe("/api/content-hub/documents?author=Autor");
    expect(calls[1].init.body).toBe(file);
    expect((calls[1].init.headers as Record<string, string>)["X-File-Name"]).toBe(encodeURIComponent("Diretriz grande.pdf"));
  });

  it("repassa o progresso ao envio ao depósito (6º argumento) e avisa a etapa 'conferindo' antes da confirmação", async () => {
    const order: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/upload")) return json({ mode: "signed", bucket: "content-hub", key: "k.pdf", path: "k.pdf", token: "tk" });
      order.push("confirm");
      return json({ id: "d" }, 201);
    });
    const uploadToSignedUrl = vi.fn(async (...args: unknown[]) => {
      order.push("enviando");
      (args[5] as (n: number) => void)(45);
    });
    const onProgress = vi.fn();
    const onStage = vi.fn((s: string) => order.push(`stage:${s}`));
    const file = pdf();
    await hubUploadPdf({ accessToken: async () => "s", uploadToSignedUrl }, "/documents", file, {}, { onProgress, onStage });
    expect(uploadToSignedUrl).toHaveBeenCalledWith("content-hub", "k.pdf", "tk", file, "application/pdf", onProgress);
    expect(onProgress).toHaveBeenCalledWith(45);
    expect(order).toEqual(["stage:enviando", "enviando", "stage:conferindo", "confirm"]);
  });

  it("no banco local (modo direto) nunca chama onProgress: não inventa porcentagem", async () => {
    vi.stubGlobal("fetch", async (url: string) => (url.endsWith("/upload") ? json({ mode: "direct" }) : json({ id: "d" }, 201)));
    const onProgress = vi.fn();
    await hubUploadPdf({ accessToken: async () => "s" }, "/documents", pdf(), {}, { onProgress, onStage: () => undefined });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("erro do servidor no preparo chega à tela com a mensagem dele", async () => {
    vi.stubGlobal("fetch", async () => json({ error: "Arquivo acima de 300 MB." }, 413));
    await expect(hubUploadPdf({ accessToken: async () => "s", uploadToSignedUrl: async () => undefined }, "/documents", pdf())).rejects.toThrow("Arquivo acima de 300 MB.");
  });
});

describe("Abrir o PDF original", () => {
  it("usa o endereço assinado quando o servidor devolve um", async () => {
    vi.stubGlobal("fetch", async () => json({ url: "https://deposito.test/documents/a.pdf?token=1" }));
    expect(await hubDocumentUrl({ accessToken: async () => "s" }, "doc-1")).toBe("https://deposito.test/documents/a.pdf?token=1");
  });

  it("sem endereço assinado (banco local): baixa pelo servidor", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return url.endsWith("/link") ? json({ url: null }) : new Response(new Blob(["%PDF-"], { type: "application/pdf" }), { status: 200, headers: { "Content-Type": "application/pdf" } });
    });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:local-1" }));
    expect(await hubDocumentUrl({ accessToken: async () => "s" }, "doc-1")).toBe("blob:local-1");
    expect(urls).toEqual(["/api/content-hub/documents/doc-1/link", "/api/content-hub/documents/doc-1/file"]);
  });
});
