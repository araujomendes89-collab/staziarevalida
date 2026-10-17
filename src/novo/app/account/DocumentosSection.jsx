// Minha Conta → Documentos (decisão do dono de 17/10/2026: "cópia do contrato para o aluno e para o sistema"; Contrato 3.0, cláusula
// 6.4, e Política 3.0, seção 9.7). Mostra cada versão do Contrato/Termo que a pessoa aceitou, com data e hora (Brasília), por onde
// aceitou e o código de integridade do texto, e a Política e o Regulamento que valiam naquele aceite. "Ver" abre o texto exato
// guardado pelo sistema (banco, imutável); "Baixar" salva uma cópia em texto com versão, data, hora e código.
// Dados: app_my_legal_documents (migração …13740). Num banco sem ela, mostra só o aceite que a abertura do app conhece (boot.legal).
import React from "react";
import { Banner, Button, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { DocumentoLegal, NOME_DOCUMENTO } from "../legal/DocumentoLegal.jsx";
import { carregarTexto, semFuncaoNoBanco } from "../legal/vigente.js";
import { documentosDa, temNoSite } from "../legal/documentos.js";
import { textoSimples } from "../legal/LegalText.jsx";
import { baixarArquivo } from "../legal/baixar.js";
import "../legal/legal.css";

const ORIGEM = { cadastro: "no cadastro", google: "ao entrar com o Google", tela_aceite: "na tela de aceite", tutor: "no Tutor" };

/** Data e hora sempre no fuso de Brasília. */
export function dataHoraBR(iso) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
}

/** Nome do Contrato/Termo conforme a versão (até a 2.0 era o "Termo de Aceite e Uso"). */
export function nomeDoTermo(versao) {
  return temNoSite(versao) ? "Termo de Aceite e Uso" : NOME_DOCUMENTO.termo_uso;
}

const curto = (sha) => (sha ? `${sha.slice(0, 8)}…${sha.slice(-8)}` : null);

