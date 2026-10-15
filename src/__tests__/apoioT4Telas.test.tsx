/**
 * APOIO-T4 (testador adversarial): as TELAS DO ALUNO e a fonte complementar ("Sangue nos Olhos"). jsdom, banco simulado.
 *
 * Para cada tela, três situações:
 *  (a) servidor CERTO (resposta já filtrada como o banco da 9620 devolve): nada da apostila no texto nem no HTML; a fonte
 *      OFICIAL aparece; só com a complementar, nada de "Fontes oficiais conferidas", "Atualizada" nem "Atualidade".
 *  (b) servidor FALHOU (a resposta já traz a apostila): o que a tela faz? Resultado: mostra tudo. A defesa é SÓ do banco e do
 *      servidor; nenhuma tela do aluno filtra. Cada caso está em it.fails (o teste afirma a regra do dono e falha hoje).
 *  (c) indícios com o servidor certo (selo de conferência sem documento, "Documento 1", resumo antigo do Tutor).
 * O bloco "prova positiva" no fim monta de novo cada caso it.fails e confere que o problema existe mesmo (assim nenhum it.fails
 * passa por erro de montagem).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student", profile: { name: "Aluna" }, play: { enabled: false } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: ({ label }: any) => <button type="button">{label}</button> }));
vi.mock("../novo/app/tutor/voice/audioUnlock.js", () => ({ unlockAudio: () => null, releaseAudioContext: async () => {}, getAudioContext: () => null }));
vi.mock("../novo/app/tutor/voice/StaziaVoiceOrb.jsx", () => ({ StaziaVoiceOrb: () => <div data-testid="orb" />, orbEmotion: () => ({ emotion: "neutral", intensity: 0.2 }) }));
vi.mock("../novo/app/tutor/useRealtimeVoice.js", () => ({
  realtimeErrorMessage: (e: any) => e?.message ?? "erro",
  useRealtimeVoice: () => ({ state: "ready", error: null, captions: { tutor: "", student: "" }, streams: { input: null, output: null }, muted: false, provider: "realtime", remaining: null,
    start() {}, stop: async () => {}, interrupt() {}, sendText() {}, toggleMute() {}, setVolume() {}, active: true }),
}));

import { Correction } from "../novo/app/practice/Correction.jsx";
import { QuestionCommentary } from "../novo/app/practice/QuestionCommentary.jsx";
import { PodcastsSection } from "../novo/app/podcasts/PodcastsSection.jsx";
import { LessonDetail } from "../novo/app/study/LessonsScreen.jsx";
import { UpdateDetail } from "../novo/app/study/UpdatesScreen.jsx";
import { VoiceChatSheet } from "../novo/app/tutor/voice/VoiceTranscript.jsx";

const COMP_TITLE = "Sangue nos Olhos — Pediatria";
const COMP_ORGAN = "Sangue nos Olhos";
const COMP_URL = "https://apostilas.sno-exemplo.invalid/pediatria-2026.pdf";
const COMP_FILE = "sno-pediatria-2026.pdf";
const TRECHO = "FRASE-SECRETA-SNO";
const CITA = `Segundo a apostila Sangue nos Olhos (p. 345): ${TRECHO}.`;
const OFI = { title: "PCDT Bronquiolite (teste)", organ: "Ministério da Saúde (teste)", version: "1", page: 12, url: "https://www.gov.br/saude/pcdt-bronquiolite", published_on: "2025-05-01" };
const COMP = { title: COMP_TITLE, organ: COMP_ORGAN, version: "2026", page: 345, url: COMP_URL, published_on: "2026-01-01" };
const PROIBIDOS = ["Sangue", "sangue", "apostila", "Apostila", TRECHO, "sno-exemplo", COMP_FILE, "p. 345", "cursinho"];
const SELOS = ["Fontes oficiais conferidas", "Atualizada", "Atualidade"];

/** Termos proibidos no texto visível OU no HTML (links, atributos). */
const vazou = (el: HTMLElement) => PROIBIDOS.filter((t) => (el.textContent ?? "").includes(t) || el.innerHTML.includes(t));

