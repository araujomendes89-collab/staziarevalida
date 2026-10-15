// Cartão de um Grande Tema (Temas Essenciais), no padrão aprovado pelo dono em 15/10/2026: cartão branco arejado, faixa fina na
// cor do tema, selo da situação, pílula de questões, título grande, ilustração de vidro à direita, progresso da aula (só com
// dado real) e as ações. Comportamento igual ao de antes: "Abrir a aula" só com aula publicada, "Treinar este tema" só com
// questão ligada, "Me teste" abre o Tutor. Favoritar tema não existe (pendência em docs/temas-card.md).
import React from "react";
import { Icon } from "../../ds";
import { TutorButton } from "../tutor/TutorDrawer.jsx";
import { temaVars } from "./temaCores.js";
import { IlustracaoTema } from "./ilustracoes/IlustracaoTema.jsx";
import { motivoDesenhado } from "./ilustracoes/mapa.js";

/** Situação do conteúdo de cada tema (o que o aluno pode esperar encontrar). */
export const STATUS = {
  aula_pronta_aguardando_revisao: { label: "Aula pronta, aguardando revisão médica", tone: "info", icon: "clock" },
  roteiro_em_validacao: { label: "Roteiro em validação", tone: "neutral", icon: "clock" },
};
const AULA_DISPONIVEL = { label: "Aula disponível", tone: "success", icon: "check" };

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Triângulo cheio do "play" (o ícone da biblioteca é só contorno). */
const Play = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
  </svg>
);

/**
 * `aula`: o tema tem aula publicada; `progresso`: % de seções estudadas (só quando a aula já foi lida do banco nesta visita);
 * `starting`: o treino deste tema está abrindo.
 */
/**
 * Foto do tema (opcional, ainda não vem do banco; contrato em docs/temas-card-fotos.md): `t.foto = { webp, avif?, foco? }`.
 * O banco só deve mandar foto APROVADA; o cartão usa a foto com carregamento preguiçoso e, se ela falhar, volta ao desenho.
 */
function fotoDoTema(t) {
  const f = t?.foto;
  if (!f || typeof f !== "object") return null;
  const ok = (u) => typeof u === "string" && /^(https:\/\/|\/)/.test(u);
  return ok(f.webp) ? { webp: f.webp, avif: ok(f.avif) ? f.avif : null, foco: Number.isFinite(f.foco) ? Math.max(0, Math.min(100, f.foco)) : 72 } : null;
}

export function TemaCartao({ t, aula, progresso, starting, onAbrir, onTreinar }) {
  const exams = Object.keys(t.by_exam ?? {}).length;
  const status = aula ? AULA_DISPONIVEL : STATUS[t.status] ?? STATUS.roteiro_em_validacao;
  const treina = t.total > 0;
  const contagem = t.total > 0 ? `${plural(t.total, "questão", "questões")} · ${plural(exams, "prova", "provas")}` : "0 questões";
  const temProgresso = aula && Number.isFinite(progresso);
  const pct = temProgresso ? Math.max(0, Math.min(100, Math.round(progresso))) : 0;
  const titulo = `gt-tema-${t.order}`;
  const motivo = motivoDesenhado(t.id);
  const foto = fotoDoTema(t);
  const [fotoFalhou, setFotoFalhou] = React.useState(false);
  const comFoto = foto && !fotoFalhou;

  const treinar = (
    <button
      type="button"
      className={aula ? "gt-btn gt-btn--sec" : "gt-btn gt-btn--pri"}
      onClick={onTreinar}
      disabled={starting}
      aria-busy={starting || undefined}
    >
      {aula ? (
        <span className="gt-btn-ic gt-btn-ic--suave" aria-hidden="true">{starting ? <span className="sm-spin" /> : <Icon name="chart-no-axes-column" size={20} />}</span>
      ) : (
        <span className="gt-btn-ic gt-btn-ic--anel" aria-hidden="true">{starting ? <span className="sm-spin" /> : <Play />}</span>
      )}
      <span className="gt-btn-txt">Treinar <span>este tema</span></span>
      <Icon name="chevron-right" size={20} className="gt-btn-seta" />
    </button>
  );

  return (
    <article className={`gt-card${aula ? " tem-aula" : ""}${comFoto ? " com-foto" : ""}`} style={temaVars(t.id, t.area)} aria-labelledby={titulo} data-motivo={motivo}>
      {comFoto ? (
        <div className="gt-foto" aria-hidden="true">
          <picture>
            {foto.avif && <source type="image/avif" srcSet={foto.avif} />}
            <img src={foto.webp} alt="" loading="lazy" decoding="async" draggable="false" style={{ objectPosition: `${foto.foco}% 50%` }} onError={() => setFotoFalhou(true)} />
          </picture>
        </div>
      ) : (
        <>
          <div className="gt-fundo" aria-hidden="true" />
          <div className="gt-ilus" aria-hidden="true">
            <IlustracaoTema motivo={motivo} area={t.area} />
          </div>
        </>
      )}
      <div className="gt-topo">
        <span className={`gt-selo is-${status.tone}`}>
          <span className="gt-selo-ic" aria-hidden="true"><Icon name={status.icon} size={13} /></span>
          {status.label}
        </span>
        {treina ? (
          <button type="button" className="gt-pilula" onClick={onTreinar} disabled={starting} aria-label={`${contagem}: responder as questões deste tema`}>
            <Icon name="file-search" size={17} />
            <span>{contagem}</span>
            <Icon name="chevron-right" size={16} />
          </button>
        ) : (
          <span className="gt-pilula is-vazia">
            <Icon name="file-search" size={17} />
            <span>{contagem}</span>
          </span>
        )}
      </div>
      <div className="gt-texto">
        <h3 className="gt-titulo" id={titulo}>{t.title}</h3>
        <p className="gt-meta">
          Tema {t.order}
          {t.subarea ? ` · ${t.subarea}` : t.area_name ? ` · ${t.area_name}` : ""}
        </p>
      </div>
      {!treina && <p className="gt-aviso">Ainda não há questão oficial catalogada ligada a este tema.</p>}
      {temProgresso && (
        <div className="gt-prog">
          <span className="gt-prog-rot" id={`${titulo}-prog`}>Progresso da aula</span>
          <div className="gt-prog-linha">
            <div className="gt-prog-barra" role="progressbar" aria-labelledby={`${titulo}-prog`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${pct}% concluído`}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="gt-prog-pct"><b>{pct}%</b> concluído</span>
          </div>
        </div>
      )}
      <div className={`gt-acoes${aula ? " com-aula" : treina ? " so-treino" : " so-teste"}`}>
        {aula && (
          <button type="button" className="gt-btn gt-btn--pri" onClick={onAbrir}>
            <span className="gt-btn-ic gt-btn-ic--anel" aria-hidden="true"><Play /></span>
            <span className="gt-btn-txt">Abrir a aula</span>
            <Icon name="chevron-right" size={20} className="gt-btn-seta" />
          </button>
        )}
        {treina && treinar}
        <div className="gt-teste">
          <TutorButton
            request={{ mode: "perguntas", topic: t.title, context: { type: "theme", id: t.id, label: t.title, area: t.area_name } }}
            label="Me teste"
            variant="secondary"
            icon="sparkle"
            className="gt-btn gt-btn--ter"
          />
        </div>
      </div>
    </article>
  );
}
