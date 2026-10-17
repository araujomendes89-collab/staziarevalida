// As 7 perguntas da configuração. Cada uma é um formulário com campos nativos (rádio, caixa, data, hora): teclado e leitor de
// tela funcionam sem truque. Quem salva é Onboarding.jsx (app_onboarding_salvar, um passo por vez); aqui só se monta o pedido.
import React from "react";
import { Badge, Banner, Icon, Switch } from "../../ds";
import { AppRealIcon } from "../AppIcons.jsx";
import { AREAS } from "../practice/format.js";
import { AREA_ART } from "../../ds/area-art/index.js";
import { MINUTES } from "../home/TodayPlan.jsx";
import { Personagem, NOMES } from "./Personagem.jsx";
import { AVISO_LEMBRETES, DIAS, DIAS_PADRAO, JEITOS, JEITOS_TUTOR, NOME_FASE, PASSOS_TEXTO } from "./textos.js";

const hojeISO = () => new Date().toLocaleDateString("en-CA");
const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

/** Cartão de escolha (rádio ou caixa) com o campo nativo dentro: o cartão inteiro é o rótulo. */
function Opcao({ tipo = "radio", nome, valor, marcado, onChange, desligado = false, selo, titulo, texto, arte, className = "" }) {
  return (
    <label className={`ob-opc${marcado ? " is-on" : ""}${desligado ? " is-off" : ""} ${className}`.trim()}>
      <input type={tipo} name={nome} value={valor} checked={marcado} disabled={desligado} onChange={onChange} className="ob-opc__in" />
      {arte ? <span className="ob-opc__arte" aria-hidden="true">{arte}</span> : null}
      <span className="ob-opc__txt">
        <b>
          {titulo}
          {selo ? <Badge tone="neutral">{selo}</Badge> : null}
        </b>
        {texto ? <span>{texto}</span> : null}
      </span>
      <span className="ob-opc__marca" aria-hidden="true">
        <Icon name="check" size={14} />
      </span>
    </label>
  );
}

function Grupo({ legenda, children, className = "" }) {
  return (
    <fieldset className={`ob-grupo ${className}`.trim()}>
      <legend className="ob-sr">{legenda}</legend>
      {children}
    </fieldset>
  );
}

