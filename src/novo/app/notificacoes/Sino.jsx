// Sino da Central de Notificações (migração 013830) no cabeçalho do aluno, no celular e no computador. Bolinha com o número de não
// lidas (até "9+") e nome acessível "Notificações, 3 não lidas". O painel abre por cima, preso ao sino (computador e tablet), ou de
// baixo para cima quase em tela cheia (celular). Para equipe e revisores não aparece (o provedor fica desligado).
import React from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Button, Icon, IconTile } from "../../ds";
import { useLayout } from "../shell/useLayout.js";
import { useNotificacoes } from "./NotificacoesProvider.jsx";
import { arteDoTipo, dataCompleta, destinoDaAcao, rotuloBolinha, rotuloSino, tempoRelativo } from "./modelo.js";
import "./notificacoes.css";

export function Sino() {
  const ctx = useNotificacoes();
  const [aberto, setAberto] = React.useState(false);
  const botao = React.useRef(null);
  const fechar = React.useCallback((devolverFoco = true) => {
    setAberto(false);
    if (devolverFoco) setTimeout(() => botao.current?.focus(), 0);
  }, []);
  if (!ctx) return null;
  const bolinha = rotuloBolinha(ctx.naoLidas);
  return (
    <>
      <button
        ref={botao}
        type="button"
        className={`ntf-sino${aberto ? " is-aberto" : ""}`}
        aria-label={rotuloSino(ctx.naoLidas)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        title="Notificações"
        data-testid="sino"
        onClick={() => {
          if (aberto) return fechar();
          setAberto(true);
          ctx.recarregar();
        }}
      >
        <Icon name="bell" size={22} />
        {bolinha && (
          <span className="ntf-bolinha" aria-hidden="true" data-testid="sino-bolinha">
            {bolinha}
          </span>
        )}
      </button>
      {aberto && <PainelNotificacoes ancora={botao} onFechar={fechar} />}
    </>
  );
}

/** Posição do painel do computador: logo abaixo do sino, alinhado pela direita, sem sair da tela. */
function usePosicao(ancora, ativo) {
  const [pos, setPos] = React.useState(null);
  React.useLayoutEffect(() => {
    if (!ativo) return undefined;
    const medir = () => {
      const r = ancora.current?.getBoundingClientRect();
      if (!r) return;
      const largura = Math.min(420, window.innerWidth - 32);
      const esquerda = Math.min(Math.max(16, r.right - largura), window.innerWidth - largura - 16);
      setPos({ top: Math.round(r.bottom + 10), left: Math.round(esquerda), width: largura, setaX: Math.round(r.left + r.width / 2 - esquerda) });
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [ancora, ativo]);
  return pos;
}

export function PainelNotificacoes({ ancora, onFechar }) {
  const ctx = useNotificacoes();
  const navigate = useNavigate();
  const celular = useLayout() === "mobile";
  const pos = usePosicao(ancora, !celular);
  const painel = React.useRef(null);

  React.useEffect(() => {
    painel.current?.querySelector("h2")?.focus();
    const tecla = (e) => e.key === "Escape" && onFechar();
    const fora = (e) => {
      if (painel.current?.contains(e.target) || ancora.current?.contains(e.target)) return;
      onFechar(false);
    };
    document.addEventListener("keydown", tecla);
    if (!celular) document.addEventListener("mousedown", fora);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("mousedown", fora);
    };
  }, [onFechar, ancora, celular]);

  if (!ctx) return null;
  const abrir = (n) => {
    const destino = destinoDaAcao(n);
    if (!n.lida) ctx.marcarLidas([n.id]);
    onFechar(false);
    if (destino?.externo) window.open(destino.externo, "_blank", "noopener,noreferrer");
    else if (destino?.rota) {
      navigate(destino.rota);
      window.scrollTo(0, 0);
    }
  };
  const corpo = (
    <div
      ref={painel}
      className={`ntf-painel${celular ? " ntf-painel--celular" : ""}`}
      role="dialog"
      aria-modal={celular ? "true" : undefined}
      aria-labelledby="ntf-titulo"
      data-testid="painel-notificacoes"
      style={celular || !pos ? undefined : { top: pos.top, left: pos.left, width: pos.width, "--ntf-seta": `${pos.setaX}px` }}
    >
      {celular && <span className="ntf-alca" aria-hidden="true" />}
      <div className="ntf-cab">
        <h2 id="ntf-titulo" tabIndex={-1}>
          Notificações
        </h2>
        {ctx.naoLidas > 0 && (
          <button type="button" className="ntf-todas" onClick={() => ctx.marcarLidas()}>
            <Icon name="check-check" size={16} />
            Marcar todas como lidas
          </button>
        )}
        <button type="button" className="ntf-x" onClick={() => onFechar()} aria-label="Fechar notificações">
          <Icon name="x" size={20} />
        </button>
      </div>
      <ListaNotificacoes ctx={ctx} onAbrir={abrir} />
    </div>
  );
  return createPortal(
    celular ? (
      <>
        <div className="ntf-fundo" onClick={() => onFechar()} aria-hidden="true" />
        {corpo}
      </>
    ) : (
      corpo
    ),
    document.body
  );
}

function ListaNotificacoes({ ctx, onAbrir }) {
  if (!ctx.carregado && ctx.carregando) {
    return (
      <div className="ntf-lista" aria-busy="true">
        <span className="ntf-sr">Carregando notificações…</span>
        {[0, 1, 2].map((k) => (
          <div key={k} className="ntf-esqueleto" aria-hidden="true">
            <span className="ntf-esq-ic" />
            <span className="ntf-esq-linhas">
              <span />
              <span />
              <span />
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (ctx.erro && !ctx.itens.length) {
    return (
      <div className="ntf-lista">
        <div className="ntf-vazio">
          <IconTile name="cloud-off" tone="neutral" size={52} />
          <b>{ctx.erro}</b>
          <Button variant="secondary" size="sm" onClick={() => ctx.recarregar()}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }
  if (!ctx.itens.length) {
    return (
      <div className="ntf-lista">
        <div className="ntf-vazio" data-testid="notificacoes-vazio">
          <IconTile name="bell" tone="neutral" size={52} />
          <b>Nenhuma notificação por enquanto</b>
          <span>Avisos do seu plano, do contrato e da equipe StaziaMed aparecem aqui.</span>
        </div>
      </div>
    );
  }
  return (
    <ul className="ntf-lista" aria-label="Lista de notificações">
      {ctx.itens.map((n) => (
        <li key={n.id}>
          <NotificacaoItem n={n} onAbrir={() => onAbrir(n)} onLida={() => ctx.marcarLidas([n.id])} />
        </li>
      ))}
    </ul>
  );
}

/** Uma notificação (também usada na prévia do comunicado na Administração, com agora fixo e sem cliques). */
export function NotificacaoItem({ n, onAbrir, onLida, agora }) {
  const [icone, tom] = arteDoTipo(n.tipo);
  return (
    <article className={`ntf-item${n.lida ? "" : " is-nova"}`} aria-label={`${n.lida ? "" : "Não lida: "}${n.titulo}`}>
      <IconTile name={icone} tone={tom} size={40} />
      <div className="ntf-corpo">
        <div className="ntf-linha">
          <h3>{n.titulo}</h3>
          {!n.lida && <span className="ntf-ponto" aria-hidden="true" />}
        </div>
        <p>{n.texto}</p>
        <div className="ntf-rodape">
          <time dateTime={n.em} title={dataCompleta(n.em)}>
            {tempoRelativo(n.em, agora)}
          </time>
          <span className="ntf-acoes">
            {!n.lida && onLida && (n.acao ? null : (
              <button type="button" className="ntf-marcar" onClick={onLida}>
                Marcar como lida
              </button>
            ))}
            {n.acao && (
              <Button size="sm" variant={n.lida ? "secondary" : "primary"} iconRight={n.rota === "link" && /^https:/.test(n.link ?? "") ? "external-link" : "arrow-right"} onClick={onAbrir}>
                {n.acao}
              </Button>
            )}
          </span>
        </div>
      </div>
    </article>
  );
}
