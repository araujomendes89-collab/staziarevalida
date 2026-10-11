// Administração › Registro: o nome de cada ação gravada no registro (admin_audit_log), um resumo em linguagem simples
// (questão, tema, motivo, título, nota) e quem fez, sem códigos internos (nome técnico da ação, situação em inglês,
// identificador). Toda ação que alguma migração grava no registro tem nome aqui: src/__tests__/registroAdministracao.test.ts
// lê as migrações e confere.
import { PLAN_LABEL, ROLE_LABEL, SUB_STATUS_LABEL } from "./common.jsx";
import { QUESTION_STATUS_LABEL } from "../../../shared/questions/status";

// Nomes que a tela da Central de IAs mostra (ai/AdminAI.jsx e ai/aiApi.js). Ficam aqui, copiados, para o Registro não
// depender da pasta ai/ (outra frente de trabalho); o teste registroAdministracao.test.ts compara as duas listas e avisa
// se a Central ganhar uma IA ou uma função nova.
export const PROVIDER_NAME = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini", ollama: "Ollama" };
export const AI_FUNCTION_NAME = {
  criacao: "Criação",
  verificacao: "Verificação e checagem",
  engenharia_reversa: "Engenharia reversa",
  assistente_preencher: "Assistente: preencher",
  assistente_conferir: "Assistente: conferir",
  assistente_revisar: "Assistente: conversar e revisar",
};
/** Dólar em pt-BR: "US$ 0,0123" (até 4 casas); zero vira "US$ 0" (igual ao da Central de IAs). */
const usd = (n) => {
  const v = Number(n ?? 0);
  return v === 0 ? "US$ 0" : `US$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v)}`;
};

export const ACTION_LABEL = {
  // usuários, planos e configurações
  "user.role": "Papel alterado",
  "user.subscription": "Plano alterado",
  "user.delete": "Usuário excluído",
  "plan.save": "Plano editado",
  "settings.save": "Configurações salvas",
  // questões
  "questions.import": "Questões importadas",
  "question.inserted": "Questão criada",
  "question.updated": "Questão editada",
  "question.official_answer": "Gabarito oficial registrado",
  "question.explanations_reviewed": "Explicações marcadas como revisadas",
  // estações
  "station.review": "Revisão de estação",
  // atualizações
  "guideline_update.publish": "Atualização publicada",
  "guideline_update.unpublish": "Atualização tirada do ar",
  "guideline_update.delete": "Atualização apagada",
  // aulas
  "lesson.save": "Aula salva",
  "lesson.delete": "Aula apagada",
  "lesson.material": "Material de aula adicionado",
  "lesson.material.delete": "Material de aula apagado",
  // podcasts
  "podcast.save": "Podcast salvo",
  "podcast.delete": "Podcast apagado",
  "podcast.source": "Fonte do podcast adicionada",
  "podcast.script.ai": "Roteiro do podcast escrito pela IA",
  "podcast.script.edit": "Roteiro do podcast editado",
  "podcast.approve": "Roteiro do podcast aprovado",
  "podcast.audio": "Áudio do podcast gerado",
  "podcast.publish": "Podcast publicado",
  "podcast.unpublish": "Podcast tirado do ar",
  // tutor
  "tutor.config": "Tutor configurado",
  "tutor.personality": "Professor ligado ou desligado",
  "tutor.voice.approve": "Voz do professor aprovada",
  "tutor.voice.revoke": "Aprovação da voz do professor retirada",
  // Stazia Arena (gamificação)
  "gamification.rule": "Regra da Stazia Arena alterada",
  "gamification.achievement": "Medalha salva",
  "gamification.mission": "Missão salva",
  "gamification.reward": "Recompensa salva",
  "gamification.recalculate": "Pontos de um aluno recalculados",
  // central de IAs
  "ai.provider": "IA ligada ou desligada",
  "ai.function": "Função de IA configurada",
  "ai.settings": "Ajustes da Central de IAs salvos",
  "ai.price": "Preço de modelo de IA salvo",
};

// começo do nome técnico → parte da Administração (para uma ação nova que ainda não ganhou nome acima)
const PART = {
  user: "Usuários", plan: "Planos", settings: "Configurações", questions: "Questões", question: "Questões", station: "Estações",
  guideline_update: "Atualizações", lesson: "Aulas", podcast: "Podcasts", tutor: "Tutor", gamification: "Stazia Arena", ai: "Central de IAs",
};

const own = (map, key) => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined);
const join = (parts) => parts.filter(Boolean).join(" · ");
const count = (n, one, many) => `${Number(n) || 0} ${Number(n) === 1 ? one : many}`;

