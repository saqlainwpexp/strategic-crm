"use client";

// Browser helpers for follow-up reminders: desktop notification permission, a short
// chime, and per-browser preferences. Everything degrades silently if unsupported.

import { useCallback, useEffect, useState } from "react";

export type NotifyPermission = NotificationPermission | "unsupported";

export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotifyPermission>("default");
  useEffect(() => {
    setPermission(typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
  }, []);
  const request = useCallback(async () => {
    if (!("Notification" in window)) return;
    try {
      setPermission(await Notification.requestPermission());
    } catch {
      /* ignore */
    }
  }, []);
  return { permission, request };
}

const SOUND_KEY = "scrm_reminder_sound";

export function soundEnabled() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function useSoundPreference() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(soundEnabled()), []);
  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(SOUND_KEY, v ? "on" : "off");
    } catch {
      /* ignore */
    }
  };
  return [on, set] as const;
}

let audio: AudioContext | null = null;

/** Two soft rising tones. Browsers may block audio until the user has interacted with the page. */
export function playChime() {
  if (!soundEnabled()) return;
  try {
    audio ??= new AudioContext();
    const start = audio.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = start + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch {
    /* audio unavailable */
  }
}

/** Show a desktop notification if allowed; returns it so the caller can handle clicks. */
export function desktopNotify(title: string, body: string, icon?: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return null;
    return new Notification(title, { body, icon, tag: title + body });
  } catch {
    return null;
  }
}
