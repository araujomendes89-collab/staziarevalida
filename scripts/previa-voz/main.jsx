// Prévia do Voice Tutor (só teste): conversa por voz com o Stazi ou a Stazia sobre uma questão de TESTE (anafilaxia), pelo
// caminho escolhido pelo dono: Gemini Live no VERTEX, pela ponte (a mesma do Cloud Run) e com o cliente de voz do app.
// 17/10/2026: seletor de personagem (Stazi / Stazia) e personalidade (Stazi: Durão, Tranquilo; Stazia: Durona, Tranquila). A voz e a
// afinação vêm do personagem (o servidor de teste decide); no lugar da esfera, o personagem animado do app (PersonagemTutor).
import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { inicial, proximo, estadoVisivel, NOMES } from "./estados.js";
import { criarMotorGemini } from "./motorGemini.js";
import { PersonagemTutor } from "../../src/novo/app/tutor/personagens/PersonagemTutor.jsx";
import { PERSONAGENS } from "../../src/novo/app/tutor/personagens/personagens.js";
import { AudioPlayer } from "../../src/novo/app/tutor/voice/audioPlayer.js";
import "./previa.css";

// para o teste automático conferir que a voz passa pelo afinador (o mesmo módulo que o geminiPonte usa)
window.__AudioPlayer = AudioPlayer;

const PERSONALIDADES = {
  stazi: [["durao", "Durão"], ["acolhedor", "Tranquilo"]],
  stazia: [["durona", "Durona"], ["tranquila", "Tranquila"]],
};
const DURO = new Set(["durao", "durona"]);
const NIVEIS = [["n1", "N1 Direto(a)"], ["n2", "N2 Sarcástico(a)"], ["n3", "N3 Estressado(a) (padrão)"], ["n4", "N4 Explosivo(a)"]];
// estado da conversa da prévia → estado do desenho (as mesmas palavras da esfera do app)
const ESTADO_DESENHO = {
  idle: "idle", connecting: "connecting", listening: "listening", user_speaking: "listening", processing: "thinking", tutor_speaking: "speaking",
  interrupted: "interrupted", reconnecting: "reconnecting", muted: "paused", error: "error", ended: "ended",
};

const mediana = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };

