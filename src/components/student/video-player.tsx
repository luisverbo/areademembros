"use client";

import { useEffect, useId, useRef } from "react";

type Props = {
  provider: "bunny" | "youtube";
  src: string;
  lessonId: string;
  title: string;
  /** Onde o aluno parou (segundos). */
  startAt: number;
  onEnded?: () => void;
};

const SAVE_EVERY_MS = 15_000;
export const SEEK_EVENT = "lc:seek";

/** Pede ao player da página para ir até um ponto do vídeo. */
export function seekVideo(seconds: number) {
  window.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: seconds }));
  document.getElementById("lesson-player")?.scrollIntoView({ behavior: "smooth", block: "center" });
}
const BUNNY_ORIGIN = "https://iframe.mediadelivery.net";

type YTPlayer = { getCurrentTime(): number; getDuration(): number; seekTo(s: number, allow: boolean): void; destroy(): void };
type YTNamespace = { Player: new (el: string, opts: object) => YTPlayer; PlayerState: { PLAYING: number; PAUSED: number; ENDED: number } };
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Envia o progresso ao servidor. Usa sendBeacon ao sair da página para não perder o último ponto. */
function saveProgress(lessonId: string, position: number, duration: number, beacon = false) {
  if (!duration || !Number.isFinite(position)) return;
  const body = JSON.stringify({ lessonId, position: Math.floor(position), duration: Math.floor(duration) });
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon("/api/progresso", new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch("/api/progresso", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

function loadYouTubeApi(): Promise<YTNamespace> {
  return new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
}

/**
 * Player da aula (Bunny via protocolo player.js, YouTube via IFrame API).
 * Salva onde o aluno está a cada 15 s, ao pausar, ao terminar e ao sair da página,
 * e retoma do ponto onde parou.
 */
export function VideoPlayer({ provider, src, lessonId, title, startAt, onEnded }: Props) {
  const iframeId = `player-${useId().replace(/:/g, "")}`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const state = useRef({ position: 0, duration: 0, lastSaved: 0, seeked: false, ready: false });
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    const s = state.current;
    const maybeSave = (force = false) => {
      const now = Date.now();
      if (force || now - s.lastSaved >= SAVE_EVERY_MS) {
        s.lastSaved = now;
        saveProgress(lessonId, s.position, s.duration);
      }
    };
    const ended = () => {
      s.position = s.duration;
      maybeSave(true);
      onEndedRef.current?.();
    };
    const shouldResume = (duration: number) => startAt > 10 && (!duration || startAt < duration - 30);

    const onHide = () => {
      if (document.visibilityState === "hidden" && s.duration) saveProgress(lessonId, s.position, s.duration, true);
    };
    document.addEventListener("visibilitychange", onHide);

    let cleanup = () => {};
    // Outros componentes (resumo, Professor IA, caderno) pedem para pular para um minuto.
    let seekTo: (seconds: number) => void = () => {};
    const onSeek = (e: Event) => {
      const seconds = (e as CustomEvent<number>).detail;
      if (Number.isFinite(seconds)) seekTo(Math.max(0, seconds));
    };
    window.addEventListener(SEEK_EVENT, onSeek);

    if (provider === "bunny") {
      const post = (method: string, value?: unknown) =>
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ context: "player.js", version: "0.0.11", method, value }),
          BUNNY_ORIGIN,
        );

      const onMessage = (event: MessageEvent) => {
        if (event.origin !== BUNNY_ORIGIN) return;
        let data: { context?: string; event?: string; value?: { seconds?: number; duration?: number } };
        try {
          data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        } catch {
          return;
        }
        if (data?.context !== "player.js") return;
        switch (data.event) {
          case "ready":
            // Responder só ao primeiro "ready" (pedir de novo geraria outro "ready").
            if (s.ready) break;
            s.ready = true;
            subscribe();
            if (shouldResume(0) && !s.seeked) {
              s.seeked = true;
              post("setCurrentTime", startAt);
            }
            break;
          case "timeupdate":
            s.position = data.value?.seconds ?? s.position;
            s.duration = data.value?.duration ?? s.duration;
            maybeSave();
            break;
          case "pause":
            maybeSave(true);
            break;
          case "ended":
            ended();
            break;
        }
      };
      // O "ready" pode ter sido enviado antes de começarmos a ouvir: pedimos os eventos ao carregar também.
      const subscribe = () => ["ready", "timeupdate", "pause", "ended"].forEach((e) => post("addEventListener", e));
      const iframe = iframeRef.current;
      window.addEventListener("message", onMessage);
      iframe?.addEventListener("load", subscribe);
      subscribe();
      seekTo = (seconds) => {
        post("setCurrentTime", seconds);
        post("play");
      };
      cleanup = () => {
        window.removeEventListener("message", onMessage);
        iframe?.removeEventListener("load", subscribe);
      };
    } else {
      let player: YTPlayer | null = null;
      let timer: ReturnType<typeof setInterval> | undefined;
      let cancelled = false;
      void loadYouTubeApi().then((YT) => {
        if (cancelled) return;
        seekTo = (seconds) => {
          player?.seekTo(seconds, true);
          (player as unknown as { playVideo?: () => void })?.playVideo?.();
        };
        player = new YT.Player(iframeId, {
          events: {
            onReady: () => {
              const duration = player!.getDuration();
              if (shouldResume(duration) && !s.seeked) {
                s.seeked = true;
                player!.seekTo(startAt, true);
              }
            },
            onStateChange: (e: { data: number }) => {
              if (e.data === YT.PlayerState.PLAYING) {
                clearInterval(timer);
                timer = setInterval(() => {
                  s.position = player!.getCurrentTime();
                  s.duration = player!.getDuration();
                  maybeSave();
                }, 1000);
              } else {
                clearInterval(timer);
                if (player) {
                  s.position = player.getCurrentTime();
                  s.duration = player.getDuration();
                }
                if (e.data === YT.PlayerState.ENDED) ended();
                else if (e.data === YT.PlayerState.PAUSED) maybeSave(true);
              }
            },
          },
        });
      });
      cleanup = () => {
        cancelled = true;
        clearInterval(timer);
      };
    }

    return () => {
      cleanup();
      window.removeEventListener(SEEK_EVENT, onSeek);
      document.removeEventListener("visibilitychange", onHide);
      if (s.duration && s.position) saveProgress(lessonId, s.position, s.duration, true);
    };
  }, [provider, lessonId, startAt, iframeId]);

  return (
    <div id="lesson-player" className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] bg-black">
      <iframe
        ref={iframeRef}
        id={iframeId}
        src={src}
        title={title}
        className="absolute inset-0 size-full border-0"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
