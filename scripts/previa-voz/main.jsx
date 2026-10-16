// Prévia do Voice Tutor (Fase 2, só teste): conversa por voz com a Durona Explosiva sobre uma questão de TESTE (anafilaxia),
// pelo caminho escolhido pelo dono: Gemini Live no VERTEX, pela ponte (a mesma do Cloud Run) e com o cliente de voz do app.
import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { inicial, proximo, estadoVisivel, NOMES } from "./estados.js";
import { criarMotorGemini } from "./motorGemini.js";
import "./previa.css";

const VOZES = ["Kore", "Aoede", "Leda", "Zephyr", "Charon", "Puck"];
const NIVEIS = [["n1", "N1 Direta"], ["n2", "N2 Sarcástica"], ["n3", "N3 Estressada (padrão)"], ["n4", "N4 Explosiva"]];

const mediana = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };

function App() {
  const [estado, despachar] = useReducer(proximo, inicial);
  const [voz, setVoz] = useState("Kore");
  const [nivel, setNivel] = useState("n3");
  const [gritos, setGritos] = useState(true);
  const [palavroes, setPalavroes] = useState(true);
  const [vad, setVad] = useState("padrao");
  const [vol, setVol] = useState(1);
  const [falas, setFalas] = useState([]);
  const [log, setLog] = useState([]);
  const [lat, setLat] = useState([]);
  const [interr, setInterr] = useState([]);
  const [uso, setUso] = useState(null);
  const motorRef = useRef(null);
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
    else if (m.tipo === "uso") setUso({ ...m, recebidoEm: Date.now() });
  }, []);

  useEffect(() => { motorRef.current?.volume?.(vol); }, [vol]);

  const atual = () => motorRef.current;

  async function iniciar() {
    setFalas([]); setLat([]); setInterr([]); setUso(null);
    despachar({ tipo: "iniciar" });
    inicio.current = Date.now();
    try {
      motorRef.current = criarMotorGemini({ emitir, metrica });
      await motorRef.current.iniciar({ voz, nivel, gritos, palavroes, vad });
    } catch (e) {
      emitir({ tipo: "erro", mensagem: String(e.message || e) });
    }
  }

  const vis = estadoVisivel(estado);
  const ativo = !["idle", "ended", "error"].includes(estado.fase);
  // minutos desde o início da conversa até o último relatório de uso (a ponte manda o uso a cada turno)
  const minutos = uso ? Math.max((uso.recebidoEm - inicio.current) / 60000, 1 / 60) : null;

  return (
    <main>
      <header>
        <h1>Prévia do tutor de voz <small>Durona Explosiva · Gemini Live pelo Vertex · questão de teste (anafilaxia)</small></h1>
        <p className="aviso">Só teste: dados fictícios, sem aluno, sem banco. Fale no microfone; pode interromper a professora falando por cima.</p>
      </header>

      <section className="config">
        <label>Voz
          <select value={voz} onChange={(e) => setVoz(e.target.value)} disabled={ativo}>{VOZES.map((v) => <option key={v}>{v}</option>)}</select>
        </label>
        <label>Nível da Durona
          <select value={nivel} onChange={(e) => setNivel(e.target.value)} disabled={ativo}>{NIVEIS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
        </label>
        <label>Detector de fala
          <select value={vad} onChange={(e) => setVad(e.target.value)} disabled={ativo}>
            <option value="padrao">Padrão do Google</option>
            <option value="rapido">Rápido (silêncio curto)</option>
          </select>
        </label>
        <label className="caixa"><input type="checkbox" checked={gritos} onChange={(e) => setGritos(e.target.checked)} disabled={ativo} /> Gritos</label>
        <label className="caixa"><input type="checkbox" checked={palavroes} onChange={(e) => setPalavroes(e.target.checked)} disabled={ativo} /> Palavrões</label>
        <label>Volume <input type="range" min="0" max="1" step="0.05" value={vol} onChange={(e) => setVol(Number(e.target.value))} /></label>
      </section>

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

    </main>
  );
}

createRoot(document.getElementById("raiz")).render(<App />);
