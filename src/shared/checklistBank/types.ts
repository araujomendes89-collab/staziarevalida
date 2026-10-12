/**
 * Banco de Checklists — tipos compartilhados entre cliente e servidor.
 * Especificação: checklists-pack/docs/especificacao-banco-checklists-simulados.md
 */

export const STATION_AREAS = [
  "Clínica Médica",
  "Cirurgia Geral",
  "Pediatria",
  "Ginecologia e Obstetrícia",
  "Medicina de Família e Comunidade",
] as const;

export type StationArea = (typeof STATION_AREAS)[number];

/** Nível escolhido pelo avaliador em um item do checklist. */
export type ChecklistGrade = "Correct" | "Partial" | "Incorrect";

/** Regra de sugestão automática de nível a partir dos subitens marcados. */
export type AutoGradeRule = "all/half/none";

/** Conteúdo clínico autoral precisa de revisão médica antes de chegar aos alunos. */
export type MedicalReviewStatus = "pending" | "approved";

export interface ChecklistSubitem {
  id: string;
  text: string;
}

export interface ChecklistItem {
  id: string;
  order: number;
  /** Etapa da estação (Apresentação, Anamnese, Exames…), usada para agrupar e relatar. */
  phase: string;
  content: string;
  /** "Saiba mais". */
  tip: string;
  /** Valor de cada nível; `partial: null` = item de 2 níveis. */
  grades: { correct: number; partial: number | null; incorrect: number };
  criteria: { correct: string; partial?: string; incorrect: string };
  subitems: ChecklistSubitem[];
  auto_grade_rule: AutoGradeRule | null;
}

/** Impresso (exame, imagem, tabela) que o ator libera durante a estação. */
export interface Pressing {
  id: string;
  name: string;
  content: string;
  image_url: string | null;
  /**
   * Treino em Dupla (pacote de 11/10), todos opcionais. Sem eles: `source_number` = `display_number` = posição na lista
   * (1, 2, 3…) e `initially_visible` = false (ver `pressingNumbers`).
   * `source_number`: número do impresso no documento oficial da prova (só o avaliador o vê).
   */
  source_number?: number | null;
  /** Número que a pessoa vê na tela ("Impresso 1"); pode diferir do `source_number`. */
  display_number?: number | null;
  /** Impresso visível desde o início da estação (ex.: o relato do caso); não depende de liberação do avaliador. */
  initially_visible?: boolean;
}

export interface SummaryTopic {
  topic: string;
  summary: string;
}

/** Versão enxuta para o catálogo (sem roteiro, impressos nem checklist). */
export interface StationLite {
  id: string;
  name: string;
  topic: string;
  area: StationArea;
  setting: string | null;
  taxonomy_path: string[];
  goal: string;
  /** "INEP" → estação oficial; null → autoral. */
  institution: string | null;
  year: string | null;
  styles: string[];
  is_pro_only: boolean;
  medical_review: MedicalReviewStatus;
  max_score: number;
  duration_ms: number;
  created_at: string;
}

export interface Station extends StationLite {
  actor_script: string;
  doctor_scene: string;
  doctor_tasks: string;
  pressings: Pressing[];
  checklist_items: ChecklistItem[];
  summary: SummaryTopic[];
}

/** Resposta do avaliador para um item. */
export interface ChecklistAnswer {
  id: string;
  grade: ChecklistGrade;
  subitems: string[];
}

export interface ReleasedPressing {
  id: string;
  /** ms desde started_at */
  time: number;
}

export interface StudySession {
  id: string;
  station_id: string;
  room_id: string;
  schedule_id: string | null;
  event_id: string | null;
  actor_id: string;
  doctor_id: string;
  started_at: string;
  finished_at: string;
  pressings_released: ReleasedPressing[];
  checklist_answers: ChecklistAnswer[];
  score: number;
  max_score: number;
  /** % de 0 a 100 */
  correctness: number;
  actor_notes: string;
  created_at: string;
}

/** Item do histórico usado pelos filtros do catálogo (feita / não feita / reprovada). */
export interface StudySessionSummary {
  id: string;
  station_id: string;
  role: "doctor" | "actor";
  correctness: number;
  failed: boolean;
  finished_at: string;
}

export interface ScheduleEntry {
  station_id: string;
  checklist_bank_study_session_id: string | null;
  correctness: number | null;
  was_done: boolean;
  maximum_duration: number;
  show_clock: boolean;
  checklist_bank_event_id: string | null;
}

export interface StudySchedule {
  id: string;
  user_id: string;
  event_id: string | null;
  mode: "Classic";
  sessions: ScheduleEntry[];
  created_at: string;
}

/** Simulado. */
export interface ChecklistEvent {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  station_ids: string[];
  cover_url: string | null;
  is_pro_only: boolean;
  type: "Public";
}

export type EventStatus = "ongoing" | "upcoming" | "expired";

export interface ChecklistEventSummary extends ChecklistEvent {
  status: EventStatus;
  stations_count: number;
  confirmed_users_count: number;
  /** O usuário atual pode abrir todas as estações (plano Pro / revisão médica)? */
  accessible: boolean;
}

export interface EventParticipant {
  user: { id: string; name: string };
  confirmed_at: string;
  schedule_id: string | null;
  sessions_ids: string[];
  count_sessions: number;
  /** % média das sessões concluídas; null se ainda não concluiu nenhuma. */
  correctness: number | null;
}

export interface ChecklistEventDetail extends ChecklistEventSummary {
  was_confirmed: boolean;
  participants: EventParticipant[];
}

/** Estado da sala de estudo em dupla (spec §5.3). */
export type RoomStatus =
  | "Idle"
  | "WaitingActorChooseStation"
  | "WaitingActorStartStation"
  | "OnStation"
  | "OnReview";

export interface RoomSessionState {
  station_id: string;
  allowed_pressings: ReleasedPressing[];
  checklists: ChecklistAnswer[];
  started_at: string | null;
  finished_at: string | null;
  paused_at: string | null;
  /** ms acumulados em pausas já encerradas */
  paused_total_ms: number;
  is_paused: boolean;
  show_clock: boolean;
  maximum_duration: number;
  /** Observações do ator (máx. 1000 caracteres), anexadas ao resultado do médico. */
  actor_notes: string;
  checklist_bank_event_id: string | null;
  /** Preenchido quando o médico finaliza e o servidor salva a sessão. */
  saved_session_id: string | null;
}

export interface RoomState {
  id: string;
  status: RoomStatus;
  roles: { actor_id: string; doctor_id: string } | null;
  session: RoomSessionState | null;
  schedule: {
    id: string;
    mode: "Classic";
    sessions: ScheduleEntry[];
  } | null;
}

export interface PublicProfile {
  id: string;
  name: string;
  avatarSeed: string | null;
}

/**
 * Corpo do POST /study-sessions. Só o id da sala: respostas, impressos, horários,
 * papéis e observações são lidos pelo servidor do documento da sala (onde só o ator
 * escreve), e a nota é recalculada a partir dos `grades` da estação.
 */
export interface FinishStudySessionRequest {
  room_id: string;
}

export interface FinishStudySessionResponse {
  id: string;
  score: number;
  max_score: number;
  correctness: number;
}
