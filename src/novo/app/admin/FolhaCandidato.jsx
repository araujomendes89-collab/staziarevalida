// Administração › Estações: FOLHA DO CANDIDATO em imagem (pedido do dono de 16/10). Pré-visualização com o mesmo modelo do
// servidor (src/shared/dupla/folhaCandidato.ts), botão para gerar/regerar e a imagem gerada. Quem gera é o servidor (Chromium);
// sem ele, o pedido fica para o processamento. O aviso "desatualizada" aparece quando o conteúdo da estação mudou depois da
// imagem: a sala volta ao texto até gerar de novo.
import React from "react";
import { Badge, Banner, Button } from "../../ds";
import { useSession } from "../session.jsx";
import { Loading, messageOf } from "./common.jsx";
import { FOLHA_LARGURA, FOLHA_MODELO, folhaHtml } from "../../../shared/dupla/folhaCandidato";

const BASE = "/api/dupla/folhas";
const LOGO = "/novo-assets/logo-staziamed-revalida-v2.png";
const FONTES = "@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');";

/** Rótulo e cor de cada situação (dupla_folha_situacao, migração 013390). */
export const ESTADO_FOLHA = {
  nenhuma: ["Sem folha em imagem", "neutral"],
  pedida: ["Folha pedida: aguardando o gerador", "info"],
  pronta: ["Folha em imagem pronta", "success"],
  desatualizada: ["Folha desatualizada: gere de novo", "warning"],
  falhou: ["Folha não foi gerada", "danger"],
};

export function FolhaBadge({ situacao }) {
  if (!situacao) return null;
  const [label, tone] = situacao.bloqueio && situacao.estado !== "pronta" ? ["Folha em imagem indisponível", "neutral"] : ESTADO_FOLHA[situacao.estado] ?? ESTADO_FOLHA.nenhuma;
  return (
    <Badge size="sm" tone={tone}>
      {label}
    </Badge>
  );
}

async function chamar(backend, path, init = {}) {
  const token = backend?.accessToken ? await backend.accessToken() : null;
  if (!token) throw new Error("A folha em imagem precisa do servidor: entre de novo na sua conta.");
  const res = await fetch(BASE + path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  if (!res.ok) {
    let message = `Erro ${res.status}.`;
    try {
      message = (await res.json()).error ?? message;
    } catch {
      // sem corpo
    }
    throw new Error(message);
  }
  return res;
}

/** Endereço para mostrar a imagem gerada: assinado (Supabase) ou cópia baixada (desenvolvimento). */
async function imagemUrl(backend, stationId) {
  const id = encodeURIComponent(stationId);
  const { url } = await (await chamar(backend, `/${id}/imagem/link`)).json();
  if (url) return url;
  return URL.createObjectURL(await (await chamar(backend, `/${id}/imagem/file`)).blob());
}

/** Pré-visualização: o HTML do modelo num quadro sem scripts, na largura da folha (rola de lado em tela estreita). */
function Previa({ fonte }) {
  const ref = React.useRef(null);
  const [altura, setAltura] = React.useState(900);
  const html = React.useMemo(() => folhaHtml(fonte, { logoSrc: LOGO, fontCss: FONTES }), [fonte]);
  const medir = () => {
    try {
      const doc = ref.current?.contentDocument;
      if (doc?.body) setAltura(Math.max(300, doc.documentElement.scrollHeight));
    } catch {
      // sem acesso ao quadro: fica a altura padrão
    }
  };
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border-subtle)", borderRadius: 8, background: "#fff" }}>
      <iframe
        ref={ref}
        title="Pré-visualização da folha do candidato"
        sandbox="allow-same-origin"
        srcDoc={html}
        onLoad={() => {
          medir();
          setTimeout(medir, 600); // depois das fontes
        }}
        style={{ display: "block", width: FOLHA_LARGURA, height: altura, border: 0 }}
      />
    </div>
  );
}