function Leitor({ doc, versao, titulo, onClose }) {
  const fechar = React.useRef(null);
  React.useEffect(() => {
    fechar.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="acd-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="acd-box" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="acd-bar">
          <strong>{titulo}</strong>
          <Button ref={fechar} variant="ghost" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
        <div className="acd-body">
          <DocumentoLegal doc={doc} versao={versao} />
        </div>
      </div>
    </div>
  );
}

function Linha({ titulo, detalhe, codigo, onVer, onBaixar, baixando }) {
  return (
    <div className="acd-linha">
      <div className="acd-info">
        <div className="acd-titulo">{titulo}</div>
        {detalhe && <div className="acd-detalhe">{detalhe}</div>}
        {codigo && <div className="acd-codigo" title={codigo}>Código de integridade: {curto(codigo)}</div>}
      </div>
      <div className="acd-botoes">
        <Button variant="secondary" size="sm" icon="eye" onClick={onVer}>
          Ver
        </Button>
        <Button variant="ghost" size="sm" icon="download" onClick={onBaixar} loading={baixando}>
          Baixar
        </Button>
      </div>
    </div>
  );
}

export function DocumentosSection({ Cabecalho }) {
  const { backend, boot, user } = useSession();
  const [estado, setEstado] = React.useState({ status: "carregando", itens: [] });
  const [leitor, setLeitor] = React.useState(null);
  const [baixando, setBaixando] = React.useState(null);
  const [erro, setErro] = React.useState(null);
  const [tentativa, setTentativa] = React.useState(0);

  React.useEffect(() => {
    let vivo = true;
    const doBoot = () => {
      const t = boot?.legal?.termo_uso;
      return t?.accepted && t?.accepted_at ? [{ document: "termo_uso", version: t.accepted, accepted_at: t.accepted_at, companions: {} }] : [];
    };
    Promise.resolve()
      .then(() => backend.rpc("app_my_legal_documents"))
      .then((itens) => vivo && setEstado({ status: "pronto", itens: Array.isArray(itens) ? itens : [] }))
      .catch((err) => {
        if (!vivo) return;
        if (semFuncaoNoBanco(err)) setEstado({ status: "pronto", itens: doBoot() });
        else setEstado({ status: "erro", itens: [] });
      });
    return () => {
      vivo = false;
    };
  }, [backend, boot, tentativa]);

  const baixar = async (chave, doc, versao, aceite) => {
    setBaixando(chave);
    setErro(null);
    try {
      let corpo;
      let sha = null;
      if (doc === "termo_uso" && temNoSite(versao)) corpo = documentosDa(versao).termo;
      else {
        const t = await carregarTexto(doc, versao, backend);
        if (!t) throw new Error("sem texto");
        corpo = t.body;
        sha = t.sha256;
      }
      const titulo = doc === "termo_uso" ? nomeDoTermo(versao) : NOME_DOCUMENTO[doc];
      const cabecalho = [
        "StaziaMed Revalida — cópia do aluno",
        `${titulo} — versão ${versao}`,
        aceite ? `Aceito em ${dataHoraBR(aceite.accepted_at)} (horário de Brasília)${user?.email ? ` pela conta ${user.email}` : ""}` : null,
        sha ? `Código de integridade (SHA-256) do texto: ${sha}` : null,
        "Stazia Tecnologia e Educação Ltda — CNPJ 64.964.213/0001-16",
        "".padEnd(60, "-"),
        "",
      ].filter((l) => l !== null);
      const nome = `staziamed-${doc === "termo_uso" ? "contrato" : doc === "politica_privacidade" ? "politica-de-privacidade" : "regulamento"}-v${versao}.txt`;
      baixarArquivo(nome, `${cabecalho.join("\n")}\n${textoSimples(corpo)}`);
    } catch {
      setErro("Não foi possível baixar o documento agora. Tente de novo.");
    }
    setBaixando(null);
  };

  const companheiros = (item) =>
    ["politica_privacidade", "regulamento"]
      .map((doc) => ({ doc, ...(item.companions?.[doc] ?? {}) }))
      .filter((c) => c.version);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Cabecalho title="Documentos" subtitle="O contrato que você aceitou, com a Política e o Regulamento daquela data" />
      {erro && <Banner tone="danger">{erro}</Banner>}
      {estado.status === "carregando" && <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Carregando seus documentos…</div>}
      {estado.status === "erro" && (
        <Banner tone="danger" title="Não foi possível carregar seus documentos">
          <Button variant="secondary" size="sm" onClick={() => setTentativa((t) => t + 1)}>
            Tentar de novo
          </Button>
        </Banner>
      )}
      {estado.status === "pronto" && estado.itens.length === 0 && (
        <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Nenhum aceite registrado nesta conta.</div>
      )}
      {estado.status === "pronto" &&
        estado.itens.map((item, i) => {
          const titulo = `${nomeDoTermo(item.version)} · versão ${item.version}`;
          const chave = `${item.version}-${item.accepted_at}`;
          return (
            <section key={chave} className="acd-grupo" aria-label={titulo}>
              <div className="acd-selo">{i === 0 ? "Aceite mais recente" : "Aceite anterior"}</div>
              <Linha
                titulo={titulo}
                detalhe={`Aceito em ${dataHoraBR(item.accepted_at)} (horário de Brasília)${ORIGEM[item.origin] ? `, ${ORIGEM[item.origin]}` : ""}.`}
                codigo={item.text_sha256}
                onVer={() => setLeitor({ doc: "termo_uso", versao: item.version, titulo })}
                onBaixar={() => baixar(`${chave}-t`, "termo_uso", item.version, item)}
                baixando={baixando === `${chave}-t`}
              />
              {companheiros(item).map((c) => (
                <Linha
                  key={c.doc}
                  titulo={`${NOME_DOCUMENTO[c.doc]} · versão ${c.version}`}
                  detalhe="Em vigor na data deste aceite."
                  codigo={c.sha256}
                  onVer={() => setLeitor({ doc: c.doc, versao: c.version, titulo: `${NOME_DOCUMENTO[c.doc]} · versão ${c.version}` })}
                  onBaixar={() => baixar(`${chave}-${c.doc}`, c.doc, c.version, null)}
                  baixando={baixando === `${chave}-${c.doc}`}
                />
              ))}
            </section>
          );
        })}
      <div className="acd-vigentes">
        <div style={{ font: "var(--type-label)" }}>Versões em vigor hoje</div>
        <div className="acd-links">
          <a href="/novo/termos">
            <Icon name="file-text" size={16} /> Termos de Uso e Contrato
          </a>
          <a href="/novo/privacidade">
            <Icon name="file-text" size={16} /> Política de Privacidade
          </a>
          <a href="/novo/regulamento">
            <Icon name="file-text" size={16} /> Regulamento de Coins e Ligas
          </a>
        </div>
        <p className="acd-nota">
          A Stazia guarda uma cópia de cada texto aceito, que não pode ser alterada, junto com o registro do seu aceite. Dúvidas sobre os seus dados:
          privacidade@staziamed.com.br.
        </p>
      </div>
      {leitor && <Leitor {...leitor} onClose={() => setLeitor(null)} />}
    </div>
  );
}
