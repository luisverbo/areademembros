const DAY = 86_400_000;

/** Início da semana (segunda) no fuso de São Paulo, como yyyy-mm-dd. */
export function weekStart(iso: string): string {
  const local = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const diff = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - diff);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

/** As últimas N semanas (mais antiga primeiro), com rótulo dd/mm. */
export function lastWeeks(n: number, now = Date.now()): { key: string; label: string }[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(weekStart(new Date(now - i * 7 * DAY).toISOString()));
  return [...new Set(keys)].map((key) => ({ key, label: `${key.slice(8, 10)}/${key.slice(5, 7)}` }));
}
