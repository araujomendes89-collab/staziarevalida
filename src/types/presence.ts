export type PresenceStatus = "ONLINE" | "OFFLINE" | "IN_STATION" | "SEARCHING";

export type PresenceCategory = "COLLEAGUES" | "PAID_ACTORS" | "OPEN_ROOMS";

export interface PresenceUser {
  id: string;
  name: string;
  displayName: string;
  avatarUrl?: string;
  category: PresenceCategory;
  status: PresenceStatus;
  statusText: string;
  university?: string;
  targetEdition?: string;
  currentStationId?: string;
  currentStationTitle?: string;
  lastActive: string;
  isPaidActor?: boolean;
  pricePerHour?: string;
}

export interface PresenceSettings {
  isOnline: boolean;
  radarActive: boolean;
  allowInvites: boolean;
  activeCategory: PresenceCategory;
}

export interface StudyInvite {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  stationId: string;
  stationTitle: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  createdAt: string;
  respondedAt?: string;
}

export interface PresencePayload {
  id: string;
  name: string;
  displayName?: string;
  avatarUrl?: string | null;
  university?: string;
  targetEdition?: string;
}

