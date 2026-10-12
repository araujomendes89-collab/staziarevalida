// @vitest-environment node
/**
 * Fontes oficiais — rede (revisão FT-REV): endereço interno escrito como IPv6 em qualquer grafia é recusado, e a conexão vai ao
 * IP que já foi conferido (DNS rebinding: o nome não pode responder público na conferência e interno na conexão).
 */
import { describe, expect, it, vi } from "vitest";
import { fetchBytes, pinnedFetch, pinnedLookup, privateAddress, resolvePublicHost } from "../../server/podcasts/extract";

describe("privateAddress: IPv6 que carrega IPv4 interno", () => {
  const internos = [
    "127.0.0.1", "10.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "198.18.0.1",
    "::1", "::", "fc00::1", "fd12::1", "fe80::1", "fec0::1", "ff02::1", "ff00::", "100::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:192.168.0.1", "::ffff:169.254.169.254", "::ffff:172.16.0.1", "::ffff:172.31.255.255", "::ffff:100.64.0.1", "::FFFF:169.254.169.254",
    "::ffff:a9fe:a9fe", "::ffff:7f00:1", "::ffff:ac10:1", "::ffff:c0a8:101", "::ffff:6440:1", "0:0:0:0:0:ffff:a9fe:a9fe", "0000:0000:0000:0000:0000:ffff:7f00:0001", "[::ffff:a9fe:a9fe]",
    "::127.0.0.1", "::10.0.0.1", "::a9fe:a9fe", "::ffff:0:a9fe:a9fe", "::ffff:0:169.254.169.254",
    "64:ff9b::a9fe:a9fe", "64:ff9b::169.254.169.254", "64:ff9b::7f00:1", "64:ff9b:1::1",
    "2002:a9fe:a9fe::1", "2002:7f00:1::", "2002:c0a8:101::1", "2002:0a00:0001::5",
    "fe80::1%eth0",
  ];
  it.each(internos)("%s é interno", (ip) => expect(privateAddress(ip)).toBe(true));

  const publicos = ["8.8.8.8", "200.152.38.155", "::ffff:8.8.8.8", "::ffff:808:808", "2001:4860:4860::8888", "2606:4700:4700::1111", "64:ff9b::808:808", "2002:808:808::1", "::808:808"];
  it.each(publicos)("%s é público", (ip) => expect(privateAddress(ip)).toBe(false));

  it("o que não dá para conferir não passa", () => expect(privateAddress("não-é-ip")).toBe(true));

  it("resolvePublicHost recusa se QUALQUER resposta do DNS é interna, inclusive IPv6 mapeado", async () => {
    await expect(resolvePublicHost("x.gov.br", async () => ["200.152.38.155", "::ffff:a9fe:a9fe"])).rejects.toThrow("Endereço interno não é aceito.");
    await expect(resolvePublicHost("x.gov.br", async () => [])).rejects.toThrow("Endereço interno não é aceito.");
    await expect(resolvePublicHost("[::ffff:7f00:1]")).rejects.toThrow("Endereço interno não é aceito.");
    await expect(resolvePublicHost("x.gov.br", async () => ["200.152.38.155"])).resolves.toEqual(["200.152.38.155"]);
  });
});

describe("DNS rebinding: a conexão usa o IP já conferido", () => {
  const opts = { maxBytes: 1000, timeoutMs: 5000, userAgent: "t" };
  const html = () => new Response("<html><body>ok</body></html>", { status: 200, headers: { "content-type": "text/html" } });

  it("resolve UMA vez por destino e conecta só aos endereços conferidos, mesmo que o DNS mude depois", async () => {
    let calls = 0;
    // primeira resposta pública, a partir da segunda interna: quem consultasse o DNS de novo cairia na rede interna
    const resolver = vi.fn(async () => (++calls === 1 ? ["200.152.38.155"] : ["169.254.169.254"]));
    const connect = vi.fn(async () => html());
    const got = await fetchBytes("https://rebind.gov.br/a.html", fetch, { ...opts, resolver, connect });
    expect(got.kind).toBe("html");
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect((connect.mock.calls[0] as unknown[])[2]).toEqual(["200.152.38.155"]);
  });

  it("DNS que já responde interno na conferência: recusado e nenhuma conexão é aberta", async () => {
    const connect = vi.fn(async () => html());
    await expect(fetchBytes("https://rebind.gov.br/a.html", fetch, { ...opts, resolver: async () => ["::ffff:a9fe:a9fe"], connect })).rejects.toThrow("Endereço interno não é aceito.");
    expect(connect).not.toHaveBeenCalled();
  });

  it("cada redirecionamento é resolvido e conferido de novo", async () => {
    const resolver = vi.fn(async (host: string) => (host === "www.gov.br" ? ["200.152.38.155"] : ["::ffff:c0a8:101"]));
    const connect = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://mal.exemplo.com/x" } }));
    await expect(fetchBytes("https://www.gov.br/a", fetch, { ...opts, resolver, connect })).rejects.toThrow("Endereço interno não é aceito.");
    expect(connect).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it("a conexão de verdade (pinnedFetch e o lookup) recusa IP interno e só devolve os conferidos", async () => {
    await expect(pinnedFetch("https://rebind.gov.br/", {}, ["169.254.169.254"])).rejects.toThrow("Endereço interno não é aceito.");
    await expect(pinnedFetch("https://rebind.gov.br/", {}, ["200.152.38.155", "::ffff:a9fe:a9fe"])).rejects.toThrow("Endereço interno não é aceito.");
    const lookup = pinnedLookup(["200.152.38.155"]);
    // o nome pedido não importa: o endereço é sempre o conferido
    await new Promise<void>((done) => lookup("qualquer.nome", {}, (err: unknown, address: string, family: number) => { expect(err).toBeNull(); expect(address).toBe("200.152.38.155"); expect(family).toBe(4); done(); }));
    await new Promise<void>((done) => lookup("qualquer.nome", { all: true }, (err: unknown, list: { address: string }[]) => { expect(err).toBeNull(); expect(list.map((x) => x.address)).toEqual(["200.152.38.155"]); done(); }));
    await new Promise<void>((done) => pinnedLookup(["10.0.0.5"])("x", {}, (err: unknown) => { expect((err as Error).message).toBe("Endereço interno não é aceito."); done(); }));
  });

  it("com checkHost injetado (testes e rotas antigas) o comportamento de sempre continua", async () => {
    const f = vi.fn(async () => html()) as unknown as typeof fetch;
    const got = await fetchBytes("https://www.gov.br/a.html", f, { ...opts, checkHost: async () => {} });
    expect(got.kind).toBe("html");
    expect(f).toHaveBeenCalledTimes(1);
  });
});
