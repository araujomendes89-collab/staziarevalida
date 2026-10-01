import { ScheduledDayItem } from "../types/adaptiveCalendar";
import { StudyMission, UserProfile } from "../types";
import { DEFAULT_USER } from "./storageService";

export class CalendarService {
  /**
   * Generates a Google Calendar direct event creation URL for study sessions
   */
  static generateGoogleCalendarUrl(params: {
    title: string;
    description: string;
    startDate: Date;
    durationMinutes: number;
    location?: string;
  }): string {
    const { title, description, startDate, durationMinutes, location = "StaziaMed Revalida / Sala de Estudos Online" } = params;

    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

    const formatGCalDate = (date: Date) => {
      return date.toISOString().replace(/-|:|\.\d+/g, "");
    };

    const startFormatted = formatGCalDate(startDate);
    const endFormatted = formatGCalDate(endDate);

    const baseUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE";
    const textParam = `&text=${encodeURIComponent(`[StaziaMed Revalida] ${title}`)}`;
    const datesParam = `&dates=${startFormatted}/${endFormatted}`;
    const detailsParam = `&details=${encodeURIComponent(description)}`;
    const locationParam = `&location=${encodeURIComponent(location)}`;

    return `${baseUrl}${textParam}${datesParam}${detailsParam}${locationParam}`;
  }

