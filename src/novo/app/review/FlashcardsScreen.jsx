// Flashcards com dados do banco (app_flashcards) e agendamento FSRS.
// Mesma marcação da FlashcardsScreen do kit (prototype/ReviewScreens.jsx). O "Modo áudio"
// do protótipo deu lugar a "Novo flashcard": não existe modo áudio no produto.
import React from "react";
import { Badge, Banner, Button, Card, EmptyState, StatCard } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { AREAS, areaLabel, formatWhen } from "../practice/format.js";
import { FlashcardForm } from "./FlashcardForm.jsx";
import { intervalLabel, nextSchedule, previewDays } from "./fsrs.js";
import { TutorButton } from "../tutor/TutorDrawer.jsx";
import { CartaoIlustrado, preCarregarCartao } from "../study/AulaImagem.jsx";
import { CartaoFlashcard } from "./CartaoFlashcard.jsx";
import { AREA_CHAVE, AreaFiltro } from "../study/casca.jsx";

const RATINGS = [
  { value: 1, label: "Errei", variant: "danger" },
  { value: 2, label: "Difícil", variant: "secondary" },
  { value: 3, label: "Bom", variant: "primary" },
  { value: 4, label: "Fácil", variant: "secondary" },
];

export function FlashcardsScreen({ go }) {
  const { backend, refresh } = useSession();
  const mobile = useMobile();
  const [area, setArea] = React.useState("");
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [index, setIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [reviewed, setReviewed] = React.useState(0);
  const [reload, setReload] = React.useState(0);
  const [ilustrados, setIlustrados] = React.useState({});
  const keys = React.useRef(() => {});

  React.useEffect(() => {
    let alive = true;
    backend
      .rpc("app_flashcards", { p_area: area || null })
      .then(async (result) => {
        // cartões do baralho StaziaMed que têm imagem (só de aula publicada); se a função não existir ainda ou falhar, fica o texto
        const ids = (result?.queue ?? []).filter((c) => !c.mine).map((c) => c.id);
        let map = {};
        if (ids.length) {
          try {
            const m = await backend.rpc("app_flashcards_ilustrados", { p_ids: ids });
            if (m && typeof m === "object") map = m;
          } catch {
            map = {};
          }
        }
        if (!alive) return;
        setIlustrados(map);
        setData(result);
        setIndex(0);
        setFlipped(false);
      })
      .catch(() => alive && setError("Não foi possível carregar os flashcards. Recarregue a página."));
    return () => {
      alive = false;
    };
  }, [backend, area, reload]);

  // cartão ilustrado: adianta as imagens do PRÓXIMO cartão (depois das do atual), para "Bom/Fácil…" trocar sem esperar o servidor
  React.useEffect(() => {
    const fila = data?.queue ?? [];
    const proximo = fila[index + 1] && ilustrados[fila[index + 1].id];
    if (!proximo) return undefined;
    let alive = true;
    preCarregarCartao(backend, fila[index] && ilustrados[fila[index].id]).then(() => alive && preCarregarCartao(backend, proximo));
    return () => {
      alive = false;
    };
  }, [backend, data, ilustrados, index]);

  if (!data) return error ? <Banner tone="danger">{error}</Banner> : <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;

  const { counts, queue } = data;
  const card = queue[index];
  const days = card ? previewDays(card.schedule) : null;

  const rate = async (rating) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await backend.rpc("app_review_flashcard", { p_card_id: card.id, p_rating: rating, p_next: nextSchedule(card.schedule, rating) });
      setReviewed((n) => n + 1);
      setFlipped(false);
      if (index + 1 < queue.length) setIndex(index + 1);
      else setReload((n) => n + 1); // fim da fila: atualiza contagens e próxima revisão
      refresh().catch(() => {});
    } catch {
      setError("Não foi possível registrar a revisão. Tente de novo.");
    }
    setBusy(false);
  };
  const remove = async () => {
    if (!window.confirm("Apagar este flashcard? Não dá para desfazer.")) return;
    try {
      await backend.rpc("app_delete_flashcard", { p_card_id: card.id });
      setReload((n) => n + 1);
      refresh().catch(() => {});
    } catch {
      setError("Não foi possível apagar o flashcard.");
    }
  };

  // Atalhos: espaço vira o cartão (no próprio cartão); 1–4 avaliam depois de virar.
  keys.current = (event) => {
    if (!card || creating || event.metaKey || event.ctrlKey || event.altKey) return;
    if (/^(input|textarea|select)$/i.test(event.target?.tagName ?? "")) return;
    if (flipped && ["1", "2", "3", "4"].includes(event.key)) rate(Number(event.key));
  };

  return (
    <Keys handler={keys}>
      {error && <Banner tone="danger">{error}</Banner>}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className="sm-overline">Repetição espaçada</span>
              <Badge size="sm">
                {queue.length} {queue.length === 1 ? "cartão agendado" : "cartões agendados"}
              </Badge>
            </div>
            {/* o título "Flashcards" já está no cabeçalho da página (h1): aqui fica só a frase */}
            <p style={{ margin: "6px 0 0", color: "var(--text-secondary)" }}>Revisão espaçada dos conteúdos clínicos que você precisa manter ativos na memória.</p>
          </div>
          <Button variant="secondary" icon="plus" onClick={() => setCreating(!creating)} aria-expanded={creating}>
            Novo flashcard
          </Button>
        </div>
      </Card>
      {creating && (
        <Card>
          <h3 style={{ margin: "0 0 16px", font: "var(--type-h4)" }}>Novo flashcard</h3>
          <FlashcardForm
            initial={{ area }}
            onCancel={() => setCreating(false)}
            onSaved={() => {
              setCreating(false);
              setReload((n) => n + 1);
            }}
          />
        </Card>
      )}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3,1fr)", gap: 16 }}>
        <StatCard label="Novos" value={counts.new} caption="Aguardando 1ª repetição" />
        <StatCard label="Em aprendizado" value={counts.learning} caption="Em fase de fixação ativa" tone="info" icon="refresh-cw" />
        <StatCard label="Consolidados" value={counts.consolidated ?? 0} caption="Intervalo de 21 dias ou mais" tone="success" icon="circle-check" />
      </div>
      {/* mesmo filtro de área de Temas, Diretrizes e Mapas (no celular, uma fileira que rola para o lado) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <span className="sm-field__label">Filtrar por grande área</span>
        <AreaFiltro
          rotulo="Filtrar por grande área"
          valor={area}
          onChange={setArea}
          itens={[{ id: "", label: "Todas as áreas", k: "todas", curto: "Todas" }, ...AREAS.map((a) => ({ id: a.id, label: a.label, k: AREA_CHAVE[a.id] }))]}
        />
      </div>
      {card ? (
        <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", font: "var(--type-caption)", color: "var(--text-secondary)" }}>
            <span>
              {card.schedule ? "Revisão de hoje" : "Cartão novo"} · {card.topic}
            </span>
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {index + 1} / {queue.length}
            </span>
          </div>
          {ilustrados[card.id] ? (
            <CartaoIlustrado key={card.id} tema={ilustrados[card.id].tema} n={ilustrados[card.id].n} front={card.front} back={card.back} flipped={flipped} onFlip={setFlipped} />
          ) : (
            // sem imagem: o mesmo layout dos ilustrados, em texto, na cor da área (paleta v2); o cartão do próprio aluno ganha o selo "Meu cartão"
            <CartaoFlashcard key={card.id} area={card.area} topic={card.topic} front={card.front} back={card.back} selos={{ meu: Boolean(card.mine) }} flipped={flipped} onFlip={setFlipped} />
          )}
          {flipped ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }} role="group" aria-label="Como foi lembrar?">
              {RATINGS.map((r, k) => (
                <Button key={r.value} variant={r.variant} onClick={() => rate(r.value)} disabled={busy} style={{ flexDirection: "column", height: 56, gap: 2 }}>
                  <span>{r.label}</span>
                  <span style={{ font: "500 11px var(--font-mono)", opacity: 0.8 }}>{intervalLabel(days[k])}</span>
                </Button>
              ))}
            </div>
          ) : (
            <Button size="lg" variant="strong" fullWidth onClick={() => setFlipped(true)}>
              Mostrar resposta
            </Button>
          )}
          {flipped && card.topic && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <TutorButton request={{ mode: "livre", topic: card.topic, context: { type: "flashcard", id: String(card.id), label: card.topic } }} label="Perguntar ao Tutor sobre este tema" variant="ghost" />
            </div>
          )}
          {card.mine && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Button variant="ghost" size="sm" icon="trash-2" onClick={remove}>
                Apagar este flashcard
              </Button>
            </div>
          )}
        </div>
      ) : counts.total === 0 ? (
        <EmptyState
          icon="layers"
          title={area ? `Nenhum flashcard de ${areaLabel(area)}` : "Nenhum flashcard ainda"}
          description="Crie seus próprios cartões aqui ou salve um a partir da correção de uma questão. O baralho StaziaMed aparece aqui quando for publicado."
          action={
            <Button icon="plus" onClick={() => setCreating(true)}>
              Criar flashcard
            </Button>
          }
        />
      ) : (
        <Banner
          tone="success"
          title={reviewed ? `Revisão concluída: ${reviewed} ${reviewed === 1 ? "cartão" : "cartões"}` : "Nenhum cartão pendente hoje"}
          action={
            <Button size="sm" variant="secondary" iconRight="arrow-right" onClick={() => go("questoes")}>
              Resolver questões
            </Button>
          }
        >
          {counts.next_due ? `A próxima revisão é ${formatWhen(counts.next_due)}.` : "Todos os seus flashcards programados estão em dia."}
        </Banner>
      )}
    </Keys>
  );
}

function Keys({ handler, children }) {
  React.useEffect(() => {
    const onKey = (event) => handler.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handler]);
  return <>{children}</>;
}