// ---------------------------------------------------------------- 1. fase (a pergunta muda conforme o acesso decidido no servidor)
export function PassoFase({ estado, valor, setValor }) {
  const a = estado.acesso || {};
  const fase2 = Boolean(a.fase2_aberta);
  const fimTeste = a.teste_fim ? dataBR(a.teste_fim) : null;
  const modo = a.modo_fase;

  if (modo === "escolher_teste") {
    const opcoes = [
      ["teoria", "Prova objetiva. É a fase que o StaziaMed já oferece completa."],
      ["pratica", "Estações, checklists e treino em dupla."],
      ["as_duas", "Você testa as duas fases juntas."],
    ];
    return (
      <>
        {fimTeste ? <p className="ob-nota"><Icon name="calendar" size={16} /> O seu teste grátis vai até {fimTeste}.</p> : null}
        <Grupo legenda={PASSOS_TEXTO.fase.titulo} className="ob-lista">
          {opcoes.map(([id, texto]) => {
            const fechada = id !== "teoria" && !fase2;
            return (
              <Opcao key={id} nome="fase" valor={id} marcado={valor.escolha === id} desligado={fechada} selo={fechada ? "Em breve" : null}
                onChange={() => setValor({ escolha: id })} titulo={NOME_FASE[id]} texto={texto} />
            );
          })}
        </Grupo>
        <p className="ob-nota">
          <Icon name="info" size={16} />
          {fase2
            ? "Só existe um teste grátis por conta: depois de escolher, a outra fase só assinando."
            : "A 2ª fase (prova prática) ainda não está aberta aos alunos. Quando abrir, ela aparece aqui."}
        </p>
      </>
    );
  }
  if (modo === "elite") {
    return (
      <>
        <p className="ob-sub">O seu plano ELITE tem as duas fases. Por onde você quer começar?</p>
        <Grupo legenda="Por onde começar" className="ob-lista">
          <Opcao nome="prio" valor="teoria" marcado={valor.prioridade === "teoria"} onChange={() => setValor({ prioridade: "teoria" })} titulo={NOME_FASE.teoria} texto="Questões, simulados, flashcards e teoria." />
          <Opcao nome="prio" valor="pratica" marcado={valor.prioridade === "pratica"} desligado={!fase2} selo={!fase2 ? "Em breve" : null}
            onChange={() => setValor({ prioridade: "pratica" })} titulo={NOME_FASE.pratica} texto="Estações, checklists e treino em dupla." />
        </Grupo>
      </>
    );
  }
  // fase já sabida (PRO, PRÁTICA, teste já escolhido), convite ou equipe: só informa
  const info = {
    pro: ["Seu plano PRO", NOME_FASE.teoria, "Tudo da prova objetiva: questões, simulados, flashcards e teoria."],
    pratica: ["Seu plano PRÁTICA", NOME_FASE.pratica, fase2 ? "Estações, checklists, simulados práticos e treino em dupla." : "A 2ª fase abre aos alunos em breve. Enquanto isso, você já pode configurar o seu estudo."],
    teste_definido: ["Seu teste grátis", NOME_FASE[a.teste_escolha] ?? NOME_FASE.teoria, fimTeste ? `Vale até ${fimTeste}. Só existe um teste por conta.` : "Só existe um teste por conta."],
    equipe: ["Equipe StaziaMed", "Acesso completo", "Você está vendo o que o aluno vê. Nada aqui muda o seu acesso."],
  }[modo];
  if (modo === "convite") {
    const teste = a.teoria !== "vencida" ? null : true;
    return (
      <Banner tone="warning" icon="clock" title={teste ? "Seu teste ou plano terminou" : "Você está sem um plano ativo"}>
        Você continua com a amostra do dia, e as suas preferências e o seu progresso ficam guardados. Para voltar a ter tudo, veja os planos em Conta, Meu plano.
      </Banner>
    );
  }
  return (
    <div className="ob-info">
      <span className="ob-info__ic" aria-hidden="true">{AppRealIcon({ name: modo === "pratica" ? "clipboard-list" : modo === "equipe" ? "users" : "crown", size: 30 })}</span>
      <span>
        <small>{info?.[0]}</small>
        <b>{info?.[1]}</b>
        <span>{info?.[2]}</span>
      </span>
    </div>
  );
}
export const faseValida = (estado, v) => {
  const m = estado.acesso?.modo_fase;
  if (m === "escolher_teste") return Boolean(v.escolha);
  if (m === "elite") return Boolean(v.prioridade);
  return true;
};
export const faseInicial = (estado) => {
  const p = estado.preferencias || {};
  const m = estado.acesso?.modo_fase;
  if (m === "elite") return { prioridade: p.prioridade_fase || "teoria" };
  if (m === "escolher_teste") return { escolha: p.fase_escolhida && (p.fase_escolhida === "teoria" || estado.acesso?.fase2_aberta) ? p.fase_escolhida : "teoria" };
  return {};
};

// ---------------------------------------------------------------- 2. data da prova
export function PassoProva({ valor, setValor }) {
  const hoje = hojeISO();
  return (
    <div className="ob-campos">
      <label className="ob-campo" htmlFor="ob-data">
        <span>Data da prova</span>
        <input id="ob-data" type="date" min={hoje} value={valor.semData ? "" : valor.data || ""} disabled={valor.semData}
          onChange={(e) => setValor({ ...valor, data: e.target.value })} aria-describedby="ob-data-dica" />
      </label>
      <span id="ob-data-dica" className="ob-dica">Se ainda não tem a data, marque abaixo. Dá para colocar depois em Personalizar plano.</span>
      <label className="ob-check">
        <input type="checkbox" checked={Boolean(valor.semData)} onChange={(e) => setValor({ ...valor, semData: e.target.checked })} />
        <span>Ainda não sei a data da prova</span>
      </label>
    </div>
  );
}
export const provaValida = (v) => v.semData || (v.data && v.data >= hojeISO());
export const provaErro = (v) => (!v.semData && v.data && v.data < hojeISO() ? "A data da prova precisa ser hoje ou depois." : null);

