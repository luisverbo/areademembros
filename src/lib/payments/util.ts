import { createHmac, timingSafeEqual } from "node:crypto";

export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function hmac(algorithm: "sha1" | "sha256", secret: string, data: string, encoding: "hex" | "base64" = "hex"): string {
  return createHmac(algorithm, secret).update(data).digest(encoding);
}

/** Acesso seguro a campos de JSON desconhecido: get(obj, "a", "b") === obj?.a?.b */
export function get(obj: unknown, ...path: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

export function str(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Todos os valores das chaves com esse nome, em qualquer profundidade (ex.: product_id de order bumps). */
export function deepValues(obj: unknown, key: string, depth = 0): unknown[] {
  if (obj === null || typeof obj !== "object" || depth > 6) return [];
  if (Array.isArray(obj)) return obj.flatMap((item) => deepValues(item, key, depth + 1));
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => [...(k === key ? [v] : []), ...deepValues(v, key, depth + 1)]);
}

export function ids(...values: unknown[]): string[] {
  return [...new Set(values.map(str).filter((v): v is string => Boolean(v)))];
}