// Retirada feita pela própria migração …7800 (regra nova: só fica no ar o que um revisor médico conferiu). Uma versão
// anterior daquele SQL gravou sem a marca "automatica": a tela reconhece também pelo motivo, sem mexer nos dados do banco.
const AUTO_MOTIVO = "Estava publicada sem conferência médica aprovada";
const isAutomaticRetirement = (entry) =>
  entry.action === "guideline_update.unpublish" && !entry.actor &&
  (entry.details?.automatica === true || String(entry.details?.motivo ?? "").startsWith(AUTO_MOTIVO));

/** Nome da ação em português. */
export function auditLabel(entry) {
  if (isAutomaticRetirement(entry)) return "Retirada automática pela regra nova";
  const label = own(ACTION_LABEL, entry.action);
  if (label) return label;
  const part = own(PART, String(entry.action ?? "").split(".")[0]);
  return part ? `Outra ação em ${part}` : "Outra ação da administração";
}

/** Quem fez. Sem autor: a ação automática da regra nova, ou uma conta apagada depois. */
export function auditActor(entry) {
  if (entry.actor) return entry.actor;
  return isAutomaticRetirement(entry) || entry.details?.automatica === true ? "automático" : "conta excluída";
}

// ---------------------------------------------------------------- questões
// código da questão (admin_upsert_question): revalida_2025_1_q045 → "Revalida 2025/1, questão 45"
export function questionName(id) {
  const m = /^(revalida|enamed)_(\d{4})(?:_(\d))?_q(\d+)$/.exec(String(id ?? ""));
  if (!m) return id ? `Questão ${id}` : "";
  const exam = m[1] === "enamed" ? `ENAMED ${m[2]}` : `Revalida ${m[2]}${m[3] ? `/${m[3]}` : ""}`;
  return `${exam}, questão ${Number(m[4])}`;
}

// situação do gabarito oficial (os mesmos nomes de OFFICIAL_LABEL em AdminQuestions.jsx)
const OFFICIAL_LABEL = { PRELIMINARY: "preliminar", FINAL: "definitivo", CHANGED_AFTER_APPEAL: "alterado após recurso", ANNULLED: "anulada pela banca", UNKNOWN: "sem informação" };
function officialAnswer(d) {
  if (d.status === "ANNULLED") return "Questão anulada pela banca";
  const status = own(OFFICIAL_LABEL, d.status) ?? "situação não informada";
  if (!d.answer) return `Gabarito ${status}`;
  // só o definitivo e o alterado após recurso trocam a letra que vale para o aluno
  const changed = (d.status === "FINAL" || d.status === "CHANGED_AFTER_APPEAL") && d.from && d.from !== d.answer;
  return `Gabarito ${d.answer}, ${status}${changed ? ` (antes era ${d.from})` : ""}`;
}

// marca "explicações a revisar" (…7700): o gabarito de antes e o de agora, e os campos com o nome da tela de Questões
const reviewAnswer = (v) => (v === "ANULADA" ? "anulada pela banca" : v || "sem gabarito");
const reviewField = (c) => (/^explanation_[A-D]$/.test(c) ? `explicação da ${c.slice(-1)}` : own({ expected_conduct: "conduta esperada", analise: "análise publicada" }, c));
function explanationsReviewed(d, entry) {
  const r = d.review ?? {};
  const fields = (Array.isArray(r.campos) ? r.campos : []).map(reviewField).filter(Boolean);
  return join([
    questionName(entry.target),
    (r.de || r.para) && `Gabarito mudou de ${reviewAnswer(r.de)} para ${reviewAnswer(r.para)}`,
    fields.length > 0 && `Revisadas: ${fields.join(", ")}`,
  ]);
}

const questionSaved = (d, entry) =>
  join([questionName(entry.target), d.status && d.status !== "valid" && own(QUESTION_STATUS_LABEL, d.status) && `Situação: ${QUESTION_STATUS_LABEL[d.status]}`, d.reason && `Motivo: ${d.reason}`]);

// ---------------------------------------------------------------- atualizações
// motivo de tirar do ar, como o banco grava (…7800), em linguagem simples
function retirementReason(entry) {
  if (isAutomaticRetirement(entry)) return "estava publicada sem conferência médica aprovada; pela regra nova, só fica no ar o que um revisor médico conferiu";
  const motivo = String(entry.details?.motivo ?? "").trim();
  if (motivo.startsWith("Texto alterado depois da conferência")) return "o texto mudou depois da conferência médica; fica fora do ar até um revisor médico conferir de novo";
  if (motivo.startsWith("Recusada na conferência médica")) return "recusada na conferência médica";
  // sem motivo gravado: foi o botão "Publicada para os alunos" (só o administrador usa)
  return motivo || "o administrador tirou do ar";
}
const topic = (d) => d.topic && `Tema: ${d.topic}`;

