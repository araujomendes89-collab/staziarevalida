// "Seu plano está pronto": o Plano de Hoje DE VERDADE (app_today refeito com o que o aluno acabou de responder, o mesmo do
// "Personalizar plano"), mais o resumo das respostas. Não existe planejamento paralelo: o que aparece aqui é o que o Início mostra.
import React from "react";
import { Banner, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { AppRealIcon } from "../AppIcons.jsx";
import { areaLabel } from "../practice/format.js";
import { KIND_LABEL, reasonText } from "../home/plan.js";
import { TaskIcon, taskTile } from "../home/parts.jsx";
import { MINUTES } from "../home/TodayPlan.jsx";
import { DIAS, JEITOS, JEITOS_FIRMES, JEITOS_TUTOR, NOME_FASE } from "./textos.js";
import { NOMES } from "./Personagem.jsx";

const TEMPO = Object.fromEntries(MINUTES.map(([v, l]) => [Number(v), l]));
const diasTexto = (dias) => {
  if (!Array.isArray(dias) || !dias.length) return null;
  if (dias.length === 7) return "todos os dias";
  return DIAS.filter(([d]) => dias.includes(d)).map(([, curto]) => curto.toLowerCase()).join(", ");
};
const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

export function Trilha({ estado, onPronto, tituloRef, erro, setErro }) {
  const { backend } = useSession();
  const [plano, setPlano] = React.useState(null);

  React.useEffect(() => {
    let vivo = true;
    backend
      .rpc("app_today", { p_rebuild: true })
      .then((p) => {
        if (!vivo) return;
        setPlano(p);
        onPronto?.();
      })
      .catch(() => vivo && setErro("Não foi possível montar o plano agora. Você pode seguir e abrir o Plano de Hoje no painel."));
    return () => {
      vivo = false;
    };
    // só ao abrir o passo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend]);

  const p = estado.preferencias || {};
  const jeitoTutor = JEITOS_TUTOR[p.tutor_personagem]?.find((j) => j.id === p.tutor_personalidade)?.nome ?? "";
  const tutor = p.tutor_personagem
    ? `${NOMES[p.tutor_personagem]} · ${jeitoTutor}${JEITOS_FIRMES.includes(p.tutor_personalidade) ? " (confirmado na 1ª conversa)" : ""}`
    : null;
  const resumo = [
    ["target", "Prova", p.exam_date ? `em ${dataBR(p.exam_date)}` : "data ainda não definida"],
    ["timer", "Rotina", [p.daily_minutes ? `${TEMPO[p.daily_minutes] ?? `${p.daily_minutes} min`} por dia` : null, diasTexto(p.dias_semana)].filter(Boolean).join(" · ") || "a definir"],
    ["chart-column", "Dificuldade", Array.isArray(p.areas_dificeis) && p.areas_dificeis.length ? p.areas_dificeis.map(areaLabel).join(", ") : "nenhuma em especial"],
    ["route", "Jeito", JEITOS.find((j) => j.id === p.jeito_estudar)?.titulo ?? "a definir"],
    ["sparkles", "Tutor", tutor ?? "a definir"],
    p.fase_escolhida ? ["book-open", "Fase", NOME_FASE[p.fase_escolhida]] : null,
  ].filter(Boolean);

  return (
    <div className="ob-trilha">
      <div className="ob-q__cab">
        <span className="ob-over">Seu plano</span>
        <h1 className="ob-h1" ref={tituloRef} tabIndex={-1}>
          Seu plano de hoje está pronto
        </h1>
        <p className="ob-sub">É o mesmo Plano de Hoje que você vai ver no painel, montado com as suas respostas. Ele se refaz todo dia.</p>
      </div>
      {erro ? <Banner tone="danger">{erro}</Banner> : null}
      <section className="ob-card ob-plano" aria-label="Plano de hoje" aria-busy={!plano && !erro}>
        <h2 className="ob-h2">Hoje</h2>
        {!plano && !erro ? <p className="ob-dica">Montando o seu plano…</p> : null}
        {plano?.tasks?.length === 0 ? <p className="ob-dica">Nada para hoje. Monte um treino livre no Banco de Questões.</p> : null}
        {plano?.tasks?.length ? (
          <ul className="ob-tarefas">
            {plano.tasks.map((t) => (
              <li key={t.id}>
                <span className={`ih-tile ${taskTile(t.kind)}`} aria-hidden="true">
                  <TaskIcon kind={t.kind} size={26} />
                </span>
                <span className="ob-tarefas__t">
                  <b>{t.title}</b>
                  <small>
                    {KIND_LABEL[t.kind]} · {t.minutes} min{reasonText(t) ? ` · ${reasonText(t)}` : ""}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="ob-card ob-resumo" aria-label="Suas respostas">
        <h2 className="ob-h2">Suas respostas</h2>
        <dl>
          {resumo.map(([icone, rotulo, valor]) => (
            <div key={rotulo}>
              <dt>
                <span aria-hidden="true">{AppRealIcon({ name: icone, size: 20 }) || <Icon name={icone} size={16} />}</span>
                {rotulo}
              </dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
