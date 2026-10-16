// Prévia do Voice Tutor (Fase 2, só teste): conversa por voz com a Durona sobre uma questão de TESTE (anafilaxia).
// Motores: Gemini Live pelo Vertex (funciona já) e ElevenLabs Agents (fica pronto quando o dono criar chave e agente).
import { createRoot } from "react-dom/client";
import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { inicial, proximo, estadoVisivel, NOMES } from "./estados.js";
import { criarMotorGemini } from "./motorGemini.js";
import "./previa.css";

const MotorEleven = lazy(() => import("./MotorEleven.jsx"));
const VOZES = ["Kore", "Aoede", "Leda", "Zephyr", "Charon", "Puck"];
const NIVEIS = [["sem_palavrao", "Sem palavrão"], ["moderada", "Moderada"], ["forte", "Forte"], ["sem_filtro", "Explosiva (sem filtro)"]];

const mediana = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };

function App() {
  const [estado, despachar] = useReducer(proximo, inicial);
  const [motor, setMotor] = useState("gemini");
  const [voz, setVoz] = useState("Kore");
  const [nivel, setNivel] = useState("forte");
  const [vad, setVad] = useState("padrao");
  const [vol, setVol] = useState(1);
  const [falas, setFalas] = useState([]);
  const [log, setLog] = useState([]);
  const [lat, setLat] = useState([]);
  const [interr, setInterr] = useState([]);
  const [uso, setUso] = useState(null);
  const [eleven, setEleven] = useState(null);
  const motorRef = useRef(null);
  const elevenRef = useRef(null);
  const inicio = useRef(0);

  const anotar = (texto) => setLog((l) => [`${new Date().toLocaleTimeString("pt-BR")} ${texto}`, ...l].slice(0, 60));

  const emitir = useCallback((ev) => {
    if (!ev) return;
    if (ev.tipo === "transcricao") {
      setFalas((f) => {
        const ult = f.at(-1);
        if (ult && ult.quem === ev.quem) return [...f.slice(0, -1), { ...ult, texto: ult.texto + ev.texto }];
        return [...f, { quem: ev.quem, texto: ev.texto }].slice(-40);
      });
      return;
    }
    if (ev.tipo === "log") return anotar(ev.texto);
    anotar(`evento: ${ev.tipo}${ev.mensagem ? ` (${ev.mensagem})` : ""}${ev.motivo ? ` (${ev.motivo})` : ""}`);
    despachar(ev);
  }, []);

  const metrica = useCallback((m) => {
    if (m.tipo === "primeiro_audio") setLat((x) => [...x, m.ms]);
    else if (m.tipo === "interrupcao") setInterr((x) => [...x, m.ms]);
    else if (m.tipo === "uso") setUso(m);
  }, []);

  useEffect(() => { fetch("/api/voz/eleven/estado").then((r) => r.json()).then(setEleven).catch(() => setEleven({ pronta: false, falta: ["servidor de teste fora do ar"] })); }, []);
  useEffect(() => { motorRef.current?.volume?.(vol); elevenRef.current?.volume?.(vol); }, [vol]);

  const atual = () => (motor === "gemini" ? motorRef.current : elevenRef.current);

  async function iniciar() {
    setFalas([]); setLat([]); setInterr([]); setUso(null);
    despachar({ tipo: "iniciar" });
    inicio.current = Date.now();
    try {
      if (motor === "gemini") {
        motorRef.current = criarMotorGemini({ emitir, metrica });
        await motorRef.current.iniciar({ voz, nivel, vad });
      } else {
        await elevenRef.current.iniciar();
      }
    } catch (e) {
      emitir({ tipo: "erro", mensagem: String(e.message || e) });
    }
  }

  const vis = estadoVisivel(estado);
  const ativo = !["idle", "ended", "error"].includes(estado.fase);
  const minutos = uso ? Math.max(uso.segundos, 1) / 60 : null;

  return (
    <main>
      <header>
        <h1>Prévia do tutor de voz <small>Durona · questão de teste (anafilaxia)</small></h1>
        <p className="aviso">Só teste: dados fictícios, sem aluno, sem banco. Fale no microfone; pode interromper a professora falando por cima.</p>
      </header>

      <section className="config">
        <label>Motor
          <select value={motor} onChange={(e) => setMotor(e.target.value)} disabled={ativo}>
            <option value="gemini">Gemini Live pelo Vertex (principal)</option>
            <option value="eleven" disabled={!eleven?.pronta}>ElevenLabs Agents {eleven?.pronta ? "" : "(falta configurar)"}</option>
          </select>
        </label>
        <label>Voz
          <select value={voz} onChange={(e) => setVoz(e.target.value)} disabled={ativo || motor !== "gemini"}>{VOZES.map((v) => <option key={v}>{v}</option>)}</select>
        </label>
        <label>Nível da Durona
          <select value={nivel} onChange={(e) => setNivel(e.target.value)} disabled={ativo || motor !== "gemini"}>{NIVEIS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
        </label>
        <label>Detector de fala
          <select value={vad} onChange={(e) => setVad(e.target.value)} disabled={ativo || motor !== "gemini"}>
            <option value="padrao">Padrão do Google</option>
            <option value="rapido">Rápido (silêncio curto)</option>
          </select>
        </label>
        <label>Volume <input type="range" min="0" max="1" step="0.05" value={vol} onChange={(e) => setVol(Number(e.target.value))} /></label>
      </section>

      {motor === "eleven" || !eleven?.pronta ? (
        <p className="falta">ElevenLabs: {eleven?.pronta ? "pronta" : `falta ${eleven?.falta?.join("; ") ?? "…"}`}</p>
      ) : null}

      <section className={`estado e-${vis}`} aria-live="polite">
        <span className="bolinha" />
        <strong>{NOMES[vis]}</strong>
        <code>{vis}</code>
        {estado.erro ? <em>{estado.erro}</em> : null}
      </section>

      <section className="botoes">
        <button onClick={iniciar} disabled={ativo}>Iniciar conversa</button>
        <button onClick={() => atual()?.interromper()} disabled={estado.fase !== "tutor_speaking"}>Interromper</button>
        <button onClick={() => atual()?.silenciar(!estado.mudo)} disabled={!ativo}>{estado.mudo ? "Ligar microfone" : "Silenciar microfone"}</button>
        <button onClick={() => atual()?.encerrar()} disabled={!ativo}>Encerrar</button>
      </section>

      <section className="metricas">
        <div><span>1º áudio (último)</span><b>{lat.length ? `${lat.at(-1)} ms` : "—"}</b></div>
        <div><span>1º áudio (mediana, {lat.length})</span><b>{lat.length ? `${mediana(lat)} ms` : "—"}</b></div>
        <div><span>Interrupção até parar</span><b>{interr.length ? `${interr.at(-1)} ms` : "—"}</b></div>
        <div><span>Custo da sessão (tokens do Google)</span><b>{uso ? `US$ ${uso.custo_usd.toFixed(4)}` : "—"}</b></div>
        <div><span>Custo por minuto</span><b>{uso && minutos ? `US$ ${(uso.custo_usd / minutos).toFixed(4)}` : "—"}</b></div>
      </section>
      <p className="nota">1º áudio = do fim da sua fala (medido pelo microfone, 0,6 s de silêncio) até chegar o som da professora; inclui a espera do detector do Google. Interrupção = do começo da sua fala por cima até o servidor avisar e o som parar.</p>

      <section className="conversa">
        {falas.map((f, i) => <p key={i} className={f.quem}><b>{f.quem === "aluno" ? "Você" : "Durona"}:</b> {f.texto}</p>)}
      </section>

      <details>
        <summary>Eventos ({log.length})</summary>
        <ul className="log">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </details>

      {eleven?.pronta ? (
        <Suspense fallback={null}><MotorEleven ref={elevenRef} emitir={emitir} metrica={metrica} /></Suspense>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("raiz")).render(<App />);
