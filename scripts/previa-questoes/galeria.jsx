// Galeria de componentes e do menu do app com a cor principal AZUL (decisão do dono, 15/10/2026). Só para conferir por captura:
//   /galeria.html?tema=escuro
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../../src/novo/ds/styles.css";
import { AppShell } from "../../src/novo/app/Shell.jsx";
import { Badge, Banner, Button, Card, Checkbox, Chip, Flashcard, PlanCard, ProgressBar, SegmentedControl, StatCard, Switch, Tabs, TextField, TopicRow } from "../../src/novo/ds";

const params = new URLSearchParams(location.search);
const theme0 = params.get("tema") === "escuro" ? "dark" : "light";
function Galeria() {
  const [theme, setTheme] = React.useState(theme0);
  const [tab, setTab] = React.useState("a");
  const [seg, setSeg] = React.useState("x");
  React.useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return (
    <AppShell route="questoes" go={() => {}} phase={1} setPhase={() => {}} theme={theme} setTheme={setTheme} info={{ name: "Aluno de prévia", isStaff: false, flashcardsDue: 3 }}>
      <div style={{ display: "grid", gap: 20, maxWidth: 1100 }}>
        <h1 style={{ margin: 0, font: "var(--type-h2)" }}>Cor principal azul</h1>
        <Card><div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Button>Primário</Button><Button variant="secondary">Secundário</Button><Button variant="strong">Forte</Button><Button variant="ghost">Fantasma</Button><Button variant="link">Link</Button><Button variant="danger">Perigo</Button><Button icon="play" iconRight="arrow-right">Com ícones</Button><Button disabled>Desligado</Button>
        </div></Card>
        <Card><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["neutral", "brand", "success", "warning", "danger", "info", "pro", "ai", "streak", "solid"].map((t) => <Badge key={t} tone={t}>{t}</Badge>)}
          <Chip selected>Selecionado</Chip><Chip>Normal</Chip>
        </div></Card>
        <Card><Tabs tabs={[{ value: "a", label: "Aba ativa" }, { value: "b", label: "Outra" }, { value: "c", label: "Mais" }]} value={tab} onChange={setTab} />
          <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
            <SegmentedControl value={seg} onChange={setSeg} options={[{ value: "x", label: "Um" }, { value: "y", label: "Dois" }]} />
            <ProgressBar label="Progresso" value={62} max={100} valueLabel="62%" />
            <div style={{ display: "flex", gap: 24 }}><Switch checked onChange={() => {}} label="Ligado" /><Checkbox checked onChange={() => {}} label="Marcado" /></div>
            <TextField label="Campo" defaultValue="Texto digitado" />
          </div></Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          <StatCard label="Marca" value="82%" icon="target" tone="brand" /><StatCard label="Acertos" value="41" icon="circle-check" tone="success" /><StatCard label="Atenção" value="7" icon="triangle-alert" tone="warning" /><StatCard label="Info" value="3" icon="info" tone="info" />
        </div>
        <Banner tone="brand" title="Aviso de marca">Texto de apoio do aviso.</Banner>
        <Banner tone="info" title="Informação">Texto de apoio.</Banner>
        <Card variant="brand"><b>Cartão de destaque da marca</b><p style={{ margin: "6px 0 0", color: "var(--text-secondary)" }}>Fundo e borda vindos dos tokens.</p></Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <PlanCard name="Pro" icon="crown" price="R$ 129,90" period="/mês" tag="Mais escolhido" featured features={["Recurso um", "Recurso dois"]} cta="Escolher" />
          <Card><a href="#x">Link de exemplo</a><p style={{ color: "var(--text-brand)", fontWeight: 600 }}>Texto de marca (text-brand)</p><div style={{ height: 10, borderRadius: 9, background: "var(--brand-gradient)" }} /></Card>
        </div>
      </div>
    </AppShell>
  );
}
createRoot(document.getElementById("root")).render(<MemoryRouter><Galeria /></MemoryRouter>);
