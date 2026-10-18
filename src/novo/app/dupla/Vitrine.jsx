// Vitrine do Treinamento em Dupla: página SÓ de desenvolvimento (rota /novo/vitrine-dupla, fora do build de produção).
// Mostra as cores novas ao lado das cores do app e todos os componentes da estação, nos dois temas
// (o tema alterna pelo botão do topo do app). Todo dado daqui é de EXEMPLO: nenhuma pessoa, nota ou estação de verdade.
// Cores só por variáveis (var(--…)); nenhum valor de cor escrito aqui.
import React from "react";
import {
  Accordion,
  Badge,
  Button,
  Dialog,
  MatchCard,
  PepTable,
  PrintImage,
  PrintItem,
  StatTile,
  StationCard,
  Textarea,
  Timer,
  Toast,
  useToast,
} from "../../ds";
import { AREAS, ROOM_ROLE_LABEL } from "./labels.js";

const box = { border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--surface-card)", padding: "var(--space-4)" };
const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: "var(--space-3)" });

function Section({ title, note, children }) {
  return (
    <section style={{ display: "grid", gap: "var(--space-3)" }}>
      <div>
        <h2 style={{ font: "var(--type-h3)", color: "var(--text-primary)", margin: 0 }}>{title}</h2>
        {note && <p style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", margin: "4px 0 0" }}>{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Swatch({ token, on, label }) {
  return (
    <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
      <div
        style={{
          background: `var(${token})`,
          color: on ? `var(${on})` : "var(--text-primary)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-sm)",
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          font: "var(--type-label)",
        }}
      >
        {label ?? "Aa"}
      </div>
      <code style={{ font: "var(--type-caption)", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>{token}</code>
    </div>
  );
}

function Row({ title, children }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-2)" }}>
      <div style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>{title}</div>
      <div style={grid(96)}>{children}</div>
    </div>
  );
}

function Colors() {
  return (
    <Section
      title="Cores"
      note="As cores novas ficam ao lado das cores que o app já usa. Alterne dia e noite pelo botão do topo do app."
    >
      <div style={{ ...box, display: "grid", gap: "var(--space-4)" }}>
        <Row title="Do app (referência)">
          <Swatch token="--bg-app" />
          <Swatch token="--surface-card" />
          <Swatch token="--surface-sunken" />
          <Swatch token="--border-default" />
          <Swatch token="--text-primary" on="--text-inverse" label="Texto" />
          <Swatch token="--action-primary" on="--action-on-primary" />
          <Swatch token="--success-solid" on="--surface-card" />
          <Swatch token="--warning-solid" on="--text-primary" />
          <Swatch token="--danger-solid" on="--surface-card" />
        </Row>
        {AREAS.map((area) => (
          <Row key={area.code} title={`Área · ${area.card} (a primeira é a cor do app; as outras, novas)`}>
            <Swatch token={`--area-${area.token}`} label="App" />
            <Swatch token={`--area-${area.token}-soft`} on={`--area-${area.token}-ink`} label="soft + ink" />
            <Swatch token={`--area-${area.token}-ink`} on={`--area-${area.token}-soft`} label="ink" />
            <Swatch token={`--area-${area.token}-solid`} on="--surface-card" label="solid" />
          </Row>
        ))}
        <Row title="Papéis na sala (novas)">
          <Swatch token="--role-candidate" on="--surface-card" />
          <Swatch token="--role-candidate-soft" on="--role-candidate-ink" label="soft + ink" />
          <Swatch token="--role-candidate-ink" on="--role-candidate-soft" label="ink" />
          <Swatch token="--role-actor" on="--surface-card" />
          <Swatch token="--role-actor-soft" on="--role-actor-ink" label="soft + ink" />
          <Swatch token="--role-actor-ink" on="--role-actor-soft" label="ink" />
        </Row>
        <Row title="Pontuação do PEP (novas)">
          <Swatch token="--score-full" label="full" on="--surface-card" />
          <Swatch token="--score-partial" label="partial" on="--navy-950" />
          <Swatch token="--score-none" label="none" on="--surface-card" />
          <Swatch token="--score-pending" label="pending" on="--navy-950" />
        </Row>
        <Row title="Azul do impresso do INEP (novas)">
          {[900, 700, 500, 300, 200, 100, 50].map((n) => (
            <Swatch key={n} token={`--inep-blue-${n}`} on={n >= 500 ? "--pep-sheet" : "--inep-blue-900"} label={String(n)} />
          ))}
        </Row>
        <Row title="Folha do PEP (branca nos dois temas, como o papel do INEP)">
          <Swatch token="--pep-sheet" on="--pep-sheet-text" label="Folha" />
          <Swatch token="--pep-sheet-text" on="--pep-sheet" label="Texto" />
        </Row>
      </div>
    </Section>
  );
}

// Exemplo do plano: níveis (adequado / parcial / inadequado) 2,5/1,25/0 · 2,5/—/0 · 5/2,5/0
const PEP_ITEMS = [
  {
    id: "e1",
    number: "1",
    section: "Seção de exemplo",
    text: "Item de exemplo 1",
    tip: "Dica de exemplo",
    criteria: [{ label: "Critério de exemplo", text: "Texto de exemplo." }],
    levels: { correct: 2.5, partial: 1.25, incorrect: 0 },
  },
  { id: "e2", number: "2", text: "Item de exemplo 2 (sem nível parcial)", levels: { correct: 2.5, partial: null, incorrect: 0 } },
  {
    id: "e3",
    number: "3",
    text: "Item de exemplo 3",
    subitems: [
      { id: "e3a", text: "Subitem de exemplo A" },
      { id: "e3b", text: "Subitem de exemplo B" },
    ],
    levels: { correct: 5, partial: 2.5, incorrect: 0 },
  },
];
const PEP_EMPTY = { e1: { grade: null, subitems: [] }, e2: { grade: null, subitems: [] }, e3: { grade: null, subitems: [] } };

// Imagem de exemplo (SVG simples com cores por nome, sem valor hexadecimal)
const SAMPLE_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='white'/><rect x='20' y='20' width='600' height='320' fill='none' stroke='gray' stroke-width='4'/><text x='320' y='190' font-size='32' font-family='sans-serif' text-anchor='middle' fill='gray'>Imagem de exemplo</text></svg>",
)}`;

const EXAMPLE_PERSON = {
  name: "Pessoa de Exemplo 1",
  online: true,
  compat: 50,
  meta: "Instituição de exemplo · Edição de exemplo",
  bio: "Texto de exemplo.",
  facts: [
    { icon: "clock", label: "Ritmo", value: "Exemplo" },
    { icon: "calendar", label: "Dias", value: "—" },
  ],
  reasons: [
    { icon: "check", text: "Motivo de exemplo", strong: true },
    { icon: "minus", text: "Ponto fraco de exemplo", weak: true },
  ],
  tags: ["Tag de exemplo"],
};

function Timers() {
  return (
    <Section title="Cronômetro" note="Só mostra o tempo que recebe (nas telas de verdade, o tempo vem do servidor). Valores de exemplo.">
      <div style={{ ...box, display: "flex", flexWrap: "wrap", gap: "var(--space-6)", alignItems: "center" }}>
        {[
          ["Parado (idle)", 600, "idle"],
          ["Correndo", 600, "running"],
          ["Aviso (120 s ou menos)", 120, "running"],
          ["Perigo (30 s ou menos)", 30, "running"],
          ["Pausado", 300, "paused"],
          ["Tempo esgotado", 0, "expired"],
        ].map(([label, seconds, state]) => (
          <div key={label} style={{ display: "grid", gap: 6, justifyItems: "start" }}>
            <Timer seconds={seconds} state={state} />
            <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{label}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Prints() {
  const [released, setReleased] = React.useState(false);
  return (
    <Section title="Impressos" note="Impresso de exemplo: o avaliador libera ou oculta; o candidato só vê o que foi liberado.">
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        <PrintItem index={1} title="Impresso de exemplo (avaliador)" released={released} canRelease onToggleRelease={() => setReleased((v) => !v)}>
          <PrintImage src={SAMPLE_IMAGE} alt="Imagem de exemplo de um impresso" />
        </PrintItem>
        <PrintItem index={2} title="Impresso de exemplo (candidato, liberado)" released>
          <PrintImage src={SAMPLE_IMAGE} alt="Imagem de exemplo de um impresso liberado" />
        </PrintItem>
        <PrintItem index={3} title="Impresso de exemplo (candidato, não liberado)" released={false} />
      </div>
    </Section>
  );
}

function Stations() {
  return (
    <Section title="Cartão de estação" note="As cinco áreas: com e sem grau de dificuldade, com e sem nota. Graus e porcentagens são de exemplo.">
      <div style={grid(260)}>
        {AREAS.map((area, i) => (
          <StationCard
            key={`${area.code}-sem`}
            areaCode={area.code}
            title={`Estação de Exemplo ${i + 1} (sem nota)`}
            source="Estação inédita"
          />
        ))}
        {AREAS.map((area, i) => (
          <StationCard
            key={`${area.code}-com`}
            areaCode={area.code}
            title={`Estação de Exemplo ${i + 6} (com nota)`}
            difficulty={["facil", "medio", "dificil"][i % 3]}
            source="Revalida 2020 · INEP"
            myScorePct={80}
            averagePct={60.5}
          />
        ))}
      </div>
    </Section>
  );
}

function Match() {
  const [state, setState] = React.useState({ key: 1, command: undefined, last: "—" });
  const swiped = (dir) => setState((s) => ({ ...s, last: dir === "right" ? "Estudar (exemplo)" : "Pular (exemplo)" }));
  const push = (dir) => setState((s) => ({ ...s, command: { dir, n: (s.command?.n ?? 0) + 1 } }));
  return (
    <Section title="Cartão de parceiro" note="Uma pessoa de EXEMPLO. Arraste o cartão ou use os botões; depois traga o cartão de volta.">
      <div style={{ ...box, display: "grid", gap: "var(--space-3)", justifyItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <MatchCard key={state.key} person={EXAMPLE_PERSON} onSwipe={swiped} command={state.command} />
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "center" }}>
          <Button variant="secondary" icon="x" onClick={() => push(-1)}>
            Pular
          </Button>
          <Button icon="check" onClick={() => push(1)}>
            Estudar junto
          </Button>
          <Button variant="ghost" onClick={() => setState({ key: state.key + 1, command: undefined, last: "—" })}>
            Trazer o cartão de volta
          </Button>
        </div>
        <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>Última escolha: {state.last}</span>
      </div>
    </Section>
  );
}

function Pep() {
  const [marks, setMarks] = React.useState(PEP_EMPTY);
  const mark = (id, grade) => setMarks((m) => ({ ...m, [id]: { ...m[id], grade } }));
  const toggle = (id, sub) =>
    setMarks((m) => {
      const list = m[id].subitems;
      return { ...m, [id]: { ...m[id], subitems: list.includes(sub) ? list.filter((s) => s !== sub) : [...list, sub] } };
    });
  return (
    <Section title="Folha do PEP" note="Estação de exemplo do plano. Primeiro editável (clique ou use as setas e Espaço); depois só leitura.">
      <PepTable stationNumber={1} area="Clínica Médica" items={PEP_ITEMS} marks={marks} onMark={mark} onToggleSubitem={toggle} />
      <div style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>Só leitura (sem onMark)</div>
      <PepTable
        stationNumber={1}
        area="Clínica Médica"
        items={PEP_ITEMS}
        marks={{ ...PEP_EMPTY, e1: { grade: "partial", subitems: [] }, e2: { grade: "correct", subitems: [] }, e3: { grade: "incorrect", subitems: ["e3a"] } }}
      />
    </Section>
  );
}

function Feedback() {
  const [open, setOpen] = React.useState(false);
  const [toastNode, showToast] = useToast();
  return (
    <Section title="Janela, avisos, seção e texto" note="Componentes do app que o módulo usa.">
      <div style={{ ...box, display: "grid", gap: "var(--space-4)" }}>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Abrir janela de exemplo
          </Button>
          <Button variant="secondary" onClick={() => showToast("Aviso de exemplo")}>
            Mostrar aviso de exemplo
          </Button>
        </div>
        <Dialog
          open={open}
          title="Janela de exemplo"
          description="Texto de exemplo da janela de confirmação."
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => setOpen(false)}>Confirmar</Button>
            </>
          }
        />
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          <Toast tone="info" title="Aviso de exemplo" message="Informação." />
          <Toast tone="success" title="Aviso de exemplo" message="Sucesso." />
          <Toast tone="warning" title="Aviso de exemplo" message="Atenção." />
          <Toast tone="danger" title="Aviso de exemplo" message="Erro." />
        </div>
        {toastNode}
        <Accordion title="Seção de exemplo" icon="info" defaultOpen>
          <p style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", margin: 0 }}>Conteúdo de exemplo.</p>
        </Accordion>
        <Textarea label="Anotações (exemplo)" hint="Texto de exemplo." showCount maxLength={200} rows={3} />
      </div>
    </Section>
  );
}

function Tiles() {
  return (
    <Section title="Indicadores e selos de papel" note="Valores de exemplo; sem dado, o app mostra “—”.">
      <div style={{ ...box, display: "grid", gap: "var(--space-4)" }}>
        <div style={grid(180)}>
          <StatTile label="Indicador de exemplo" value="—" hint="Exemplo" />
          <StatTile label="Indicador com ícone" value="—" hint="Exemplo" icon="clock" />
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <Badge tone="candidate">{ROOM_ROLE_LABEL.candidate}</Badge>
          <Badge tone="actor">{ROOM_ROLE_LABEL.evaluator}</Badge>
          <Badge tone="candidate" size="sm">
            {ROOM_ROLE_LABEL.candidate}
          </Badge>
          <Badge tone="actor" size="sm">
            {ROOM_ROLE_LABEL.evaluator}
          </Badge>
        </div>
      </div>
    </Section>
  );
}

export function Vitrine() {
  return (
    <div style={{ display: "grid", gap: "var(--space-8)", maxWidth: 1040, margin: "0 auto", padding: "var(--space-4)" }}>
      <header>
        <h1 style={{ font: "var(--type-h1)", color: "var(--text-primary)", margin: 0 }}>Vitrine do Treinamento em Dupla</h1>
        <p style={{ font: "var(--type-body)", color: "var(--text-secondary)", margin: "8px 0 0" }}>
          Página só de desenvolvimento. Tudo aqui é Exemplo: nenhuma pessoa, nota ou estação de verdade. Alterne dia e noite pelo botão do topo.
        </p>
      </header>
      <Colors />
      <Timers />
      <Tiles />
      <Prints />
      <Stations />
      <Match />
      <Pep />
      <Feedback />
    </div>
  );
}

export default Vitrine;
