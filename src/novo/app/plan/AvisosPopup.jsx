// Pop-up dos avisos de cobrança (planos etapa 4, app_meus_avisos da 013760): renovação 7/3/1 dia antes, pagamento que não passou,
// acesso pausado e acesso liberado. O mesmo texto vai por e-mail. Aparece ao abrir o app (e ao voltar para a aba) quando há aviso
// não visto; "Entendi" marca como visto (só os próprios: o banco confere). Sem avisos (cobrança desligada), nada aparece.
import React from "react";
import { Button, IconTile } from "../../ds";
import { useSession } from "../session.jsx";
import "./planos.css";

const ARTE = {
  renovacao: ["calendar-clock", "brand"],
  pagamento_falhou: ["circle-alert", "danger"],
  acesso_bloqueado: ["lock", "warning"],
  acesso_liberado: ["circle-check", "success"],
};
const BOTAO = { planos: "Abrir Meu plano", perfil: "Abrir Minha conta", aceite: "Ler e aceitar o contrato" };

export function AvisosPopup({ go, ativo = true }) {
  const { backend } = useSession();
  const [avisos, setAvisos] = React.useState([]);
  const [tick, setTick] = React.useState(0);
  const botao = React.useRef(null);

  React.useEffect(() => {
    if (!ativo || !backend) return undefined;
    let vivo = true;
    Promise.resolve()
      .then(() => backend.rpc("app_meus_avisos"))
      .then((r) => vivo && setAvisos(Array.isArray(r?.novos) ? r.novos : []))
      .catch(() => vivo && setAvisos([]));
    return () => {
      vivo = false;
    };
  }, [backend, ativo, tick]);
  React.useEffect(() => {
    if (!ativo) return undefined;
    const voltou = () => document.visibilityState !== "hidden" && setTick((n) => n + 1);
    document.addEventListener("visibilitychange", voltou);
    return () => document.removeEventListener("visibilitychange", voltou);
  }, [ativo]);
  // Esc fecha por agora (sem marcar como visto): volta na próxima vez que o app abrir
  const [adiado, setAdiado] = React.useState(false);
  React.useEffect(() => {
    if (!avisos.length || adiado) return undefined;
    botao.current?.focus();
    const esc = (e) => e.key === "Escape" && setAdiado(true);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [avisos.length, adiado]);

  if (!avisos.length || adiado) return null;
  const a = avisos[0];
  const [icone, tom] = ARTE[a.tipo] ?? ARTE.renovacao;
  const visto = async (abrir) => {
    setAvisos((lista) => lista.slice(1));
    try {
      await backend.rpc("app_avisos_vistos", { p_ids: [a.id] });
    } catch {
      // aparece de novo na próxima vez; nada se perde
    }
    if (abrir) go(a.rota === "perfil" ? "perfil" : a.rota === "aceite" ? "aceite" : "planos", a.rota === "perfil" ? { secao: "assinatura" } : undefined);
  };
  return (
    <div className="cdz-overlay" role="dialog" aria-modal="true" aria-labelledby="avp-t" data-testid="avisos-popup">
      <div className="cdz-modal">
        <span className="avp-sino">Aviso{avisos.length > 1 ? ` · 1 de ${avisos.length}` : ""}</span>
        <IconTile name={icone} tone={tom} size={56} />
        <h2 id="avp-t" className="cdz-t">
          {a.titulo}
        </h2>
        <p className="cdz-p">{a.texto}</p>
        <div className="cdz-acoes">
          <Button ref={botao} fullWidth iconRight="arrow-right" onClick={() => visto(true)}>
            {BOTAO[a.rota] ?? BOTAO.planos}
          </Button>
          <Button variant="secondary" fullWidth onClick={() => visto(false)}>
            Entendi
          </Button>
        </div>
      </div>
    </div>
  );
}
