import { linkify } from "@/lib/linkify";

/** Texto do admin (descrição) com links clicáveis, abrindo em nova aba. */
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((part, i) =>
        part.type === "link" ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-accent-soft hover:text-fg font-semibold break-all underline underline-offset-2"
          >
            {part.value}
          </a>
        ) : (
          part.value
        ),
      )}
    </>
  );
}
