/**
 * Apoio dos testes das Fontes oficiais com IA: um PDF mínimo com texto e uma "internet" de mentira (nada sai da máquina).
 */

/** Tudo em ASCII ou Latin-1: o PDF é gravado em latin1 e a fonte (Helvetica) não declara outra codificação. */
function pdfString(value: string): string {
  return `(${value.replace(/[()\\]/g, "\\$&")})`;
}

/** PDF mínimo com texto (Helvetica), uma página por item; `info` acrescenta Título e data de criação (`D:AAAAMMDD…`). */
export function makePdf(pages: string[], info?: { title?: string; creationDate?: string }): Buffer {
  const objs: string[] = [`<< /Type /Catalog /Pages 2 0 R >>`, `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`];
  pages.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td 16 TL ${text.split("\n").map((l) => `${pdfString(l)} Tj T*`).join(" ")} ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  });
  let infoRef = "";
  if (info && (info.title !== undefined || info.creationDate !== undefined)) {
    objs.push(`<< ${info.title !== undefined ? `/Title ${pdfString(info.title)} ` : ""}${info.creationDate !== undefined ? `/CreationDate ${pdfString(info.creationDate)} ` : ""}>>`);
    infoRef = ` /Info ${objs.length} 0 R`;
  }
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R${infoRef} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export interface FakeRoute {
  status?: number;
  headers?: Record<string, string>;
  body?: Buffer | string;
  /** Corpo em pedaços (sem tamanho declarado): para testar o corte pelo limite. */
  stream?: ReadableStream;
}

export type FakeWeb = typeof fetch & { calls: { url: string; headers: Record<string, string> }[] };

/** `fetch` de mentira: responde pelas rotas (chave = endereço exato) e guarda cada chamada; endereço fora das rotas dá 404. */
export function fakeWeb(routes: Record<string, FakeRoute>): FakeWeb {
  const calls: FakeWeb["calls"] = [];
  const impl = (async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? input);
    calls.push({ url, headers: { ...((init?.headers as Record<string, string> | undefined) ?? {}) } });
    const route = routes[url];
    if (!route) return new Response("não encontrado", { status: 404 });
    const body = route.stream ?? (typeof route.body === "string" ? route.body : route.body ? new Uint8Array(route.body) : null);
    return new Response(body, { status: route.status ?? 200, headers: route.headers });
  }) as FakeWeb;
  impl.calls = calls;
  return impl;
}

/** Corpo em pedaços de `chunk` bytes, até `total` bytes, sem tamanho declarado. */
export function chunkedStream(total: number, chunk = 256): ReadableStream {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= total) return controller.close();
      const n = Math.min(chunk, total - sent);
      controller.enqueue(new Uint8Array(n).fill(65));
      sent += n;
    },
  });
}
