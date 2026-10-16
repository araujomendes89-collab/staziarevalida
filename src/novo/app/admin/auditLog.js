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
  busca_fontes: "Busca de fontes oficiais",
  similaridade: "Questões parecidas",
  analise_mudancas: "Análise do que mudou (Vigilância científica)",
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
  "plan.benefits": "Benefícios do Elite alterados",
  "plan.ineditas_limits": "Limite de Questões Inéditas por plano alterado", // 010300
  "settings.save": "Configurações salvas",
  "support.contact": "Contato de suporte alterado",
  "report.resolve": "Relato de aluno atendido",
  // questões
  "questions.import": "Questões importadas",
  "question.inserted": "Questão criada",
  "question.updated": "Questão editada",
  "question.delete": "Questão apagada",
  "question.analysis_unpublished": "Análise da questão tirada do ar",
  "question.figure_set": "Figura da questão enviada",
  "question.figure_removed": "Figura da questão retirada",
  "question.comment_approved": "Comentário da questão aprovado pelo revisor",
  "question.comment_returned": "Comentário da questão devolvido pelo revisor",
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
  "lesson.review": "Aula conferida",
  "lesson.format": "Formatação do resumo da aula alterada (conferência mantida)",
  "lesson.audio.release": "Áudio Flashcast da aula liberado ao aluno",
  "lesson.delete": "Aula apagada",
  "lesson.material": "Material de aula adicionado",
  "lesson.material.delete": "Material de aula apagado",
  "lesson.file.delete": "Arquivo de aula apagado do depósito",
  // podcasts
  "source.audience": "Classe da fonte alterada",
  "source.check_request": "Conferência das fontes monitoradas pedida",
  "podcast.save": "Podcast salvo",
  "podcast.delete": "Podcast apagado",
  "podcast.source": "Fonte do podcast adicionada",
  "podcast.source_rename": "Fonte do podcast renomeada",
  "podcast.source_complementar": "Classe da fonte do podcast alterada",
  "podcast.script.ai": "Roteiro do podcast escrito pela IA",
  "podcast.script.edit": "Roteiro do podcast editado",
  "podcast.approve": "Roteiro do podcast aprovado",
  "podcast.audio": "Áudio do podcast gerado",
  "podcast.files.cleanup": "Arquivos antigos do podcast apagados do depósito",
  "podcast.publish": "Podcast publicado",
  "podcast.unpublish": "Podcast tirado do ar",
  // tutor
  "tutor.config": "Tutor configurado",
  "tutor.personality": "Professor ligado ou desligado",
  "tutor.voice.approve": "Voz do professor aprovada",
  "tutor.voice.revoke": "Aprovação da voz do professor retirada",
  "tutor.voice_reactions": "Reações de voz do Tutor configuradas",
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
  // Central de Conteúdo (tabela ch_audit, que o Registro passou a juntar: RG01)
  "approve.medical": "Conteúdo aprovado pelo revisor médico",
  "approve.editorial": "Conteúdo aprovado na revisão editorial",
  publish: "Conteúdo publicado para os alunos",
  retire: "Conteúdo retirado do ar",
  "approval.invalidate": "Aprovação do conteúdo desfeita",
  "unit.regenerate": "Conteúdo gerado de novo",
  "unit.new_version": "Nova versão criada para corrigir o conteúdo",
  "unit.import": "Aula pronta importada na Central",
  "unit.material.insert": "Material inserido na unidade",
  "unit.material.retire": "Material retirado da unidade",
  "unit.material.restore": "Material devolvido à lista da unidade",
  "review.sheet_import": "Ficha do revisor médico importada",
  "review.decision": "Decisão do revisor registrada na ficha",
  "publish.distribute": "Conteúdo publicado na aula e nos flashcards dos alunos",
  "evidence.discard": "Evidência descartada na correção",
  "processing.settings": "Teto de gasto por documento alterado",
  "content.clean_references": "Marcas de terceiros tiradas do texto do documento",
  "reviewer.areas": "Áreas do revisor médico definidas",
  "flag.set": "Chave da Central de Conteúdo alterada",
  "guideline_update.save": "Atualização salva",
  "guideline_update.approve": "Atualização aprovada na conferência médica",
  "guideline_update.reject": "Atualização recusada na conferência médica",
  "taxonomy.draft": "Rascunho da taxonomia criado",
  "taxonomy.node": "Item da taxonomia salvo",
  "taxonomy.decide": "Sugestão de item da taxonomia decidida",
  "taxonomy.publish": "Taxonomia publicada",
  "taxonomy.alias_add": "Apelido de tema adicionado",
  "taxonomy.alias_remove": "Apelido de tema removido",
  "document.register": "Documento registrado",
  "document.rights": "Documento atualizado",
  "license.register": "Registro de uso do documento",
  "license.revoke": "Registro de uso do documento retirado",
  "license.clean_references": "Referências do documento limpas",
  "license.undo_clean_references": "Limpeza de referências desfeita",
  "block.resolve": "Trecho do documento resolvido",
  "source.register": "Fonte oficial cadastrada",
  "source.authority": "Nível de autoridade da fonte definido",
  "source.aliases": "Siglas da fonte alteradas",
  "source.registry": "Registro da fonte atualizado",
  "source.change_resolved": "Mudança de fonte resolvida",
  "vigilance.mark": "Vigilância científica: decisão na fila",
  "vigilance.interval": "Vigilância científica: frequência do site",
  "vigilance.quality_override": "Vigilância científica: quarentena decidida",
  "vigilance.identifiers": "Vigilância científica: DOI/PMID corrigido",
  "vigilance.analysis_request": "Vigilância científica: análise do que mudou pedida",
  "vigilance.topic": "Vigilância científica: dossiê do tema",
  "conflict.detect": "Conflitos entre fontes detectados",
  "conflict.resolved": "Conflito entre fontes resolvido",
  "conflict.deferred": "Conflito entre fontes adiado",
  "conflict.open": "Conflito entre fontes reaberto",
  "draft_question.approved": "Questão inédita aprovada",
  "draft_question.needs_changes": "Questão inédita devolvida para ajustes",
  "draft_question.rejected": "Questão inédita recusada",
  "draft_question.reserve": "Questão inédita guardada na reserva (repetida)",
  "draft_question.unreserve": "Questão inédita voltou da reserva para a fila",
  "staziamed.request": "Questões inéditas pedidas",
  "staziamed.check": "Conferência de Questões inéditas pedida",
  "staziamed.source": "Busca de fonte oficial para uma Questão StaziaMed pedida",
  "staziamed.source_accept": "Fontes oficiais aplicadas a uma Questão StaziaMed",
  "staziamed.source_discard": "Proposta de fonte oficial descartada",
  "staziamed.publicada": "Questão StaziaMed publicada",
  "staziamed.republicada": "Questão StaziaMed republicada",
  "staziamed.retired": "Questão StaziaMed recolhida",
  "question_analysis.approved": "Análise da questão aprovada",
  "question_analysis.rejected": "Análise da questão recusada",
  "question_analysis.reanalysis_request": "Reanálise das questões pedida",
  "question_update.no_change": "Atualização de questão: sem mudança",
  "question_update.publish_update": "Atualização de questão publicada",
  "question_update.reject_proposal": "Proposta de atualização de questão recusada",
  "question.confirm_currency": "Questão confirmada como atual",
  // fontes vinculadas da questão (migração 20261003009900): a equipe confirma ou tira o vínculo com o trecho do documento oficial
  "question.source_link_confirmed": "Fonte vinculada confirmada",
  "question.source_link_removed": "Fonte vinculada tirada",
  // carga das explicações (migração 20261003009920)
  "question.comment_approved_exam": "Comentários de uma prova inteira aprovados",
  "question.explanations_released": "Explicações liberadas direto ao aluno (regra B da carga)",
  "question.update_note_saved": "Nota “O que mudou desde a prova” salva",
  "question.update_note_removed": "Nota “O que mudou desde a prova” tirada",
  "question.update_note_approved": "Nota “O que mudou desde a prova” aprovada",
  "question.update_note_returned": "Nota “O que mudou desde a prova” devolvida",
  "job.retry": "Processamento tentado de novo",
  "visual.create": "Material visual criado",
  "visual.keep": "Material visual mantido",
  "visual.version": "Nova versão de material visual",
  "visual.duplicate": "Material visual duplicado",
  "visual.regenerate": "Material visual gerado de novo",
  "visual.medical_review": "Material visual revisado por médico da área",
  // busca de fontes oficiais com IA (migração 20261003009610: sites oficiais, buscas e candidatos a fonte)
  "source_domain.save": "Site oficial salvo",
  "source_search.request": "Busca de fontes pedida",
  "source_search.result": "Busca de fontes concluída",
  "source_candidate.edit": "Candidato a fonte editado",
  "source_candidate.approve": "Candidato a fonte aprovado",
  "source_candidate.reject": "Candidato a fonte rejeitado",
  // pedidos de IA feitos pela tela (migração 20261003009810): análise de questões e conferência de rascunhos inéditos
  "question_analysis.request": "Análise de questões por IA pedida",
  "question_analysis.result": "Análise de questões por IA terminou",
  "draft_check.request": "Conferência de questões inéditas por IA pedida",
  "draft_check.result": "Conferência de questões inéditas por IA terminou",
  "ai_request.cancel": "Pedido de IA cancelado",
  // questões parecidas (migração 20261003009910)
  "similarity.relation.review": "Relação entre questões revisada",
  "similarity.reprocess": "Questões parecidas: reprocessamento pedido",
  "similarity.classify": "Questões parecidas: classificação por IA pedida",
};

