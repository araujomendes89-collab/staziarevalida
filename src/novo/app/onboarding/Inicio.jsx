// Peças do onboarding que moram no app: "Primeiros passos" do Início (cada item marcado por AÇÃO REAL, vinda do banco), o convite
// para quem já estudava antes do onboarding existir, a faixa compacta para quem já passou das 10 questões, e as dicas de primeiro
// uso das áreas avançadas (Arena, Simulados, Flashcards, 2ª fase...). Tudo some sem a função do banco (app abre como antes).
import React from "react";
import { Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { AppRealIcon } from "../AppIcons.jsx";
import { primeirosPassos, tourParaRetomar } from "./estado.js";
import { Personagem, personagemDoAluno } from "./Personagem.jsx";
import { dicaDaRota, TOUR } from "./textos.js";
import "./onboarding.css";

/** Relê o retrato do onboarding ao abrir o Início (os Primeiros passos mudam quando o aluno estuda). */
export function useOnboardingAtual() {
  const { backend, boot, setOnboarding } = useSession();
  React.useEffect(() => {
    if (!boot.onboarding) return undefined;
    let vivo = true;
    backend
      .rpc("app_onboarding_estado")
      .then((e) => vivo && setOnboarding(e))
      .catch(() => {});
    return () => {
      vivo = false;
    };
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend]);
  return boot.onboarding;
}

function useAcoes(go) {
  const { backend, setOnboarding } = useSession();
  const [ocupado, setOcupado] = React.useState(false);
  const chamar = async (fn, args) => {
    setOcupado(true);
    try {
      setOnboarding(await backend.rpc(fn, args));
    } catch {
      /* sem conexão: o cartão continua como estava */
    } finally {
      setOcupado(false);
    }
  };
  return {
    ocupado,
    retomarTour: (passo = 0) => {
      go("home");
      return chamar("app_onboarding_tour", { p_status: "em_andamento", p_passo: passo });
    },
    dispensar: (dica) => chamar("app_onboarding_dica_vista", { p_dica: dica }),
  };
}

function LinhaPasso({ passo, go }) {
  return (
    <li>
      <button type="button" className={`ob-pp__item${passo.feito ? " is-feito" : ""}`} onClick={() => go(passo.rota, passo.consulta)}
        aria-label={`${passo.texto}${passo.feito ? ", feito" : ""}`}>
        <span className="ob-pp__marca" aria-hidden="true">{passo.feito ? <Icon name="check" size={13} /> : null}</span>
        <span className="ob-pp__txt">{passo.texto}</span>
        <Icon name="chevron-right" size={18} className="ob-pp__seta" />
      </button>
    </li>
  );
}

/** Cartão "Primeiros passos" do Início do aluno novo. Sem retrato do banco, devolve null (o Início usa a lista antiga). */
export function PrimeirosPassosCartao({ estado, go }) {
  const acoes = useAcoes(go);
  const passos = primeirosPassos(estado);
  if (!estado?.aplicavel || !passos.length) return null;
  const feitos = passos.filter((p) => p.feito).length;
  const tour = estado.tour || {};
  return (
    <section className="ob-pp" aria-label="Primeiros passos">
      <div className="ob-pp__cab">
        <span className="ob-pp__topo">
          <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
            Primeiros passos · {feitos} de {passos.length}
          </span>
          {/* o personagem escolhido pelo aluno acompanha a lista */}
          <span className="ob-pp__pers" aria-hidden="true">
            <Personagem id={personagemDoAluno(estado)} pose={feitos === passos.length ? "comemorando" : "acenando"} altura={64} decorativo animar={false} />
          </span>
        </span>
        <span className="ob-pp__barra" aria-hidden="true"><i style={{ width: `${(feitos / passos.length) * 100}%` }} /></span>
      </div>
      <ul className="ob-pp__lista">
        {passos.map((p) => <LinhaPasso key={p.id} passo={p} go={go} />)}
      </ul>
      {tourParaRetomar(estado) ? (
        <button type="button" className="ob-pp__tour" onClick={() => acoes.retomarTour(tour.status === "pausado" ? tour.passo : 0)} disabled={acoes.ocupado}>
          {AppRealIcon({ name: "route", size: 22 })}
          {tour.status === "pausado" ? `Retomar o tour do painel (passo ${Math.min(tour.passo + 1, TOUR.length)} de ${TOUR.length})` : "Fazer o tour do painel (1 minuto)"}
        </button>
      ) : null}
    </section>
  );
}

/** Faixa compacta (Início de quem já passou das 10 questões) enquanto faltar algum primeiro passo; some com "Ocultar". */
export function PrimeirosPassosFaixa({ estado, go }) {
  const acoes = useAcoes(go);
  const passos = primeirosPassos(estado);
  // só para quem chegou pelo cadastro (a conta antiga tem o convite, e não as duas faixas juntas)
  if (!estado?.aplicavel || estado.convite || estado.origem !== "cadastro" || !passos.length || (estado.dicas_vistas || []).includes("primeiros_passos")) return null;
  const falta = passos.find((p) => !p.feito);
  const tour = tourParaRetomar(estado) && estado.tour?.status === "pausado";
  if (!falta && !tour) return null;
  const feitos = passos.filter((p) => p.feito).length;
  return (
    <section className="ob-faixa" aria-label="Primeiros passos">
      <span className="ob-faixa__ic" aria-hidden="true">{AppRealIcon({ name: "list-checks", size: 24 })}</span>
      <span className="ob-faixa__txt">
        <b>Primeiros passos · {feitos} de {passos.length}</b>
        <span>{falta ? `Próximo: ${falta.texto.toLowerCase()}.` : "Falta terminar o tour do painel."}</span>
      </span>
      <span className="ob-faixa__acoes">
        {falta ? (
          <button type="button" className="ob-btn ob-btn--sec ob-btn--sm" onClick={() => go(falta.rota, falta.consulta)}>
            Fazer agora
          </button>
        ) : (
          <button type="button" className="ob-btn ob-btn--sec ob-btn--sm" onClick={() => acoes.retomarTour(estado.tour.passo)} disabled={acoes.ocupado}>
            Retomar tour
          </button>
        )}
        <button type="button" className="ob-btn ob-btn--link ob-btn--sm" onClick={() => acoes.dispensar("primeiros_passos")} disabled={acoes.ocupado}>
          Ocultar
        </button>
      </span>
    </section>
  );
}

/** Convite para quem já estudava antes do onboarding existir (o servidor decide: estado.convite). */
export function ConviteOnboarding({ estado, go }) {
  const acoes = useAcoes(go);
  if (!estado?.convite) return null;
  const continuar = estado.status === "in_progress";
  return (
    <section className="ob-convite" aria-label="Monte o seu estudo">
      <span className="ob-convite__ic" aria-hidden="true">{AppRealIcon({ name: "sparkles", size: 30 })}</span>
      <span className="ob-convite__txt">
        <b>{continuar ? "Continue a montar o seu estudo" : "Monte o seu estudo em 2 minutos"}</b>
        <span>Data da prova, tempo por dia, áreas difíceis e quem te acompanha no Tutor. O tempo por dia define o tamanho do seu Plano de Hoje.</span>
      </span>
      <span className="ob-convite__acoes">
        <button type="button" className="ob-btn ob-btn--pri ob-btn--sm" onClick={() => go("apresentacao", continuar ? undefined : { inicio: "fase" })}>
          {continuar ? "Continuar" : "Começar"}
        </button>
        <button type="button" className="ob-btn ob-btn--link ob-btn--sm" onClick={() => acoes.dispensar("convite_onboarding")} disabled={acoes.ocupado}>
          Agora não
        </button>
      </span>
    </section>
  );
}

/** Explicação de primeiro uso de uma área avançada (aparece uma vez por aluno; "Entendi" guarda no banco). */
export function DicaPrimeiroUso({ route }) {
  const { boot } = useSession();
  const acoes = useAcoes(() => {});
  const [fechada, setFechada] = React.useState(null);
  const estado = boot.onboarding;
  const achado = dicaDaRota(route);
  if (!estado?.aplicavel || !achado) return null;
  const [id, dica] = achado;
  if ((estado.dicas_vistas || []).includes(id) || fechada === id) return null;
  const entendi = () => {
    setFechada(id);
    acoes.dispensar(id);
  };
  return (
    <aside className="ob-dica1" aria-label={dica.titulo}>
      <span className="ob-dica1__ic" aria-hidden="true">{AppRealIcon({ name: dica.icone, size: 28 })}</span>
      <span className="ob-dica1__txt">
        <b>{dica.titulo}</b>
        <span>{dica.texto}</span>
      </span>
      <button type="button" className="ob-btn ob-btn--sec ob-btn--sm" onClick={entendi}>
        Entendi
      </button>
    </aside>
  );
}
