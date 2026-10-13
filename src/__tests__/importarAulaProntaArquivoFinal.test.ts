// @vitest-environment node
/**
 * Aula pronta importada (migração 9950): o processamento gera só o arquivo final da versão importada (etapa "render", escopo
 * "import:<versão>"), sem documento, sem IA e sem pedir a etapa seguinte. Banco e renderizador falsos, sem rede.
 */
import { describe, expect, it } from "vitest";
import { runJob, type Job, type PipelineDeps } from "../../server/contentHub/pipeline";

function montar(status: string) {
  const chamadas: { fn: string; args: any }[] = [];
  const guardados: string[] = [];
  const versao = { version_id: "v-1", unit_id: "u-1", status, content: { sections: [] }, content_hash: "h", version: 1, created_at: "2026-10-13T12:00:00Z", title: "Tuberculose pulmonar" };
  const deps = {
    db: {
      mode: "teste",
      service: async (fn: string, args: any) => {
        chamadas.push({ fn, args });
        if (fn === "ch_worker_unit_version") return args.p_version_id === "v-1" ? versao : null;
        if (fn === "ch_worker_materials") return [{ id: "m-aula", kind: "lesson", content: { title: "x", sections: [] }, content_hash: "ha" }, { id: "m-q", kind: "questions", content: {}, content_hash: "hq" }];
        if (fn === "ch_worker_finish") return "succeeded";
        return null;
      },
    },
    storage: { put: async (key: string) => void guardados.push(key) },
    ai: { provider: null, status: { ready: false } },
    renderer: {
      templateVersion: "templates-1.0",
      brandVersion: "brand-1.0",
      render: async (kind: string) => [{ format: "pdf", data: Buffer.from(`pdf de ${kind}`), contentType: "application/pdf", check: { ok: true } }],
      close: async () => {},
    },
  } as unknown as PipelineDeps;
  const job: Job = { id: "j-1", document_id: null, step: "render", scope_key: "import:v-1", versions: {}, attempts: 1, max_attempts: 3, checkpoint: {} };
  return { deps, job, chamadas, guardados };
}

describe("Arquivo final da aula pronta importada", () => {
  it("versão aguardando revisão: gera e grava o PDF da aula e termina sem etapa seguinte (sem revisão por IA)", async () => {
    const { deps, job, chamadas, guardados } = montar("awaiting_review");
    const r = await runJob(deps, job);
    expect(r).toMatchObject({ status: "succeeded", next: null });
    expect(guardados).toEqual(["renders/m-aula/ha.pdf"]);
    const render = chamadas.find((c) => c.fn === "ch_worker_save_render")!.args.p_render;
    expect(render).toMatchObject({ material_id: "m-aula", format: "pdf", material_hash: "ha", check_result: { ok: true } });
    expect(chamadas.some((c) => c.fn === "ch_worker_next" || c.fn === "ch_worker_next_marked")).toBe(false);
    expect(chamadas.some((c) => c.fn === "ch_worker_document_meta" || c.fn === "ch_worker_unit_versions")).toBe(false);
  });

  it("versão que já não está em revisão (aprovada ou publicada): não gera nada", async () => {
    const { deps, job, chamadas, guardados } = montar("published");
    expect(await runJob(deps, job)).toMatchObject({ status: "succeeded", next: null });
    expect(guardados).toEqual([]);
    expect(chamadas.some((c) => c.fn === "ch_worker_save_render")).toBe(false);
  });
});
