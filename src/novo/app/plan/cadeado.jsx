// Cadeado no app (planos etapa 4). O BANCO decide (013690): quando ele recusa por plano, o erro traz a dica "cadeado:<recurso>" ou
// "amostra:<recurso>". Aqui:
//   - comAvisoDeCadeado(backend): toda chamada ao banco que volta com essa dica avisa a tela (evento), e o erro segue igual para
//     a tela que chamou (nada é escondido e nada trava);
//   - <CadeadoDialog>: a mensagem clara "assine para liberar", com o que ainda sobra da amostra hoje e o botão para a compra;
//   - <AmostraFaixa>: no topo de Questões, Simulados e Flashcards, quanto sobra da amostra hoje (só com os cadeados ligados).
// Com os cadeados desligados (padrão), o banco nunca manda a dica e app_amostra_hoje responde { ligado: false }: nada aparece.
import React from "react";
import { Badge, Banner, Button, Icon, IconTile } from "../../ds";
import { useSession } from "../session.jsx";
import "./planos.css";

import { EVENTO_AMOSTRA, EVENTO_CADEADO } from "./cadeadoEvento.js";
export { EVENTO_AMOSTRA, EVENTO_CADEADO, avisarCadeado, comAvisoDeCadeado } from "./cadeadoEvento.js";

const RECURSO = {
  questoes: { nome: "Questões", unidade: ["resposta", "respostas"] },
  simulados_teoricos: { nome: "Simulados", unidade: ["simulado curto", "simulados curtos"] },
  flashcards: { nome: "Flashcards", unidade: ["cartão", "cartões"] },
};

/** O que sobra da amostra hoje (app_amostra_hoje, 013760). null enquanto carrega ou sem a função (tela igual a hoje). */
export function useAmostraHoje(ativo = true) {
  const { backend } = useSession();
  const [dados, setDados] = React.useState(null);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!ativo || !backend) return undefined;
    let vivo = true;
    Promise.resolve()
      .then(() => backend.rpc("app_amostra_hoje"))
      .then((r) => vivo && setDados(r && typeof r === "object" ? r : null))
      .catch(() => vivo && setDados(null));
    return () => {
      vivo = false;
    };
  }, [backend, ativo, tick]);
  React.useEffect(() => {
    if (!ativo) return undefined;
    const de_novo = () => setTick((n) => n + 1);
    window.addEventListener(EVENTO_CADEADO, de_novo);
    window.addEventListener(EVENTO_AMOSTRA, de_novo);
    window.addEventListener("focus", de_novo);
    return () => {
      window.removeEventListener(EVENTO_CADEADO, de_novo);
      window.removeEventListener(EVENTO_AMOSTRA, de_novo);
      window.removeEventListener("focus", de_novo);
    };
  }, [ativo]);
  return dados;
}

const quanto = (n, [um, varios]) => `${n} ${n === 1 ? um : varios}`;

/** Planos que liberam o recurso: à venda primeiro; "em breve" só como selo. */
function Ofertas({ ofertas }) {
  const lista = (Array.isArray(ofertas) ? ofertas : []).filter((o) => o?.tipo === "assinar");
  if (!lista.length) return null;
  return (
    <div className="cdz-ofertas" aria-label="Planos que liberam">
      {lista.map((o) => (
        <Badge key={o.plano} tone={o.a_venda ? "pro" : "neutral"} size="sm">
          {o.nome}
          {o.a_venda ? "" : " · em breve"}
        </Badge>
      ))}
    </div>
  );
}