let rpc: Record<string, (a: any) => any> = {};
beforeEach(() => {
  rpc = { app_question_verify_on_serve: () => null };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (!rpc[fn]) throw new Error(`rpc não simulada: ${fn}`);
    return rpc[fn](args);
  });
  (globalThis as any).fetch = vi.fn(async (url: string) =>
    String(url).endsWith("/api/tutor/nexus")
      ? new Response(JSON.stringify({ voice_enabled: false, stt: false, reserve: false, professors: [] }), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response(JSON.stringify({ ready: true }), { status: 200, headers: { "Content-Type": "application/json" } })
  );
});
afterEach(cleanup);

// ------------------------------------------------------------------------------------------------- respostas simuladas
const correcao = (over: any = {}) => ({
  is_correct: true, correct_option: "B", annulled: false, in_review: false, topic: "Bronquiolite", subtopic: "Manejo", explanation: "B é a conduta.",
  option_notes: [{ id: "A", text: "A não." }], expected_conduct: "Suporte.", inep_intent: "Manejo inicial.",
  sources: [{ title: "Gabarito oficial INEP 2024/1 (teste)", organization: "INEP" }], ...over,
});
const comentario = (over: any = {}) => ({
  question_id: "q1", version: 1, reviewed_at: "2026-10-01T12:00:00Z", question_core: "Pede a conduta.", key_data: [], trap: null, golden_rule: "Suporte.",
  official_answer: "B", official_status: "FINAL", temporal_status: "CURRENT",
  options: [{ option_id: "B", is_official_correct: true, distractor_kind: "CORRECT", reasoning: "B é a conduta." }, { option_id: "A", is_official_correct: false, distractor_kind: "WRONG", why_wrong: "A não." }],
  comment: null, sources: [OFI], sources_checked_at: "2026-10-01T12:00:00Z", seal: "UPDATED", seal_checked_at: "2026-10-01T12:00:00Z",
  freshness: { sources: 1, score: 100, last_source_check_at: "2026-10-01T12:00:00Z" }, update_in_review: false,
  update_card: { version: 1, temporal_status: "UPDATED_BUT_SAME_ANSWER", impact_level: "COMMENT_ONLY", official_answer: "B", official_status: "FINAL", official_source: "Gabarito INEP",
    current_answer: "B", what_changed: "A diretriz manteve a conduta.", why_it_matters: null, options_affected: [], sources: [OFI], effective_date: "2025-05-01", verified_at: "2026-10-01T12:00:00Z" },
  ...over,
});
const SO_COMPLEMENTAR = { sources: [], sources_checked_at: null, seal: null, seal_checked_at: null, freshness: { sources: 0, score: 0, last_source_check_at: null }, update_card: null };

async function montaCorrecao(corr: any, com: any, timeline: any[] = [{ type: "OFFICIAL_ANSWER", at: "2024-06-01T12:00:00Z", answer: "B", source: "Gabarito INEP 2024/1" }]) {
  rpc.app_question_commentary = () => com;
  rpc.app_question_timeline = () => timeline;
  const { container } = render(<Correction selected="B" correction={corr} question={{ id: "q1", area: "PEDIATRIA" }} />);
  if (com) {
    await screen.findByRole("region", { name: "Análise Stazia da questão" });
    fireEvent.click(screen.getByRole("button", { name: "Ver o histórico desta questão" }));
    await screen.findByText("Histórico da questão");
  }
  return container;
}

const AULA = {
  id: "11111111-1111-4111-8111-111111111111", area: "PEDIATRIA", area_label: "Pediatria", topic: "Bronquiolite", title: "Bronquiolite na prática",
  duration_minutes: 40, instructor: "Dra. Teste", specialty: "Pediatria", video_url: null, summary: "Suporte clínico.", key_points: ["Suporte"],
  guideline_title: null, guideline_url: null, published: true, position: 0, progress: null, questions_topic: 3, questions_area: 50,
  materials: [{ id: "m1", kind: "slides", title: "Material complementar", has_file: true, content_type: "application/pdf", size_bytes: 1000, url: null }],
};
const montaAula = (over: any = {}) => render(<LessonDetail lesson={{ ...AULA, ...over }} go={vi.fn()} onBack={vi.fn()} onChanged={vi.fn()} />).container;