// ---------------------------------------------------------------- outras partes
const VOICE_NAME = { tranquilo: "Tranquilo", durona: "Durona", direto: "Direto" };
// código do professor (tutor_personalities.id) → nome que a tela do Tutor mostra
const PROFESSOR_NAME = { acolhedor: "Tranquilo", direto: "Direto", durona: "Durona" };
const reasonOf = (d) => (typeof d.reason === "string" && d.reason.trim() ? `Motivo: ${d.reason.trim()}` : "");
const duration = (seconds) => {
  const s = Math.round(Number(seconds) || 0);
  const m = Math.floor(s / 60);
  return m ? `${m} min${s % 60 ? ` ${s % 60} s` : ""}` : `${s} s`;
};
const cap = (v) => (v == null || v === "" ? "sem teto" : usd(v));
// valor de uma regra da Stazia Arena: interruptor (flags.*) ligado/desligado; número ou texto como está; objeto compacto
const ruleValue = (value) => {
  if (value === true) return "ligada";
  if (value === false) return "desligada";
  if (value == null) return "sem valor";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `valor ${text.length > 80 ? `${text.slice(0, 77)}…` : text}`;
};

// A pessoa afetada (e-mail buscado pelo banco ao mostrar o Registro: campo "subject"). null = a conta foi apagada;
// sem o campo (banco ainda sem a função nova) não dá para dizer quem era.
const person = (entry, label = "Pessoa") => (entry.subject === undefined ? "" : `${label}: ${entry.subject || "conta excluída"}`);