/** Faixa no topo de Questões / Simulados / Flashcards: só com os cadeados ligados e o recurso em amostra ou trancado. */
export function AmostraFaixa({ recurso, go }) {
  const dados = useAmostraHoje(Boolean(recurso));
  const r = dados?.ligado ? dados.recursos?.[recurso] : null;
  if (!r || r.acesso === "liberado" || !RECURSO[recurso]) return null;
  const info = RECURSO[recurso];
  const acao = (
    <Button size="sm" icon="sparkles" onClick={() => go("planos")}>
      Assinar para liberar
    </Button>
  );
  if (r.acesso === "trancado") {
    return (
      <div data-testid={`amostra-${recurso}`}>
        <Banner tone="warning" icon="lock" title={`${info.nome}: fora do seu acesso`} action={acao}>
          {r.mensagem || "Este recurso faz parte dos planos pagos."} Seus dados e o seu progresso ficam guardados.
        </Banner>
      </div>
    );
  }
  if (r.limite == null) return null;
  const acabou = (r.restam ?? 0) <= 0;
  const extra = recurso === "simulados_teoricos" && dados.simulado_max_questoes ? ` (até ${dados.simulado_max_questoes} questões)` : "";
  return (
    <div data-testid={`amostra-${recurso}`}>
      <Banner
        tone={acabou ? "warning" : "brand"}
        icon={acabou ? "lock" : "gift"}
        title={acabou ? "A amostra de hoje acabou" : `Amostra de hoje: ${quanto(r.restam, info.unidade)} de ${r.limite}${extra}`}
        action={acao}
      >
        {acabou
          ? `Você usou ${quanto(r.limite, info.unidade)} hoje. Amanhã tem mais, ou assine para liberar sem limite.`
          : dados.perfil === "teste"
            ? "No teste grátis você usa uma amostra por dia. Assine para liberar tudo."
            : "Seu teste ou plano terminou: você continua com a amostra do dia. Seus dados ficam guardados."}
      </Banner>
    </div>
  );
}

/** A mensagem "assine para liberar", quando o banco recusa por plano. Fica por cima, fecha com "Agora não" ou Esc. */
export function CadeadoDialog({ go }) {
  const [aviso, setAviso] = React.useState(null);
  const dados = useAmostraHoje(Boolean(aviso));
  const botao = React.useRef(null);
  React.useEffect(() => {
    const abrir = (e) => setAviso(e.detail ?? null);
    window.addEventListener(EVENTO_CADEADO, abrir);
    return () => window.removeEventListener(EVENTO_CADEADO, abrir);
  }, []);
  React.useEffect(() => {
    if (!aviso) return undefined;
    botao.current?.focus();
    const esc = (e) => e.key === "Escape" && setAviso(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aviso]);
  if (!aviso) return null;
  const amostra = aviso.tipo === "amostra";
  const r = dados?.ligado ? dados.recursos?.[aviso.recurso] : null;
  const fase2Fechada = /2ª fase ainda não está aberta/i.test(aviso.mensagem);
  const sobras = dados?.ligado
    ? Object.entries(dados.recursos ?? {}).filter(([, x]) => x?.acesso === "amostra" && x.limite != null)
    : [];
  const fechar = () => setAviso(null);
  return (
    <div className="cdz-overlay" role="dialog" aria-modal="true" aria-labelledby="cdz-t" onClick={fechar} data-testid="cadeado-dialogo">
      <div className="cdz-modal" onClick={(e) => e.stopPropagation()}>
        <IconTile name={amostra ? "hourglass" : "lock"} tone={amostra ? "warning" : "pro"} size={56} />
        <h2 id="cdz-t" className="cdz-t">
          {fase2Fechada ? "A 2ª fase ainda não abriu" : amostra ? "A amostra de hoje acabou" : "Assine para liberar"}
        </h2>
        <p className="cdz-p">{aviso.mensagem || "Este recurso faz parte dos planos pagos."}</p>
        {!fase2Fechada && <Ofertas ofertas={r?.ofertas} />}
        {sobras.length > 0 && (
          <ul className="cdz-sobra" aria-label="O que ainda sobra hoje">
            {sobras.map(([k, x]) => (
              <li key={k}>
                <Icon name={x.restam > 0 ? "circle-check" : "circle-minus"} size={16} />
                <span>
                  {RECURSO[k]?.nome ?? k}: {x.restam > 0 ? `restam ${quanto(x.restam, RECURSO[k]?.unidade ?? ["item", "itens"])} hoje` : "a amostra de hoje acabou"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!fase2Fechada && <p className="cdz-dados">Nada do que você fez se perde: seu progresso fica guardado e volta inteiro quando você assinar.</p>}
        <div className="cdz-acoes">
          {!fase2Fechada && (
            <Button
              ref={botao}
              icon="sparkles"
              iconRight="arrow-right"
              fullWidth
              onClick={() => {
                fechar();
                go("planos");
              }}
            >
              Ver planos e assinar
            </Button>
          )}
          <Button variant="secondary" fullWidth onClick={fechar}>
            {fase2Fechada ? "Entendi" : "Agora não"}
          </Button>
        </div>
      </div>
    </div>
  );
}