// começo do nome técnico → parte da Administração (para uma ação nova que ainda não ganhou nome acima)
const PART = {
  user: "Usuários", plan: "Planos", settings: "Configurações", questions: "Questões", question: "Questões", station: "Estações",
  guideline_update: "Atualizações", lesson: "Aulas", podcast: "Podcasts", tutor: "Tutor", gamification: "Stazia Arena", ai: "Central de IAs",
  similarity: "Questões",
};

// começo do nome técnico → ação da Central de Conteúdo (ch_audit)
const CENTRAL_PART = new Set(["approve", "approval", "publish", "retire", "unit", "reviewer", "flag", "taxonomy", "document", "license", "block", "source", "source_domain", "source_search", "source_candidate", "conflict", "draft_question", "staziamed", "draft_check", "ai_request", "question_analysis", "question_update", "job", "visual"]);

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
  const head = String(entry.action ?? "").split(".")[0];
  const part = own(PART, head);
  if (part) return `Outra ação em ${part}`;
  return CENTRAL_PART.has(head) ? "Outra ação na Central de Conteúdo" : "Outra ação da administração";
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

// comentário da questão decidido pelo revisor médico (Q09): a questão, o que foi decidido e a nota
const commentField = (c) => (/^explanation_[A-D]$/.test(c) ? `explicação da ${c.slice(-1)}` : own({ expected_conduct: "conduta esperada", inep_intent: "o que a questão avalia" }, c));
function commentDecided(d, entry) {
  const fields = (Array.isArray(d.campos) ? d.campos : []).map(commentField).filter(Boolean);
  return join([questionName(entry.target), fields.length > 0 && `${entry.action === "question.comment_approved" ? "Liberado ao aluno" : "Continua escondido do aluno"}: ${fields.join(", ")}`, d.note && `Nota: ${d.note}`]);
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

// nomes das áreas: do cadastro de atualizações (CLINICA_MEDICA…) e do cadastro de revisores (CIRURGIA, MFC)
const AREA_NAME = {
  CLINICA_MEDICA: "Clínica Médica", CIRURGIA_GERAL: "Cirurgia Geral", CIRURGIA: "Cirurgia Geral", GINECOLOGIA_OBSTETRICIA: "Gineco & Obstetrícia",
  PEDIATRIA: "Pediatria", MEDICINA_FAMILIA_COMUNIDADE: "Medicina de Família e Comunidade", MFC: "Medicina de Família e Comunidade",
  SAUDE_MENTAL: "Saúde Mental", SAUDE_COLETIVA: "Saúde Coletiva", // áreas só de revisor médico (taxonomia da Central, …1400)
};
// chaves da Central de Conteúdo (a tela de Configuração da Central usa estes nomes)
const FLAG_NAME = { enabled: "Central de Conteúdo", ai_enabled: "IA da Central", shadow_mode: "Modo sombra", publish_enabled: "Publicação", auto_analysis_enabled: "Análise automática", notebook_provider_enabled: "Provedor NotebookLM" };
// fontes vinculadas: a questão, o documento, qual referência, o papel, a página e (ao tirar) o motivo
const LINK_TEMPORAL = { vigente: "Referência atual", historica: "Versão da época da prova" };
const LINK_ROLE = { diagnostico: "Diagnóstico", conduta: "Conduta", exame: "Exame", tratamento: "Tratamento", prevencao: "Prevenção", conceito: "Conceito", outro: "Outro" };
const sourceLinkSummary = (d, entry) =>
  join([
    questionName(entry.target),
    typeof d.source === "string" && d.source.trim() && `Fonte: ${d.source.trim()}`,
    own(LINK_TEMPORAL, d.temporal),
    own(LINK_ROLE, d.role),
    d.page && `Página: ${d.page}`,
    typeof d.reason === "string" && d.reason.trim() && `Motivo: ${d.reason.trim()}`,
  ]);
const noteOf = (d, label = "Nota") => (typeof d.note === "string" && d.note.trim() ? `${label}: ${d.note.trim()}` : "");
const whyOf = (d) => (typeof (d.reason ?? d.why) === "string" && String(d.reason ?? d.why).trim() ? `Motivo: ${String(d.reason ?? d.why).trim()}` : "");
const versionOf = (entry) => (entry.target && /^\d+$/.test(String(entry.target)) ? `Versão ${entry.target}` : "");
const guidelineDecision = (d) => join([topic(d), noteOf(d, "Nota do revisor"), d.unpublished && "Saiu do ar"]);

// busca de fontes oficiais: nomes em português dos valores que a migração 9610 grava
const DOMAIN_KIND = { governo: "governo", internacional: "organização internacional", sociedade: "sociedade médica" };
// atualidade da fonte achada pela busca (migração 9820): os mesmos nomes da tela de candidatos
const CURRENCY_LABEL = { versao_mais_nova: "versão mais nova que a da biblioteca", mesma_versao: "mesma versão da biblioteca", versao_mais_antiga: "mais antiga que a da biblioteca", outra_mais_nova: "outra mais nova do mesmo tema achada pela IA", data_nao_comprovada: "data não comprovada", sem_comparacao: "documento novo na biblioteca" };
const SEARCH_ORIGIN = { tema: "Tema escrito pelo administrador", incidencia: "Tema mais cobrado nas provas" };
const SEARCH_STATUS = {
  na_fila: "Na fila", buscando: "Buscando", conferindo: "Conferindo os links", concluida: "Busca concluída",
  nada_encontrado: "Nada encontrado", pendente: "Busca pendente", falhou: "Busca falhou",
};
const CANDIDATE_FIELD = {
  institution: "instituição", title: "título", version: "versão", published_on: "data de publicação", kind: "tipo",
  nature: "natureza", level: "nível", area: "área", theme: "tema", valid_until: "vigência",
};

const REQUEST_RESULT = { concluido: "Concluído", falhou: "Falhou" };
const DRAFT_LAYER = { software: "regras", sources: "fontes oficiais", currency: "atualidade", redteam: "revisão clínica" };
const aiRequestBase = (d, noun) => join([count(d.items, noun[0], noun[1]), d.estimate_usd != null && `custo estimado ${usd(d.estimate_usd)}`]);
const aiRequestResult = (d, noun) =>
  join([
    own(REQUEST_RESULT, d.status),
    d.done != null && `${d.done} de ${d.items} ${noun}`,
    d.calls != null && count(d.calls, "chamada de IA", "chamadas de IA"),
    d.cost_usd != null && `custo ${usd(d.cost_usd)}`,
    typeof d.message === "string" && d.message.trim() && `Aviso: ${d.message.trim()}`,
  ]);

const SUMMARY = {
  "user.role": (d, entry) => join([person(entry), `${ROLE_LABEL[d.from] ?? d.from} → ${ROLE_LABEL[d.to] ?? d.to}`]),
  "user.subscription": (d, entry) => join([person(entry), `${PLAN_LABEL[d.to?.plan] ?? d.to?.plan} · ${SUB_STATUS_LABEL[d.to?.status] ?? d.to?.status}`]),
  "user.delete": (d) => d.email,
  "plan.save": (d, entry) =>
    entry.target === "trial"
      ? `${PLAN_LABEL.trial} · ${d.active ? "oferta de teste no cadastro ligada" : "oferta de teste no cadastro desligada"}`
      : `${PLAN_LABEL[entry.target] ?? entry.target}${d.active ? " · marcado para venda" : ""}`,
  "plan.benefits": (d) => {
    const to = d.to ?? {};
    return join([
      to.elite_voice_daily_minutes != null ? `Voz do Tutor no Elite: ${to.elite_voice_daily_minutes} min por dia` : "Voz do Tutor no Elite: igual ao Pro",
      `Correção de estação com devolutiva (só Elite): ${to.elite_station_feedback ? "ligada" : "desligada"}`,
    ]);
  },
  "settings.save": (d) =>
    join([
      d.trial_days != null && `Dias de teste grátis: ${d.trial_days}`,
      d.simulado_ineditas_pct != null && `Questões Inéditas nos simulados: até ${d.simulado_ineditas_pct}%`,
      d.announcement && `Aviso no Início ${d.announcement.active ? "ligado" : "desligado"}${d.announcement.title ? `: ${d.announcement.title}` : ""}`,
    ]),
  "support.contact": (d) => d.email && `E-mail de suporte: ${d.email}`,
  "report.resolve": (d) => join([d.resolved === false ? "Relato reaberto" : "Relato marcado como resolvido", d.screen && `Tela: ${d.screen}`]),
  "questions.import": (d) =>
    join([
      count(d.inserted, "nova", "novas"),
      count(d.updated, "atualizada", "atualizadas"),
      count(d.skipped, "pulada", "puladas"),
      Number(d.answer_differs) > 0 && `${d.answer_differs} com gabarito ou situação diferente (${Number(d.answer_differs) === 1 ? "não mudou" : "não mudaram"})`,
    ]),
  "question.inserted": questionSaved,
  "question.updated": questionSaved,
  "source.check_request": (d) => d.sources != null && `${d.sources} fonte(s) monitorada(s)`,
  "source.audience": (d) => join([d.title, d.to === "complementar" ? "Fonte complementar: o aluno não vê esta fonte" : "Fonte oficial", d.reason && `Motivo: ${d.reason}`]),
  // apagar: o código e o tema que o banco guardou (a questão já não existe); análise tirada do ar: o texto mudou
  "question.delete": (d, entry) => join([d.code ?? entry.target, d.topic]),
  "question.analysis_unpublished": (d, entry) => `${entry.target}: o enunciado ou o texto de uma alternativa mudou`,
  "question.figure_set": (d, entry) => join([d.code ?? questionName(entry.target), d.replaced ? "Figura trocada" : "Figura nova", d.alt && `Texto alternativo: ${d.alt}`]),
  "question.figure_removed": (d, entry) => join([d.code ?? questionName(entry.target), d.needs_image ? "A questão cita uma figura: saiu dos treinos até uma nova figura ser enviada" : "A questão continua nos treinos, sem figura"]),
  "question.comment_approved": commentDecided,
  "question.comment_returned": commentDecided,
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
  "lesson.format": (d, entry) => d.title ?? entry.title,
  "lesson.audio.release": (d, entry) => entry.title,
  "lesson.review": (d, entry) => join([d.title ?? entry.title, d.note && `Conferido: ${d.note}`]),
  "lesson.delete": (d, entry) => entry.title,
  "lesson.file.delete": (d, entry) => join([entry.title && `Aula: ${entry.title}`, d.path && `Arquivo apagado: ${d.path}`]),
  "lesson.material": (d, entry) => join([entry.title && `Aula: ${entry.title}`, d.title && `Material: ${d.title}`, d.aguardando_conferencia && "Áudio aguardando conferência"]),
  "podcast.save": (d, entry) => d.title ?? entry.title,
  "podcast.delete": (d, entry) => entry.title,
  "podcast.publish": (d, entry) => entry.title,
  "podcast.unpublish": (d, entry) => entry.title,
  "podcast.source_rename": (d, entry) => entry.title,
  "podcast.source": (d, entry) => join([entry.title && `Episódio: ${entry.title}`, d.title && `Fonte: ${d.title}`]),
  "podcast.source_complementar": (d, entry) =>
    join([entry.title && `Episódio: ${entry.title}`, d.title && `Fonte: ${d.title}`, d.to === "complementar" ? "Fonte complementar: o aluno não vê esta fonte" : "Fonte oficial: o aluno volta a ver esta fonte"]),
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
  // P08: o que saiu do depósito quando um áudio deixou de valer, uma fonte foi tirada ou o episódio foi apagado (só o que nenhuma linha do banco usava)
  "podcast.files.cleanup": (d, entry) =>
    join([
      entry.title,
      Number(d.audios) > 0 && `${count(d.audios, "áudio antigo apagado", "áudios antigos apagados")}`,
      Number(d.fontes) > 0 && `${count(d.fontes, "arquivo de fonte apagado", "arquivos de fonte apagados")}`,
      Array.isArray(d.arquivos) && d.arquivos.length > 0 && `Arquivos: ${d.arquivos.join(", ")}`,
      Number(d.falhas) > 0 && `${count(d.falhas, "arquivo não pôde ser apagado agora", "arquivos não puderam ser apagados agora")} (nova tentativa na próxima ação do episódio)`,
    ]),
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
  // Central de Conteúdo: o título do conteúdo, do documento e da fonte vem do banco (entry.title)
  "approve.medical": (d, entry) => entry.title,
  "approve.editorial": (d, entry) => entry.title,
  publish: (d, entry) => entry.title,
  retire: (d, entry) => join([entry.title, whyOf(d)]),
  "approval.invalidate": (d, entry) => join([entry.title, whyOf(d)]),
  "unit.regenerate": (d, entry) => entry.title,
  "reviewer.areas": (d, entry) => {
    const areas = (Array.isArray(d.areas) ? d.areas : []).map((code) => own(AREA_NAME, code) ?? "outra área");
    return join([person(entry), areas.length ? `Áreas: ${areas.join(", ")}` : "Deixou de ser revisora ou revisor médico"]);
  },
  "flag.set": (d, entry) => join([own(FLAG_NAME, entry.target) ? `${FLAG_NAME[entry.target]}: ${d.to ? "ligada" : "desligada"}` : d.to ? "Ligada" : "Desligada", whyOf(d)]),
  "guideline_update.save": (d) =>
    join([
      topic(d),
      d.area_de && d.area_para && `Área: ${own(AREA_NAME, d.area_de) ?? "outra área"} → ${own(AREA_NAME, d.area_para) ?? "outra área"}`,
      d.review_reset && "Conferência voltou para pendente",
      d.unpublished && "Saiu do ar",
    ]),
  "guideline_update.approve": guidelineDecision,
  "guideline_update.reject": guidelineDecision,
  "taxonomy.draft": (d, entry) => versionOf(entry),
  "taxonomy.publish": (d, entry) => versionOf(entry),
  "taxonomy.node": (d) => d.name,
  "taxonomy.decide": (d) => (d.approved === true ? "Aprovado" : d.approved === false ? "Recusado" : ""),
  "taxonomy.alias_add": (d) => d.alias && `Apelido: ${d.alias}`,
  "taxonomy.alias_remove": (d) => d.alias && `Apelido: ${d.alias}`,
  "document.register": (d, entry) => entry.title,
  "document.rights": (d, entry) => entry.title,
  "source.register": (d, entry) => entry.title ?? d.title,
  "source.authority": (d, entry) => entry.title,
  "source.aliases": (d, entry) => join([entry.title, Array.isArray(d.aliases) && d.aliases.length ? `Siglas: ${d.aliases.join(", ")}` : "Sem siglas"]),
  "source.registry": (d, entry) => entry.title,
  "source.change_resolved": (d, entry) => join([entry.title, noteOf(d)]),
  "source_domain.save": (d) =>
    join([
      d.address,
      d.institution,
      own(DOMAIN_KIND, d.kind) && `Tipo: ${DOMAIN_KIND[d.kind]}`,
      d.created === true ? "Site novo" : d.created === false && "Site alterado",
      d.active === true ? "ativo na busca" : d.active === false && "fora da busca",
    ]),
  "source_search.request": (d) =>
    join([
      d.theme && `Tema: ${d.theme}`,
      `Área: ${d.area ? (own(AREA_NAME, d.area) ?? "outra área") : "todas as áreas"}`,
      d.free_text && `Pedido: ${d.free_text}`,
      own(SEARCH_ORIGIN, d.origin),
    ]),
  "source_search.result": (d) =>
    join([
      own(SEARCH_STATUS, d.status),
      d.found_count != null && `${count(d.found_count, "link achado", "links achados")}, ${count(d.verified_count, "conferido", "conferidos")}, ${count(d.discarded_count, "descartado", "descartados")}`,
      d.web_searches != null && count(d.web_searches, "busca na internet", "buscas na internet"),
      d.cost_usd != null && `custo ${usd(d.cost_usd)}`,
      own(PROVIDER_NAME, d.provider) && `IA: ${PROVIDER_NAME[d.provider]}${d.model ? ` (${d.model})` : ""}`,
      typeof d.message === "string" && d.message.trim() && `Aviso: ${d.message.trim()}`,
    ]),
  "source_candidate.edit": (d) => {
    const fields = Object.keys(d.fields && typeof d.fields === "object" ? d.fields : {}).map((k) => own(CANDIDATE_FIELD, k)).filter(Boolean);
    return fields.length ? `Dados ajustados: ${fields.join(", ")}` : "";
  },
  "source_candidate.approve": (d) =>
    join([
      d.site && `Site: ${d.site}`,
      d.level && `Nível ${d.level}`,
      d.superseded && "Substituiu uma versão anterior da fonte",
      own(CURRENCY_LABEL, d.currency) && `Atualidade: ${CURRENCY_LABEL[d.currency]}`,
      d.confirmed_older === true && "Versão mais antiga aprovada com confirmação",
    ]),
  "source_candidate.reject": (d) => join([d.site && `Site: ${d.site}`, whyOf(d)]),
  "question_analysis.request": (d) =>
    join([aiRequestBase(d, ["questão", "questões"]), d.exam && `Prova: ${d.exam}`, d.area && `Área: ${own(AREA_NAME, d.area) ?? "outra área"}`, d.only_missing === false && "Refazendo também as que já tinham análise"]),
  "question_analysis.result": (d) => aiRequestResult(d, "questões"),
  "draft_check.request": (d) =>
    join([
      aiRequestBase(d, ["rascunho", "rascunhos"]),
      d.batch && `Lote: ${d.batch}`,
      d.area && `Área: ${own(AREA_NAME, d.area) ?? "outra área"}`,
      Array.isArray(d.layers) && `Camadas: ${d.layers.map((l) => own(DRAFT_LAYER, l) ?? "outra").join(", ")}`,
      d.recheck && "Conferindo de novo",
    ]),
  "draft_check.result": (d) => aiRequestResult(d, "rascunhos"),
  "ai_request.cancel": (d) => (d.kind === "draft_check" ? count(d.items, "rascunho", "rascunhos") : count(d.items, "questão", "questões")),
  "block.resolve": () => "",
  "conflict.detect": (d) => d.new != null && count(d.new, "novo", "novos"),
  "conflict.resolved": (d) => noteOf(d, "Motivo"),
  "conflict.deferred": (d) => noteOf(d, "Motivo"),
  "conflict.open": (d) => noteOf(d, "Motivo"),
  "question_analysis.approved": (d) => d.question && questionName(d.question),
  "question_analysis.rejected": (d) => d.question && questionName(d.question),
  "question_analysis.reanalysis_request": (d) => d.waiting != null && `${d.waiting} questão(ões) esperando`,
  "question_update.no_change": (d) => join([d.question && questionName(d.question), noteOf(d)]),
  "question_update.publish_update": (d) => join([d.question && questionName(d.question), noteOf(d)]),
  "question_update.reject_proposal": (d) => join([d.question && questionName(d.question), noteOf(d)]),
  "question.confirm_currency": (d, entry) => join([questionName(entry.target), noteOf(d)]),
  "question.source_link_confirmed": (d, entry) => sourceLinkSummary(d, entry),
  "question.source_link_removed": (d, entry) => sourceLinkSummary(d, entry),
  "question.comment_approved_exam": (d) => join([typeof d.prova === "string" && d.prova, Number.isFinite(d.aprovadas) && `${d.aprovadas} questões`, noteOf(d)]),
  "question.explanations_released": (d) => join([Number.isFinite(d.liberadas) && `${d.liberadas} questões`]),
  "question.update_note_saved": (d, entry) => join([questionName(entry.target)]),
  "question.update_note_removed": (d, entry) => join([questionName(entry.target)]),
  "question.update_note_approved": (d, entry) => join([questionName(entry.target), noteOf(d)]),
  "question.update_note_returned": (d, entry) => join([questionName(entry.target), noteOf(d, "Motivo")]),
  "gamification.achievement": (d) => d.name,
  "gamification.mission": (d) => d.title,
  "gamification.reward": (d) => d.name,
  "ai.provider": (d, entry) => `${own(PROVIDER_NAME, entry.target) ?? "IA"}: ${d.enabled ? "ligada" : "desligada"}`,
  "ai.function": (d, entry) => join([own(AI_FUNCTION_NAME, entry.target), d.removed && "configuração apagada (volta ao padrão do servidor)"]),
  "ai.settings": (d) =>
    join([
      "monthly_cap_usd" in d && `Teto do mês: ${cap(d.monthly_cap_usd)}`,
      "per_run_cap_usd" in d && `Teto por chamada: ${cap(d.per_run_cap_usd)}`,
      "overall_monthly_cap_usd" in d && `Teto geral do mês: ${cap(d.overall_monthly_cap_usd)}`,
      "overall_cap_enabled" in d && `Teto geral ${d.overall_cap_enabled ? "ligado (só avisa)" : "desligado"}`,
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
