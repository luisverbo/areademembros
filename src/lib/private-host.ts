/** localhost, IPs privados e nomes internos: o site nunca deve chamar a própria rede (SSRF). */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return true;
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return true;
  return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80");
}
