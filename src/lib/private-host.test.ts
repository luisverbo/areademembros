import { describe, expect, it } from "vitest";
import { isPrivateHost } from "./private-host";

describe("isPrivateHost", () => {
  it.each([
    "localhost",
    "app.localhost",
    "127.0.0.1",
    "10.0.0.5",
    "192.168.1.1",
    "172.16.0.1",
    "169.254.169.254",
    "[::1]",
    "fd00::1",
    "intranet",
    "db.internal",
  ])("bloqueia %s", (h) => expect(isPrivateHost(h)).toBe(true));
  it.each(["funilpro.com.br", "api.exemplo.com", "172.32.0.1", "8.8.8.8"])("libera %s", (h) => expect(isPrivateHost(h)).toBe(false));
});