const ATUALIZACAO = {
  id: "u1", slug: "bronq", area: "PEDIATRIA", area_label: "Pediatria", topic: "Bronquiolite", subtopic: "Manejo", years: [2025], priority: 1, publication_label: "05/2025",
  institution: OFI.organ, document_title: OFI.title, source_url: OFI.url, before_text: "Antes.", current_conduct: "Suporte.", reviewed: true, reviewed_at: "2026-10-01T12:00:00Z",
  published: true, timeline: [], clinical_impact: null, exam_impact: null, trap: null, flashcards: [], practice_questions: [], questions_count: 0,
};
async function montaAtualizacao(over: any = {}) {
  rpc.app_guideline_update = () => ({ ...ATUALIZACAO, ...over });
  const { container } = render(<UpdateDetail slug="bronq" go={vi.fn()} onBack={vi.fn()} />);
  await screen.findByText("O que mudou na conduta");
  return container;
}

async function montaPodcast(episodio: any) {
  rpc.app_podcasts = () => [{ id: "p1", title: "Bronquiolite em 8 minutos", topic: "Bronquiolite", area: "PEDIATRIA", seconds: 480, published_at: "2026-10-01T12:00:00Z", lesson: null }];
  rpc.app_podcast = () => episodio;
  const { container } = render(<PodcastsSection backend={backend} area="" />);
  fireEvent.click(await screen.findByRole("button", { name: "Ver transcrição e fontes" }));
  await screen.findByText("Combinado.");
  return container;
}
const episodio = (sources: any[], lines = [{ speaker: "ANA", text: "Vamos falar de bronquiolite." }, { speaker: "BRUNO", text: "Combinado." }]) => ({ id: "p1", title: "Bronquiolite em 8 minutos", lines, sources });

