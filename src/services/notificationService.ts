/**
 * NotificationService
 * Provides browser Web Push / native background notifications and Web Audio API
 * harmonic sound chimes for real-time duo study invites and radar matches.
 */

export type NotificationSoundType = "invite" | "match" | "timer_warning" | "success";

export class NotificationService {
  private static audioCtx: AudioContext | null = null;

  /**
   * Request system notification permissions from the candidate's browser
   */
  static async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "denied";
    }

    if (Notification.permission === "granted") {
      return "granted";
    }

    try {
      return await Notification.requestPermission();
    } catch (e) {
      console.warn("[NotificationService] Permission request failed:", e);
      return "denied";
    }
  }

  /**
   * Dispatches a native OS/browser notification if the tab is in background or hidden
   */
  static sendBackgroundNotification(
    title: string,
    options: {
      body?: string;
      icon?: string;
      badge?: string;
      tag?: string;
      silent?: boolean;
    } = {}
  ): boolean {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }

    if (Notification.permission !== "granted") {
      return false;
    }

    try {
      const notification = new Notification(title, {
        body: options.body || "Acesse o StaziaMed Revalida para continuar.",
        icon: options.icon || "/favicon.ico",
        badge: options.badge || "/favicon.ico",
        tag: options.tag || "staziamed-presence",
        silent: options.silent ?? false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      return true;
    } catch (e) {
      console.warn("[NotificationService] Notification dispatch failed:", e);
      return false;
    }
  }

  /**
   * Synthesizes pleasant medical chimes using Web Audio API (zero external mp3 downloads required)
   */
  static playNotificationSound(type: NotificationSoundType = "invite"): void {
    if (typeof window === "undefined") return;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;

      if (type === "invite") {
        // Double medical ding (D5 -> A5 harmonic lift)
        this.playTone(587.33, now, 0.15, 0.15); // D5
        this.playTone(880.0, now + 0.12, 0.28, 0.18); // A5
      } else if (type === "match") {
        // Triad fanfare (F5 -> A5 -> C6)
        this.playTone(698.46, now, 0.12, 0.15);
        this.playTone(880.0, now + 0.1, 0.12, 0.15);
        this.playTone(1046.5, now + 0.22, 0.35, 0.2);
      } else if (type === "timer_warning") {
        // Subtle alert pulse
        this.playTone(440.0, now, 0.15, 0.15);
        this.playTone(440.0, now + 0.2, 0.2, 0.15);
      } else {
        // Success chord
        this.playTone(523.25, now, 0.18, 0.12);
        this.playTone(659.25, now + 0.08, 0.25, 0.15);
      }
    } catch (e) {
      console.warn("[NotificationService] Audio chime failed:", e);
    }
  }

  private static playTone(
    freq: number,
    startTime: number,
    duration: number,
    volume: number = 0.15
  ) {
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }
}