export function FolhaCandidato({ stationId, onSituacao }) {
  const { backend } = useSession();
  const [dados, setDados] = React.useState({ loading: true, data: null, error: null });
  const [acao, setAcao] = React.useState({ busy: false, error: null, aviso: null });
  const [ver, setVer] = React.useState(null); // "previa" | "imagem"
  const [img, setImg] = React.useState({ loading: false, url: null, error: null });

  const avisar = React.useRef(onSituacao);
  avisar.current = onSituacao;
  const carregar = React.useCallback(async () => {
    try {
      const data = await backend.rpc("app_admin_dupla_folha", { p_station_id: stationId });
      setDados({ loading: false, data, error: null });
      avisar.current?.(data?.situacao ?? null);
    } catch (err) {
      setDados({ loading: false, data: null, error: messageOf(err) });
    }
  }, [backend, stationId]);
  React.useEffect(() => {
    carregar();
  }, [carregar]);

  const mostrarImagem = async () => {
    setVer("imagem");
    setImg({ loading: true, url: null, error: null });
    try {
      setImg({ loading: false, url: await imagemUrl(backend, stationId), error: null });
    } catch (err) {
      setImg({ loading: false, url: null, error: messageOf(err) });
    }
  };

  const gerar = async () => {
    setAcao({ busy: true, error: null, aviso: null });
    try {
      const r = await (await chamar(backend, `/${encodeURIComponent(stationId)}/gerar`, { method: "POST" })).json();
      setAcao({ busy: false, error: null, aviso: r.gerada ? "Folha gerada. A sala já mostra esta imagem ao candidato." : r.aviso });
      await carregar();
      if (r.gerada) await mostrarImagem();
    } catch (err) {
      setAcao({ busy: false, error: messageOf(err), aviso: null });
      await carregar();
    }
  };

  if (dados.loading) return <Loading />;
  if (dados.error) return <Banner tone="danger">{dados.error}</Banner>;
  const { fonte, situacao } = dados.data ?? {};
  if (!fonte || !situacao) return null;
  const antiga = situacao.modelo && situacao.modelo !== FOLHA_MODELO;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ font: "var(--type-label)" }}>Folha do candidato (imagem)</div>
        <FolhaBadge situacao={situacao} />
        {situacao.com_relato && <Badge size="sm">Com o relato do caso</Badge>}
      </div>
      <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        Instruções para o participante{situacao.com_relato ? " e relato do caso clínico (o impresso 1, que sai da lista de impressos do candidato)" : ""}, no desenho da estação simulada. O texto é o da
        estação, sem o nome nem o tema.
        {situacao.gerada_em ? ` Gerada em ${new Date(situacao.gerada_em).toLocaleString("pt-BR")}.` : ""}
      </p>
      {situacao.bloqueio && <Banner tone="warning">{situacao.bloqueio}</Banner>}
      {situacao.estado === "desatualizada" && (
        <Banner tone="warning">O conteúdo da estação mudou depois desta imagem. Enquanto não gerar de novo, a sala mostra o texto ao candidato.</Banner>
      )}
      {situacao.estado === "falhou" && situacao.erro && <Banner tone="danger">{situacao.erro}</Banner>}
      {antiga && <Banner tone="info">Esta imagem foi feita com um modelo anterior da folha. Gere de novo para usar o desenho atual.</Banner>}
      {acao.error && <Banner tone="danger">{acao.error}</Banner>}
      {acao.aviso && <Banner tone="info">{acao.aviso}</Banner>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button size="sm" icon="refresh-cw" disabled={Boolean(situacao.bloqueio)} loading={acao.busy} onClick={gerar}>
          {situacao.tem_imagem ? "Gerar de novo" : "Gerar folha"}
        </Button>
        <Button variant="secondary" size="sm" icon="eye" onClick={() => setVer(ver === "previa" ? null : "previa")} aria-expanded={ver === "previa"}>
          {ver === "previa" ? "Fechar pré-visualização" : "Pré-visualizar"}
        </Button>
        {situacao.tem_imagem && (
          <Button variant="secondary" size="sm" icon="image" onClick={() => (ver === "imagem" ? setVer(null) : mostrarImagem())} aria-expanded={ver === "imagem"}>
            {ver === "imagem" ? "Fechar imagem" : "Ver imagem gerada"}
          </Button>
        )}
      </div>
      {ver === "previa" && <Previa fonte={fonte} />}
      {ver === "imagem" &&
        (img.loading ? (
          <Loading />
        ) : img.error ? (
          <Banner tone="danger">{img.error}</Banner>
        ) : img.url ? (
          <div style={{ overflowX: "auto", border: "1px solid var(--border-subtle)", borderRadius: 8, background: "#fff" }}>
            <img src={img.url} alt="Folha do candidato gerada" style={{ display: "block", width: FOLHA_LARGURA, maxWidth: "none" }} />
          </div>
        ) : null)}
    </div>
  );
}