const SUMMARY = {
  "user.role": (d, entry) => join([person(entry), `${ROLE_LABEL[d.from] ?? d.from} → ${ROLE_LABEL[d.to] ?? d.to}`]),
  "user.subscription": (d, entry) => join([person(entry), `${PLAN_LABEL[d.to?.plan] ?? d.to?.plan} · ${SUB_STATUS_LABEL[d.to?.status] ?? d.to?.status}`]),
  "user.delete": (d) => d.email,
  "plan.save": (d, entry) => `${PLAN_LABEL[entry.target] ?? entry.target}${d.active ? " · à venda" : ""}`,
  "settings.save": (d) =>
    join([
      d.trial_days != null && `Dias de teste grátis: ${d.trial_days}`,
      d.announcement && `Aviso no Início ${d.announcement.active ? "ligado" : "desligado"}${d.announcement.title ? `: ${d.announcement.title}` : ""}`,
    ]),
  "questions.import": (d) =>
    join([
      count(d.inserted, "nova", "novas"),
      count(d.updated, "atualizada", "atualizadas"),
      count(d.skipped, "pulada", "puladas"),
      Number(d.answer_differs) > 0 && `${d.answer_differs} com gabarito ou situação diferente (${Number(d.answer_differs) === 1 ? "não mudou" : "não mudaram"})`,
    ]),
  "question.inserted": questionSaved,
  "question.updated": questionSaved,
  "question.official_answer": (d, entry) =>
    join([
      questionName(entry.target),
      officialAnswer(d),
      d.source && `Fonte: ${d.source}`,
      d.reason && `Motivo: ${d.reason}`,
      Number(d.recorrected) > 0 && `${count(d.recorrected, "resposta de aluno corrigida", "respostas de alunos corrigidas")} de novo`,
    ]),
  "question.explanations_reviewed": explanationsReviewed,
  "station.review": (d, entry) => `${entry.target}: ${d.to === "approved" ? "aprovada" : "voltou para revisão"}${d.note ? ` · “${d.note}”` : ""}`,
  "guideline_update.publish": (d) => join([topic(d), d.review_status === "approved" ? "Conferência médica aprovada" : d.review_status && "Publicada sem conferência médica aprovada"]),
  "guideline_update.unpublish": (d, entry) => join([topic(d), `Motivo: ${retirementReason(entry)}`, d.note && `Nota do revisor: ${d.note}`]),
  "guideline_update.delete": topic,
  // aulas e podcasts: o título vem do próprio registro (entry.title, buscado pelo banco; também quando o item já foi apagado)
  "lesson.save": (d, entry) => d.title ?? entry.title,
  "lesson.delete": (d, entry) => entry.title,
  "lesson.material": (d, entry) => join([entry.title && `Aula: ${entry.title}`, d.title && `Material: ${d.title}`]),
  "podcast.save": (d, entry) => d.title ?? entry.title,
  "podcast.delete": (d, entry) => entry.title,
  "podcast.publish": (d, entry) => entry.title,
  "podcast.unpublish": (d, entry) => entry.title,
  "podcast.source": (d, entry) => join([entry.title && `Episódio: ${entry.title}`, d.title && `Fonte: ${d.title}`]),
  "podcast.script.ai": (d, entry) =>
    join([
      entry.title,
      d.simulated ? "Roteiro de teste, sem IA de verdade" : own(PROVIDER_NAME, d.provider) && `IA: ${PROVIDER_NAME[d.provider]}${d.model ? ` (${d.model})` : ""}`,
      d.total_chunks != null && `${Number(d.used_chunks) || 0} de ${d.total_chunks} trechos das fontes usados`,
      !d.simulated && d.cost_usd != null && `custo ${usd(d.cost_usd)}`,
    ]),
  "podcast.script.edit": (d, entry) => join([entry.title, d.lines != null && count(d.lines, "fala", "falas")]),
  "podcast.approve": (d, entry) => join([entry.title, d.note && `Nota: ${d.note}`]),
  "podcast.audio": (d, entry) => join([entry.title, d.seconds && `Duração: ${duration(d.seconds)}`, d.simulated && "áudio de teste, sem voz de verdade"]),
  // O motivo é obrigatório na tela do Tutor ("fica no registro"): aparece inteiro. O "de → para" da configuração é um objeto
  // técnico e não vira texto.
  "tutor.config": (d) => reasonOf(d),
  "tutor.personality": (d) =>
    join([
      own(PROFESSOR_NAME, d.id) ? `Professor ${PROFESSOR_NAME[d.id]}: ${d.active === true ? "ligado" : d.active === false ? "desligado" : "alterado"}` : d.active === true ? "Ligado" : d.active === false ? "Desligado" : "",
      reasonOf(d),
    ]),
  "tutor.voice.approve": (d) => own(VOICE_NAME, d.voice) && `Voz: ${VOICE_NAME[d.voice]}`,
  "tutor.voice.revoke": (d) => own(VOICE_NAME, d.voice) && `Voz: ${VOICE_NAME[d.voice]}`,
  "gamification.rule": (d, entry) => join([`Regra ${entry.target}: ${ruleValue(d.value)}`, d.enabled === false && "regra desativada"]),
  "gamification.recalculate": (d, entry) => person(entry, "Aluno"),
  "gamification.achievement": (d) => d.name,
  "gamification.mission": (d) => d.title,
  "gamification.reward": (d) => d.name,
  "ai.provider": (d, entry) => `${own(PROVIDER_NAME, entry.target) ?? "IA"}: ${d.enabled ? "ligada" : "desligada"}`,
  "ai.function": (d, entry) => join([own(AI_FUNCTION_NAME, entry.target), d.removed && "configuração apagada (volta ao padrão do servidor)"]),
  "ai.settings": (d) =>
    join([
      "monthly_cap_usd" in d && `Teto do mês: ${cap(d.monthly_cap_usd)}`,
      "per_run_cap_usd" in d && `Teto por execução: ${cap(d.per_run_cap_usd)}`,
      "caps_enabled" in d && `Tetos ${d.caps_enabled ? "ligados" : "desligados"}`,
      "tab_override_enabled" in d && `Trocar a IA nas abas: ${d.tab_override_enabled ? "permitido" : "não permitido"}`,
    ]),
  "ai.price": (d, entry) => {
    const [provider, ...model] = String(entry.target ?? "").split(":");
    return join([
      own(PROVIDER_NAME, provider),
      model.join(":"),
      d.input_per_mtok != null && d.output_per_mtok != null && `entrada ${usd(d.input_per_mtok)} e saída ${usd(d.output_per_mtok)} por milhão de tokens`,
    ]);
  },
};

/** Resumo em linguagem simples (vazio quando a ação não tem o que mostrar além do nome). */
export function auditSummary(entry) {
  const d = entry.details && typeof entry.details === "object" ? entry.details : {};
  const summary = own(SUMMARY, entry.action);
  if (summary) return summary(d, entry) || "";
  // ação nova de questão, ainda sem resumo próprio: ao menos a prova e o número
  if (String(entry.action ?? "").startsWith("question.")) return questionName(entry.target);
  return "";
}
