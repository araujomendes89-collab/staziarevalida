export type DuoParticipantRole = "DOCTOR" | "EVALUATOR";

export type DuoItemScoreStatus = "ADEQUATE" | "PARTIAL" | "INADEQUATE" | "UNCHECKED";

export interface DuoChecklistScore {
  itemId: string;
  itemDescription: string;
  status: DuoItemScoreStatus;
  pointsAwarded: number;
  maxPoints: number;
  notes?: string;
  scoredAt?: string;
}

export interface DuoChatMessage {
  id: string;
  sender: "doctor" | "evaluator" | "system";
  senderName: string;
  text: string;
  time: string;
}

export interface DuoSession {
  id: string;
  stationId: string;
  stationTitle: string;
  stationArea: string;
  doctorUserId: string;
  doctorName: string;
  evaluatorUserId: string;
  evaluatorName: string;
  status: "LOBBY" | "IN_PROGRESS" | "COMPLETED";
  startedAt?: number; // epoch ms for synchronized countdown
  timeLimitSeconds: number;
  checklistScores: Record<string, DuoChecklistScore>;
  totalScore: number;
  maxScore: number;
  chatMessages: DuoChatMessage[];
  revealedExams: string[]; // Exams released by the evaluator
  audioState?: {
    doctorMuted?: boolean;
    evaluatorMuted?: boolean;
  };
  createdAt: string;
  updatedAt?: any;
}

export interface RadarPoolEntry {
  userId: string;
  name: string;
  university?: string;
  targetEdition?: string;
  targetStationId?: string;
  status: "SEARCHING" | "MATCHED";
  matchedSessionId?: string;
  matchedPartnerName?: string;
  joinedAt: string;
}