  /**
   * Generates a standard .ICS iCalendar file for 1-click import into Google Calendar, Apple Calendar, Outlook
   */
  static generateIcsFile(params: {
    title: string;
    description: string;
    startDate: Date;
    durationMinutes: number;
    location?: string;
  }): string {
    const { title, description, startDate, durationMinutes, location = "StaziaMed Revalida" } = params;
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

    const formatIcsDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//StaziaMed Revalida//Study Planner//PT",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:praxis-${Date.now()}@revalida.staziamed.com`,
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART:${formatIcsDate(startDate)}`,
      `DTEND:${formatIcsDate(endDate)}`,
      `SUMMARY:[StaziaMed Revalida] ${title}`,
      `DESCRIPTION:${description.replace(/\n/g, "\\n")}`,
      `LOCATION:${location}`,
      "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Lembrete de Estudo Revalida",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  }

  /**
   * Generates a complete multi-day schedule .ICS file covering all planned calendar blocks
   */
  static generateScheduleIcs(scheduleDays: ScheduledDayItem[], user: UserProfile): string {
    const formatIcsDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    const events: string[] = [];

    scheduleDays.forEach((day, dayIndex) => {
      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() + dayIndex);

      day.blocks.forEach((block, blockIndex) => {
        const startDate = new Date(baseDate);
        startDate.setHours(9 + blockIndex * 2, 0, 0, 0); // Stagger blocks
        const durationMin = block.durationMinutes || 30;
        const endDate = new Date(startDate.getTime() + durationMin * 60000);

        events.push(
          [
            "BEGIN:VEVENT",
            `UID:praxis-day-${day.id}-${block.id}@revalida.staziamed.com`,
            `DTSTAMP:${formatIcsDate(new Date())}`,
            `DTSTART:${formatIcsDate(startDate)}`,
            `DTEND:${formatIcsDate(endDate)}`,
            `SUMMARY:[Revalida] ${block.title}`,
            `DESCRIPTION:${block.description || block.title}\\nÁrea: ${day.primaryArea}\\nMeta INEP: +${(day.expectedScoreGain || 0).toFixed(1)} pts`,
            `LOCATION:StaziaMed Revalida (${day.primaryTopicName})`,
            "STATUS:CONFIRMED",
            "END:VEVENT",
          ].join("\r\n")
        );
      });
    });

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `X-WR-CALNAME:Cronograma Revalida - ${user.name}`,
      "PRODID:-//StaziaMed Revalida//Adaptive Calendar//PT",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      ...events,
      "END:VCALENDAR",
    ].join("\r\n");
  }

  /**
   * Triggers download of the generated .ics file
   */
  static downloadIcsFile(filename: string, icsContent: string): void {
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Generates Google Calendar URL from a ScheduledDayItem
   */
  static createGoogleCalendarEventUrl(day: ScheduledDayItem): string {
    const startDate = new Date();
    startDate.setHours(9, 0, 0, 0);

    const description = `[StaziaMed Revalida] Treino Diário: ${day.primaryTopicName}\n` +
      `Área: ${day.primaryArea}\n` +
      `Ganho Estimado: +${(day.expectedScoreGain || 0).toFixed(1)} pontos no INEP\n\n` +
      `Blocos de Treino:\n` +
      (day.blocks || []).map((b, i) => `${i + 1}. ${b.title} (${b.durationMinutes} min) - ${b.description}`).join("\n");

    return this.generateGoogleCalendarUrl({
      title: `Treino Revalida: ${day.primaryTopicName}`,
      description,
      startDate,
      durationMinutes: day.allocatedMinutes || 120,
    });
  }

  /**
   * Generates and triggers download of .ICS for schedule days
   */
  static downloadCalendarICS(scheduleDays: ScheduledDayItem[], user?: UserProfile): void {
    const activeUser = user || DEFAULT_USER;
    const icsContent = this.generateScheduleIcs(scheduleDays, activeUser);
    this.downloadIcsFile("cronograma-revalida-2026.ics", icsContent);
  }

  /**
   * Directly creates an event in the user's primary Google Calendar via Google Calendar API REST
   */
  static async createDirectCalendarEvent(params: {
    accessToken: string;
    title: string;
    description: string;
    startDate: Date;
    durationMinutes: number;
    location?: string;
  }): Promise<{ success: boolean; eventId?: string; htmlLink?: string; error?: string }> {
    const { accessToken, title, description, startDate, durationMinutes, location = "StaziaMed Revalida" } = params;
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

    try {
      const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: `[StaziaMed Revalida] ${title}`,
          description,
          location,
          start: {
            dateTime: startDate.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
          },
          end: {
            dateTime: endDate.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 15 },
              { method: "email", minutes: 60 },
            ],
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const createdEvent = await response.json();
      return {
        success: true,
        eventId: createdEvent.id,
        htmlLink: createdEvent.htmlLink,
      };
    } catch (err: any) {
      console.error("Failed to create Google Calendar event via API:", err);
      return {
        success: false,
        error: err.message || "Falha ao comunicar com a API do Google Calendar",
      };
    }
  }

  /**
   * Syncs multiple schedule blocks to Google Calendar directly via OAuth access token
   */
  static async syncScheduleToGoogleCalendarApi(
    accessToken: string,
    scheduleDays: ScheduledDayItem[]
  ): Promise<{ totalCreated: number; errors: number }> {
    let totalCreated = 0;
    let errors = 0;

    for (let dayIndex = 0; dayIndex < Math.min(scheduleDays.length, 7); dayIndex++) {
      const day = scheduleDays[dayIndex];
      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() + dayIndex);

      for (let blockIndex = 0; blockIndex < day.blocks.length; blockIndex++) {
        const block = day.blocks[blockIndex];
        const startDate = new Date(baseDate);
        startDate.setHours(9 + blockIndex * 2, 0, 0, 0);

        const result = await this.createDirectCalendarEvent({
          accessToken,
          title: `${block.title} (${day.primaryArea})`,
          description: `Bloco: ${block.title}\n` +
            `Tipo: ${block.type}\n` +
            `Meta: Ganho de +${(day.expectedScoreGain || 0).toFixed(1)} pts no INEP\n` +
            `Detalhes: ${block.description || block.title}\n\n` +
            `Acesse o StaziaMed Revalida para iniciar a sessão com IA.`,
          startDate,
          durationMinutes: block.durationMinutes || 30,
        });

        if (result.success) {
          totalCreated++;
        } else {
          errors++;
        }
      }
    }

    return { totalCreated, errors };
  }

  /**
   * Syncs a single study mission into Google Calendar via URL or iCal
   */
  static syncMissionToGoogleCalendar(mission: StudyMission, user: UserProfile): void {
    const startDate = new Date();
    startDate.setHours(startDate.getHours() + 1, 0, 0, 0);

    const description = `Missão Adaptativa do Dia: ${mission.title}\n` +
      `Área: ${mission.targetArea}\n` +
      `Foco Clínico: ${mission.focusTopic}\n` +
      `Raciocínio INEP: ${mission.rationale}\n\n` +
      `Tarefas:\n` +
      mission.tasks.map((t, idx) => `${idx + 1}. ${t.description} (${t.minutes} min)`).join("\n") +
      `\n\nAcesse o StaziaMed Revalida para iniciar seu treino com IA.`;

    const gcalUrl = this.generateGoogleCalendarUrl({
      title: mission.title,
      description,
      startDate,
      durationMinutes: mission.estimatedMinutes || 60,
    });

    window.open(gcalUrl, "_blank", "noopener,noreferrer");
  }
}
