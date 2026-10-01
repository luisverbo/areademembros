"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LockIcon } from "@/components/icons";
import { buttonClasses } from "@/components/ui/button";
import { Cover } from "./cover";

type Props = {
  title: string;
  coverUrl: string | null;
  bannerUrl: string | null;
  description: string | null;
  checkoutUrl: string | null;
  detailsHref: string;
  previewSrc: string | null;
};

const OPEN_DELAY = 450;
const CLOSE_DELAY = 180;

/**
 * Curso bloqueado na vitrine. No desktop, ao parar o mouse, o card se abre por cima da fileira
 * e toca a prévia sem som, com "Desbloquear" e "Ver detalhes". No celular, o toque leva ao checkout.
 */
export function LockedCourseCard({ title, coverUrl, bannerUrl, description, checkoutUrl, detailsHref, previewSrc }: Props) {
  const cardRef = useRef<HTMLAnchorElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => () => [openTimer, closeTimer].forEach((t) => clearTimeout(t.current)), []);

  const canHover = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const scheduleOpen = () => {
    if (!canHover()) return;
    clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => cardRef.current && setRect(cardRef.current.getBoundingClientRect()), OPEN_DELAY);
  };
  const scheduleClose = () => {
    clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setRect(null), CLOSE_DELAY);
  };
  const keepOpen = () => clearTimeout(closeTimer.current);

  const href = checkoutUrl ?? detailsHref;
  const external = Boolean(checkoutUrl);

  // Popover: centralizado sobre o card, maior que ele, sem sair da tela.
  const width = 360;
  const popover =
    rect &&
    createPortal(
      <div
        role="dialog"
        aria-label={`Prévia de ${title}`}
        onMouseEnter={keepOpen}
        onMouseLeave={scheduleClose}
        style={{
          position: "fixed",
          top: Math.max(8, Math.min(window.innerHeight - 340, rect.top + rect.height / 2 - 170)),
          left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2)),
          width,
        }}
        className="border-border bg-surface z-50 overflow-hidden rounded-[var(--radius-card)] border shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] motion-safe:animate-[fadeIn_.18s_ease-out]"
      >
        <div className="relative aspect-video bg-black">
          {previewSrc ? (
            <iframe
              src={previewSrc}
              title={`Prévia de ${title}`}
              allow="autoplay; encrypted-media"
              className="absolute inset-0 size-full border-0"
              tabIndex={-1}
            />
          ) : (
            <Cover src={bannerUrl ?? coverUrl} className="absolute inset-0" />
          )}
          <span className="bg-bg/80 text-fg-soft absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-full">
            <LockIcon width={14} height={14} />
          </span>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <p className="font-display text-lg leading-tight font-bold">{title}</p>
          {description ? <p className="text-fg-muted line-clamp-2 text-sm">{description}</p> : null}
          <div className="flex gap-2">
            {checkoutUrl ? (
              <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "sm", "flex-1")}>
                Desbloquear
              </a>
            ) : null}
            <Link href={detailsHref} className={buttonClasses("secondary", "sm", "flex-1")}>
              Ver detalhes
            </Link>
          </div>
        </div>
      </div>,
      document.body,
    );

  const content = (
    <>
      <div className="relative">
        <Cover src={coverUrl} fallback={title} className="aspect-[9/16] rounded-[var(--radius-card)]" />
        <span
          className="bg-bg/80 text-fg-soft absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-full"
          title="Bloqueado"
        >
          <LockIcon width={14} height={14} />
        </span>
      </div>
      <p className="text-fg-soft group-hover:text-fg mt-2 line-clamp-2 text-sm font-semibold">{title}</p>
    </>
  );

  return (
    <>
      {external ? (
        <a
          ref={cardRef}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${title} (desbloquear)`}
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
          className="group block w-[150px] shrink-0 snap-start sm:w-[200px] lg:w-[250px]"
        >
          {content}
        </a>
      ) : (
        <Link
          ref={cardRef}
          href={href}
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
          className="group block w-[150px] shrink-0 snap-start sm:w-[200px] lg:w-[250px]"
        >
          {content}
        </Link>
      )}
      {popover}
    </>
  );
}