function App() {
  const [estado, despachar] = useReducer(proximo, inicial);
  const [personagem, setPersonagem] = useState("stazi");
  const [personalidade, setPersonalidade] = useState("durao");
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
  const [sessao, setSessao] = useState(null);
  const [fluxos, setFluxos] = useState({ entrada: null, saida: null });
  const [emocao, setEmocao] = useState("neutral");
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
    if (ev.tipo === "sessao") return setSessao(ev);
    if (ev.tipo === "fluxos") return setFluxos({ entrada: ev.entrada, saida: ev.saida });
    if (ev.tipo === "emocao") { anotar(`emoção do personagem: ${ev.valor}`); return setEmocao(ev.valor); }
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

  function trocarPersonagem(id) {
    setPersonagem(id);
    setPersonalidade(PERSONALIDADES[id][0][0]);
    setEmocao("neutral");
  }

  async function iniciar() {
    setFalas([]); setLat([]); setInterr([]); setUso(null); setSessao(null); setEmocao("neutral"); setFluxos({ entrada: null, saida: null });
    despachar({ tipo: "iniciar" });
    inicio.current = Date.now();
    try {
      motorRef.current = criarMotorGemini({ emitir, metrica });
      window.__previaMotor = motorRef.current;
      await motorRef.current.iniciar({ personalidade, nivel, gritos, palavroes, vad });
    } catch (e) {
      emitir({ tipo: "erro", mensagem: String(e.message || e) });
    }
  }

  const vis = estadoVisivel(estado);
  const ativo = !["idle", "ended", "error"].includes(estado.fase);
  const minutos = uso ? Math.max((uso.recebidoEm - inicio.current) / 60000, 1 / 60) : null;
  const p = PERSONAGENS[personagem];
  const nomeProf = PERSONALIDADES[personagem].find(([id]) => id === personalidade)?.[1] ?? "";
  const duro = DURO.has(personalidade);

  return (
    <main>
      <header>
        <h1>Converse com {p.genero === "a" ? "a" : "o"} {p.nome} <small>Prévia do tutor de voz · Gemini Live pelo Vertex · questão de teste (anafilaxia)</small></h1>
      </header>

      <section className="seletor" aria-label="Escolha do professor">
        <div className="personagens" role="radiogroup" aria-label="Personagem">
          {["stazi", "stazia"].map((id) => (
            <button key={id} role="radio" aria-checked={personagem === id} className={`escolha${personagem === id ? " ativa" : ""}`} onClick={() => trocarPersonagem(id)} disabled={ativo}>
              <b>{PERSONAGENS[id].nome}</b><span>{PERSONAGENS[id].descricao}</span>
            </button>
          ))}
        </div>
        <div className="personagens" role="radiogroup" aria-label="Personalidade">
          {PERSONALIDADES[personagem].map(([id, nome]) => (
            <button key={id} role="radio" aria-checked={personalidade === id} className={`escolha${personalidade === id ? " ativa" : ""}`} onClick={() => setPersonalidade(id)} disabled={ativo}>
              <b>{nome}</b><span>{DURO.has(id) ? "cobra, bronca, palavrão" : "calm" + p.genero + ", sem bronca"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="config">
        {duro && (
          <>
            <label>Nível
              <select value={nivel} onChange={(e) => setNivel(e.target.value)} disabled={ativo}>{NIVEIS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
            </label>
            <label className="caixa"><input type="checkbox" checked={gritos} onChange={(e) => setGritos(e.target.checked)} disabled={ativo} /> Gritos</label>
            <label className="caixa"><input type="checkbox" checked={palavroes} onChange={(e) => setPalavroes(e.target.checked)} disabled={ativo} /> Palavrões</label>
          </>
        )}
        <label>Detector de fala
          <select value={vad} onChange={(e) => setVad(e.target.value)} disabled={ativo}>
            <option value="padrao">Padrão do Google</option>
            <option value="rapido">Rápido (silêncio curto)</option>
          </select>
        </label>
        <label>Volume <input type="range" min="0" max="1" step="0.05" value={vol} onChange={(e) => setVol(Number(e.target.value))} /></label>
      </section>

      <section className="palco">
        <PersonagemTutor
          key={personagem}
          personagem={personagem}
          conversationState={ESTADO_DESENHO[vis] ?? "idle"}
          emotion={emocao}
          emotionIntensity={emocao === "neutral" ? 0.3 : 0.75}
          inputStream={fluxos.entrada}
          outputStream={fluxos.saida}
          personality={{ id: personalidade }}
        />
      </section>

      <section className={`estado e-${vis}`} aria-live="polite">
        <span className="bolinha" />
        <strong>{NOMES[vis].replace("Professora", p.nome)}</strong>
        <code>{vis}</code>
        <span className="voz">{nomeProf} · voz {p.voz.gemini}{p.voz.semitons ? ` afinada +${p.voz.semitons}` : ""}</span>
        {estado.erro ? <em>{estado.erro}</em> : null}
      </section>

      <section className="botoes">
        <button onClick={iniciar} disabled={ativo}>Iniciar conversa</button>
        <button onClick={() => atual()?.interromper()} disabled={estado.fase !== "tutor_speaking"}>Interromper</button>
        <button onClick={() => atual()?.silenciar(!estado.mudo)} disabled={!ativo}>{estado.mudo ? "Ligar microfone" : "Silenciar microfone"}</button>
        <button onClick={() => atual()?.encerrar()} disabled={!ativo}>Encerrar</button>
      </section>
      <p className="aviso">Só teste: dados fictícios, sem aluno, sem banco. Permita o microfone, fale normalmente e pode interromper falando por cima. Use fone de ouvido para o som não voltar no microfone.</p>

      <section className="conversa">
        {falas.map((f, i) => <p key={i} className={f.quem}><b>{f.quem === "aluno" ? "Você" : p.nome}:</b> {f.texto}</p>)}
      </section>

      <details>
        <summary>Medidas e eventos ({log.length})</summary>
        <section className="metricas">
          <div><span>1º áudio (último)</span><b>{lat.length ? `${lat.at(-1)} ms` : "—"}</b></div>
          <div><span>1º áudio (mediana, {lat.length})</span><b>{lat.length ? `${mediana(lat)} ms` : "—"}</b></div>
          <div><span>Interrupção até parar</span><b>{interr.length ? `${interr.at(-1)} ms` : "—"}</b></div>
          <div><span>Custo da sessão (tokens do Google)</span><b>{uso ? `US$ ${uso.custo_usd.toFixed(4)}` : "—"}</b></div>
          <div><span>Custo por minuto</span><b>{uso && minutos ? `US$ ${(uso.custo_usd / minutos).toFixed(4)}` : "—"}</b></div>
        </section>
        {sessao && <p className="nota">Sessão: {sessao.perfil} · voz {sessao.voz} · afinação {sessao.semitons} semitons · emoção: {emocao}</p>}
        <ul className="log">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </details>
    </main>
  );
}

createRoot(document.getElementById("raiz")).render(<App />);
