"use client";

import { useSyncExternalStore } from "react";

// Minuto atual do vídeo da página, compartilhado com o caderno e o botão de oferta.
let current = 0;
const listeners = new Set<() => void>();

export function setVideoTime(seconds: number) {
  const s = Math.floor(seconds);
  if (s === current) return;
  current = s;
  listeners.forEach((l) => l());
}

export function getVideoTime() {
  return current;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useVideoTime(): number {
  return useSyncExternalStore(subscribe, getVideoTime, () => 0);
}