async function montaTutorHistorico(summary: any) {
  const SID = "22222222-2222-4222-8222-222222222222";
  const ENT = { enabled: true, mode: "paid", is_paid: true, staff: false, trial: { state: "none", days: 7 }, can_use: true, can_text: true, can_voice: false, text: { used: 0, limit: 40, remaining: 40 }, voice: { enabled: false }, questions: { limit: null, used: 0 } };
  rpc.app_tutor_status = () => ({ enabled: true, available: true, requires_pro: true, daily_limit: 40, used_today: 0, voice_enabled: false, reviews_due: 0, entitlement: ENT,
    preferences: { personality_id: "direto", profanity: "off", chosen: true }, personalities: [{ id: "direto", name: "Direto", emoji: "🎯", tagline: "Sem rodeios.", swears: false, voice: {} }] });
  rpc.app_tutor_sessions = () => [{ id: SID, title: "Bronquiolite", mode: "livre", status: "closed", personality: "🎯", persona: "Direto", personality_id: "direto", read_only: false, minutes: 5, questions: 0 }];
  rpc.app_tutor_session = () => ({ id: SID, mode: "livre", title: "Bronquiolite", status: "closed", read_only: false, summary, personality: { id: "direto", name: "Direto", emoji: "🎯", voice: {} },
    question: null, messages: [{ id: 1, role: "tutor", content: "Suporte.", grounding: "source", sources: [{ ref: "S1", label: `${COMP_TITLE}, p. 345` }] }] });
  const { NexusScreen } = await import("../novo/app/tutor/nexus/NexusScreen.jsx");
  const { container } = render(<NexusScreen go={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Histórico" }));
  fireEvent.click(await screen.findByRole("button", { name: /Direto · Perguntar ao Tutor/ }));
  await screen.findByText("Resumo");
  return container;
}

// ------------------------------------------------------------------------------------------------- (a) servidor certo
describe("(a) servidor certo: a tela não mostra a apostila e mostra a oficial", () => {
  it("Correção + Análise + linha do tempo: fonte oficial, selo e atualidade aparecem; nada da apostila", async () => {
    const el = await montaCorrecao(correcao(), comentario());
    expect(vazou(el)).toEqual([]);
    // painel "Fontes" do modelo: a fonte oficial do gabarito (título e órgão), como a linha "Gabarito: …" de antes
    expect(el.querySelector(".tq-src")!.textContent).toContain("Gabarito oficial INEP 2024/1 (teste)");
    expect(el.querySelector(".tq-src")!.textContent).toContain("INEP");
    for (const s of SELOS) expect(el.textContent).toContain(s);
    expect(el.textContent).toContain(OFI.title);
    expect(el.innerHTML).toContain(OFI.url);
    expect(el.textContent).toContain("Gabarito oficial registrado — alternativa B (Gabarito INEP 2024/1)");
  });

  it("só com a complementar (o banco devolve fontes vazias, sem selo e atualidade 0): nada de 'Fontes oficiais conferidas', 'Atualizada' nem 'Atualidade'", async () => {
    const el = await montaCorrecao(correcao({ sources: [] }), comentario(SO_COMPLEMENTAR), [{ type: "OFFICIAL_ANSWER", at: "2024-06-01T12:00:00Z", answer: "B", source: null }]);
    expect(vazou(el)).toEqual([]);
    for (const s of SELOS) expect(el.textContent).not.toContain(s);
    expect(el.querySelector(".tq-src")).toBeNull();
    expect(el.textContent).not.toContain("Conduta atual conferida");
  });

  it("Podcast: a fonte oficial aparece com páginas; nada da apostila", async () => {
    const el = await montaPodcast(episodio([{ title: OFI.title, kind: "link", url: OFI.url, pages: [12] }]));
    expect(vazou(el)).toEqual([]);
    expect(el.textContent).toContain(`${OFI.title} (p. 12)`);
  });

  it("Aula: diretriz escondida vira 'Não disponível'; material com rótulo neutro; nada da apostila", () => {
    const el = montaAula();
    expect(vazou(el)).toEqual([]);
    expect(el.textContent).toContain("Diretriz SUS / PCDT");
    expect(el.textContent).toContain("Material complementar (PDF)");
  });

  it("Aula com diretriz oficial: aparece", () => {
    const el = montaAula({ guideline_title: OFI.title, guideline_url: OFI.url });
    expect(el.textContent).toContain(OFI.title);
  });

  it("Atualização com documento oficial: aparece; nada da apostila", async () => {
    const el = await montaAtualizacao();
    expect(vazou(el)).toEqual([]);
    expect(el.textContent).toContain(OFI.title);
    expect(screen.getByRole("button", { name: "Abrir documento oficial" })).toBeTruthy();
  });

  it("Tutor: a transcrição mostra só o texto; 'sources' e 'grounding' da mensagem NÃO aparecem na tela", () => {
    const { container } = render(<VoiceChatSheet messages={[{ id: 1, role: "tutor", content: "Na bronquiolite, suporte.", grounding: "source", sources: [{ ref: "S1", label: `${COMP_TITLE}, p. 345` }] }]}
      onSend={vi.fn()} onClose={vi.fn()} showCaptions onToggleCaptions={vi.fn()} volume={1} onVolume={vi.fn()} canSend />);
    expect(vazou(container)).toEqual([]);
    expect(container.textContent).toContain("Na bronquiolite, suporte.");
  });
});

// ------------------------------------------------------------------------------------------------- (b) e (c): casos it.fails
type Caso = { nome: string; sev: string; causa: string; montar: () => Promise<HTMLElement> | HTMLElement; problema: (el: HTMLElement) => string[] };
const termos = (el: HTMLElement) => vazou(el);
const CASOS: Caso[] = [
  // (b) servidor falhou: a tela mostra
  { nome: "Correção: 'Gabarito: <apostila>' quando a 1ª fonte da resposta é a apostila", sev: "CRÍTICO (só se o banco falhar)", causa: "src/novo/app/practice/Correction.jsx:111 e 170-175 (mostra sources[0] sem conferir)",
    montar: () => montaCorrecao(correcao({ sources: [{ title: COMP_TITLE, organization: COMP_ORGAN, url: COMP_URL }, { title: "Gabarito oficial INEP", organization: "INEP" }] }), null), problema: termos },
  { nome: "Análise: a apostila aparece sob 'Fontes oficiais conferidas', com link e página", sev: "CRÍTICO (só se o banco falhar)", causa: "QuestionCommentary.jsx:114-128 (lista o que vier, com o rótulo 'oficiais')",
    montar: () => montaCorrecao(correcao(), comentario({ sources: [COMP, OFI] })), problema: termos },
  { nome: "Cartão de atualização: 'Fonte: <apostila> · p. 345'", sev: "CRÍTICO (só se o banco falhar)", causa: "QuestionCommentary.jsx:155-158 e 253",
    montar: () => montaCorrecao(correcao(), comentario({ update_card: { ...comentario().update_card, sources: [COMP] } })), problema: termos },
  { nome: "Linha do tempo: 'Gabarito oficial registrado — alternativa B (<apostila>)'", sev: "CRÍTICO (só se o banco falhar)", causa: "QuestionCommentary.jsx:202",
    montar: () => montaCorrecao(correcao(), comentario(), [{ type: "OFFICIAL_ANSWER", at: "2024-06-01T12:00:00Z", answer: "B", source: `Gabarito INEP; ${COMP_TITLE}` }]), problema: termos },
  { nome: "Podcast: a apostila aparece em 'Fontes' com link e páginas", sev: "CRÍTICO (só se o banco falhar)", causa: "PodcastsSection.jsx:61-72",
    montar: () => montaPodcast(episodio([{ title: COMP_TITLE, kind: "pdf", url: COMP_URL, pages: [345] }, { title: OFI.title, kind: "link", url: OFI.url, pages: [12] }])), problema: termos },
  { nome: "Aula: diretriz da apostila aparece como 'Diretriz SUS / PCDT' e o material 'other' mostra o nome do arquivo", sev: "CRÍTICO (só se o banco falhar)", causa: "LessonsScreen.jsx:340 e 218 (título do material 'other' e guideline_title sem conferir)",
    montar: () => montaAula({ guideline_title: COMP_TITLE, guideline_url: COMP_URL, materials: [...AULA.materials, { id: "m9", kind: "other", title: COMP_FILE, has_file: true, url: null }] }), problema: termos },
  { nome: "Atualização: 'Fonte oficial' mostra órgão, título e o botão 'Abrir documento oficial' da apostila", sev: "CRÍTICO (só se o banco falhar)", causa: "UpdatesScreen.jsx:235, 309-320",
    montar: () => montaAtualizacao({ institution: COMP_ORGAN, document_title: COMP_TITLE, source_url: COMP_URL, publication_label: "Ed. 2026" }), problema: termos },
  { nome: "Tutor: a fala do professor que cita a apostila aparece na transcrição (a tela não confere o texto)", sev: "CRÍTICO (só se a checagem do servidor falhar)", causa: "VoiceTranscript.jsx:48 (mostra m.content como veio)",
    montar: () => render(<VoiceChatSheet messages={[{ id: 1, role: "tutor", content: `Na bronquiolite, suporte. ${CITA}` }]} onSend={vi.fn()} onClose={vi.fn()} showCaptions onToggleCaptions={vi.fn()} volume={1} onVolume={vi.fn()} canSend />).container, problema: termos },
  { nome: "Correção: textos digitados pela equipe (explicação, conduta esperada, o que avalia) citando a apostila aparecem como vieram", sev: "CRÍTICO (o banco NÃO filtra estes campos: ver apoioT4Banco)", causa: "Correction.jsx:130-158; banco 20261003009620:292-304",
    montar: () => montaCorrecao(correcao({ explanation: `B é a conduta. ${CITA}`, expected_conduct: `Suporte. ${CITA}`, inep_intent: `Como ensina a apostila ${COMP_ORGAN}.` }), null), problema: termos },
  // (c) servidor certo, mas a tela revela/afirma o que não deveria
  { nome: "Atualização conferida só na apostila: 'Conferido por revisor médico no documento oficial' ao lado de 'Documento a confirmar' e 'Endereço oficial em conferência'", sev: "IMPORTANTE (selo sem fonte oficial + indício)",
    causa: "UpdatesScreen.jsx:243-244 e 312-320; banco 20261003007800:199-201 (aprova sem exigir fonte oficial)",
    montar: () => montaAtualizacao({ institution: null, document_title: null, source_url: null, publication_label: null }),
    problema: (el) => (el.textContent ?? "").includes("Conferido por revisor médico no documento oficial") && (el.textContent ?? "").includes("Documento a confirmar") ? ["selo de conferência com o documento escondido"] : [] },
  { nome: "Cartão antigo conferido só na apostila: 'Conduta atual conferida' e 'Pelas recomendações vigentes conferidas' sem nenhuma fonte", sev: "IMPORTANTE (afirmação de conferência sem fonte oficial; dados antigos)",
    causa: "QuestionCommentary.jsx:135-161 e 226-241 (o cartão não exige fonte); banco 20261003009620:271-275",
    montar: async () => {
      const el = await montaCorrecao(correcao({ sources: [] }), comentario({ ...SO_COMPLEMENTAR, update_card: { ...comentario().update_card, sources: [] } }));
      fireEvent.click(screen.getByRole("radio", { name: "Como responder hoje" }));
      return el;
    },
    problema: (el) => ["Conduta atual conferida", "Pelas recomendações vigentes conferidas"].filter((t) => (el.textContent ?? "").includes(t)) },
  { nome: "Podcast: PDF da apostila com nome abreviado (não bate com a biblioteca) aparece como 'Documento 1 (p. 345)' + 'Roteiro feito só com essas fontes'", sev: "IMPORTANTE (contagem e página)",
    causa: "banco 20261003009620:387 e 394; tela PodcastsSection.jsx:61-72",
    montar: () => montaPodcast(episodio([{ title: "Documento 1", kind: "pdf", url: null, pages: [345] }])), problema: termos },
  { nome: "Aula: diretriz digitada 'Apostila de Pediatria do cursinho' aparece como 'Diretriz SUS / PCDT'", sev: "IMPORTANTE", causa: "banco 20261003009620:70-83 (a palavra 'apostila' não esconde); tela LessonsScreen.jsx:340",
    montar: () => montaAula({ guideline_title: "Apostila de Pediatria do cursinho", guideline_url: "https://cursinho.invalid/ped.pdf" }), problema: termos },
  { nome: "Tutor: resumo de conversa antiga ('Firmou: Suporte (Sangue nos Olhos — Pediatria p. 345)') aparece no histórico", sev: "CRÍTICO (dados antigos)",
    causa: "NexusScreen.jsx:382-388 (SummaryBlock); banco 20261003005600:188 (summary sem filtro)",
    montar: () => montaTutorHistorico({ concepts_mastered: [`Suporte (${COMP_TITLE} p. 345)`] }), problema: termos },
];

describe("(b)/(c) a tela recebe a apostila ou um indício: o que ela faz (it.fails = vazamento confirmado)", () => {
  for (const c of CASOS) it.fails(`VAZAMENTO [${c.sev}] ${c.nome}`, async () => expect(c.problema(await c.montar()), c.causa).toEqual([]));
});

describe("prova positiva: cada it.fails acima falha pelo motivo certo", () => {
  for (const c of CASOS) {
    it(`a tela mostra mesmo: ${c.nome}`, async () => {
      const el = await c.montar();
      await act(async () => {});
      await waitFor(() => expect(c.problema(el).length, c.causa).toBeGreaterThan(0));
    });
  }
});