// ---------------------------------------------------------------- 3. rotina: tempo por dia (as 9 opções do Personalizar plano) e dias
export function PassoRotina({ valor, setValor }) {
  const dias = valor.dias || [];
  const alternar = (d) => setValor({ ...valor, dias: dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d] });
  return (
    <>
      <fieldset className="ob-grupo">
        <legend className="ob-leg">Tempo de estudo por dia</legend>
        <div className="ob-tempos">
          {MINUTES.map(([v, l, d]) => (
            <label key={v} className={`ob-tempo${valor.minutos === Number(v) ? " is-on" : ""}`}>
              <input type="radio" name="tempo" value={v} checked={valor.minutos === Number(v)} onChange={() => setValor({ ...valor, minutos: Number(v) })} className="ob-opc__in" />
              <b>{l}</b>
              <small>{d}</small>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="ob-grupo">
        <legend className="ob-leg">Dias em que você estuda</legend>
        <div className="ob-dias">
          {DIAS.map(([d, curto, longo]) => (
            <label key={d} className={`ob-dia${dias.includes(d) ? " is-on" : ""}`}>
              <input type="checkbox" checked={dias.includes(d)} onChange={() => alternar(d)} className="ob-opc__in" aria-label={longo} />
              <span aria-hidden="true">{curto}</span>
            </label>
          ))}
        </div>
        <span className="ob-dica" aria-live="polite">
          {dias.length === 0 ? "Escolha pelo menos um dia." : `${dias.length} ${dias.length === 1 ? "dia" : "dias"} por semana.`}
        </span>
      </fieldset>
    </>
  );
}
export const rotinaValida = (v) => Boolean(v.minutos) && (v.dias || []).length > 0;
export const rotinaInicial = (estado) => {
  const p = estado.preferencias || {};
  const opcao = MINUTES.find(([v]) => Number(v) >= (p.daily_minutes ?? 60));
  return { minutos: Number(opcao?.[0] ?? 300), dias: Array.isArray(p.dias_semana) && p.dias_semana.length ? p.dias_semana : DIAS_PADRAO };
};

// ---------------------------------------------------------------- 4. áreas de dificuldade
export function PassoDificuldades({ valor, setValor }) {
  const areas = valor.areas || [];
  const alternar = (id) => setValor({ areas: areas.includes(id) ? areas.filter((x) => x !== id) : [...areas, id], nenhuma: false });
  return (
    <>
      <Grupo legenda={PASSOS_TEXTO.dificuldades.titulo} className="ob-areas">
        {AREAS.map((a) => (
          <Opcao key={a.id} tipo="checkbox" nome="areas" valor={a.id} marcado={areas.includes(a.id)} onChange={() => alternar(a.id)} titulo={a.label}
            className="ob-opc--area" arte={AREA_ART[a.id] ? <img src={AREA_ART[a.id].src} alt="" width="40" height="40" /> : null} />
        ))}
      </Grupo>
      <label className="ob-check">
        <input type="checkbox" checked={Boolean(valor.nenhuma)} onChange={(e) => setValor({ areas: e.target.checked ? [] : areas, nenhuma: e.target.checked })} />
        <span>Nenhuma em especial / ainda não sei</span>
      </label>
    </>
  );
}
export const dificuldadesValida = (v) => (v.areas || []).length > 0 || Boolean(v.nenhuma);
export const dificuldadesInicial = (estado) => {
  const a = estado.preferencias?.areas_dificeis;
  return { areas: Array.isArray(a) ? a : [], nenhuma: Array.isArray(a) && a.length === 0 };
};

// ---------------------------------------------------------------- 5. jeito de estudar
export function PassoJeito({ valor, setValor }) {
  return (
    <Grupo legenda={PASSOS_TEXTO.jeito.titulo} className="ob-jeitos">
      {JEITOS.map((j) => (
        <Opcao key={j.id} nome="jeito" valor={j.id} marcado={valor.jeito === j.id} onChange={() => setValor({ jeito: j.id })} titulo={j.titulo} texto={j.texto}
          arte={AppRealIcon({ name: j.icone, size: 30 })} />
      ))}
    </Grupo>
  );
}

// ---------------------------------------------------------------- 6. personagem e personalidade do Tutor
const PERSONAGEM_DA_PERSONALIDADE = { acolhedor: "stazi", durao: "stazi", tranquila: "stazia", durona: "stazia" };
export function PassoTutor({ valor, setValor, mobile }) {
  const escolher = (id) => setValor({ personagem: id, personalidade: valor.personagem === id ? valor.personalidade : JEITOS_TUTOR[id][0].id });
  return (
    <>
      <Grupo legenda="Personagem do Tutor" className="ob-pers">
        {["stazi", "stazia"].map((id) => (
          <label key={id} className={`ob-per${valor.personagem === id ? " is-on" : ""}`}>
            <input type="radio" name="personagem" value={id} checked={valor.personagem === id} onChange={() => escolher(id)} className="ob-opc__in" />
            <span className="ob-per__palco" aria-hidden="true">
              <Personagem id={id} pose="acenando" altura={mobile ? 128 : 176} decorativo animar={false} />
            </span>
            <b>{NOMES[id]}</b>
            <small>{id === "stazi" ? "seu professor" : "sua professora"}</small>
            <span className="ob-opc__marca" aria-hidden="true"><Icon name="check" size={14} /></span>
          </label>
        ))}
      </Grupo>
      {valor.personagem ? (
        <fieldset className="ob-grupo">
          <legend className="ob-leg">E o jeito {valor.personagem === "stazi" ? "do Stazi" : "da Stazia"}?</legend>
          <div className="ob-lista ob-lista--2">
            {JEITOS_TUTOR[valor.personagem].map((j) => (
              <Opcao key={j.id} nome="personalidade" valor={j.id} marcado={valor.personalidade === j.id} onChange={() => setValor({ ...valor, personalidade: j.id })} titulo={j.nome} texto={j.texto} />
            ))}
          </div>
        </fieldset>
      ) : null}
    </>
  );
}
export const tutorValido = (v) => Boolean(v.personagem && v.personalidade && PERSONAGEM_DA_PERSONALIDADE[v.personalidade] === v.personagem);
export const tutorInicial = (estado) => {
  const p = estado.preferencias || {};
  if (p.tutor_personagem && p.tutor_personalidade) return { personagem: p.tutor_personagem, personalidade: p.tutor_personalidade };
  const atual = estado.tutor_atual || {};
  const pers = (atual.personagem === "stazi" || atual.personagem === "stazia" ? atual.personagem : null) ?? PERSONAGEM_DA_PERSONALIDADE[atual.personalidade] ?? "stazi";
  const jeito = PERSONAGEM_DA_PERSONALIDADE[atual.personalidade] === pers ? atual.personalidade : JEITOS_TUTOR[pers][0].id;
  return { personagem: pers, personalidade: jeito };
};

// ---------------------------------------------------------------- 7. lembretes (só a preferência)
export function PassoLembretes({ valor, setValor }) {
  return (
    <div className="ob-campos">
      <div className="ob-switch">
        <Switch label="Quero lembretes para estudar" description="Nos dias que você escolheu." checked={Boolean(valor.quer)} onChange={(e) => setValor({ ...valor, quer: e.target.checked })} />
      </div>
      {valor.quer ? (
        <label className="ob-campo ob-campo--hora" htmlFor="ob-hora">
          <span>Horário</span>
          <input id="ob-hora" type="time" step="900" value={valor.horario || ""} onChange={(e) => setValor({ ...valor, horario: e.target.value })} />
        </label>
      ) : null}
      <p className="ob-nota">
        <Icon name="info" size={16} />
        {AVISO_LEMBRETES}
      </p>
    </div>
  );
}
export const lembretesInicial = (estado) => {
  const p = estado.preferencias || {};
  return { quer: Boolean(p.lembretes_quer), horario: p.lembretes_horario || "19:00" };
};
