// Parte pesada das comemorações (baixada só na primeira): o hook de regras (useCelebracoes: 1 grande por dia, intervalo
// dos pequenos, erro no máximo a cada 3 min, fila curta), o componente do Stazi (cenários, figurinos, frases) e os sons
// aprovados pelo dono (efeitos do Veo e livres, hee hee, falas curtas da Durona). Os sons só tocam depois de um gesto do
// aluno, no volume baixo do motor, e só os arquivos da comemoração da vez são baixados.
import React from "react";
import { useSession } from "../../session.jsx";
import { CelebracaoStazi } from "../../../../motion-studio/celebracoes/CelebracaoStazi";
import { armazenamentoLocal, useCelebracoes } from "../../../../motion-studio/celebracoes/useCelebracoes";
import { lyriaSoundUrls, somPorEvento, vozPorEvento, vozSoundUrls } from "../../../../motion-studio/sound";
import { textoCompartilhar } from "./eventos.js";
import { CHAVE_MUDO, chaveEstado } from "./memoria.js";
import "./celebracoes.css";

/** Sons: efeitos aprovados (veo/, efeitos/, dono/), falas liberadas (até 1,5 s) e o mudo compartilhado com Conta → Comemorações. */
const SOM = Object.freeze({ urls: lyriaSoundUrls, porEvento: somPorEvento, vozes: vozSoundUrls, vozPorEvento, storageKey: CHAVE_MUDO });
const VOZ_DURONA = Object.freeze({ estilo: "durona", duronaNivel: "moderada" });
const VOZ_DESLIGADA = Object.freeze({ estilo: "desligada" });
/** Sem resposta das preferências da Arena em 2 s: segue com o padrão (mostrar sequência). */
const PRAZO_PREFERENCIAS_MS = 2000;

async function compartilhar(texto) {
  try {
    if (navigator.share) {
      await navigator.share({ text: texto });
      return null;
    }
    await navigator.clipboard.writeText(texto);
    return "Texto copiado. É só colar onde quiser compartilhar.";
  } catch {
    return null; // a pessoa desistiu de compartilhar
  }
}

export default function CelebracoesMotor({ lotes, onConsumir, contexto = "normal", preferencias, uid }) {
  const { backend } = useSession();
  // gamification_preferences.show_streak (Conta → Minha Stazia Arena → Mostrar sequência): desligado, a sequência não é comemorada
  const [mostrarSequencia, setMostrarSequencia] = React.useState(null);
  React.useEffect(() => {
    let vivo = true;
    const prazo = setTimeout(() => vivo && setMostrarSequencia((v) => v ?? true), PRAZO_PREFERENCIAS_MS);
    Promise.resolve()
      .then(() => backend?.rpc?.("app_gamification_preferences"))
      .then((p) => vivo && setMostrarSequencia(p?.show_streak !== false))
      .catch(() => vivo && setMostrarSequencia(true));
    return () => {
      vivo = false;
      clearTimeout(prazo);
    };
  }, [backend]);

  const armazenamento = React.useMemo(() => armazenamentoLocal(chaveEstado(uid)), [uid]);
  const regras = React.useMemo(
    () => ({ show_streak: mostrarSequencia !== false, modo: preferencias?.reduzidas ? "reduzidas" : "normal", voz: preferencias?.voz === false ? VOZ_DESLIGADA : VOZ_DURONA }),
    [mostrarSequencia, preferencias?.reduzidas, preferencias?.voz]
  );
  const cel = useCelebracoes({ preferencias: regras, contexto, armazenamento });
  const disparar = React.useRef(cel.disparar);
  disparar.current = cel.disparar;

  // cada lote entra uma vez só (mesmo se o efeito rodar de novo antes de o provedor tirar o lote da lista)
  const ultimoLote = React.useRef(0);
  React.useEffect(() => {
    if (mostrarSequencia === null || !lotes?.length) return;
    for (const l of lotes) {
      if (l.seq <= ultimoLote.current) continue;
      ultimoLote.current = l.seq;
      disparar.current(l.eventos.map(({ id, dados, complemento }) => ({ id, dados, ...(complemento ? { complemento } : {}) })));
    }
    onConsumir(lotes[lotes.length - 1].seq);
  }, [lotes, mostrarSequencia, onConsumir]);

  // Esc fecha na hora (com o foco dentro da comemoração, o próprio componente já fecha: não fechar duas vezes)
  const atual = cel.atual;
  const fechar = cel.fechar;
  React.useEffect(() => {
    if (!atual) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.target?.closest?.(".cz")) return;
      fechar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [atual, fechar]);

  const [aviso, setAviso] = React.useState("");
  const props = cel.propsDoAtual();
  if (!props || !atual) return <span className="cel-app-sr" aria-live="polite">{aviso}</span>;
  const texto = textoCompartilhar({ id: atual.evento.id, dados: atual.evento.dados, complemento: atual.evento.complemento });
  return (
    <div className="cel-app" data-testid="celebracao-app">
      <CelebracaoStazi
        key={`${atual.def.id}:${atual.seed}`}
        {...props}
        sound={SOM}
        fechavel
        onCompartilhar={texto ? () => void compartilhar(texto).then((m) => m && setAviso(m)) : undefined}
      />
      <span className="cel-app-sr" aria-live="polite">{aviso}</span>
    </div>
  );
}
