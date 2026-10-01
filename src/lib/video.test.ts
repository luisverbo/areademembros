import { describe, expect, it } from "vitest";
import { normalizeVideoId } from "./video";

const guid = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("normalizeVideoId", () => {
  it("Bunny: ID puro ou link de embed", () => {
    expect(normalizeVideoId("bunny", guid)).toBe(guid);
    expect(normalizeVideoId("bunny", `https://iframe.mediadelivery.net/embed/123456/${guid}?autoplay=false`)).toBe(guid);
    expect(normalizeVideoId("bunny", "abc")).toBeNull();
  });

  it("YouTube: ID puro e formatos de link", () => {
    expect(normalizeVideoId("youtube", "dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(normalizeVideoId("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(normalizeVideoId("youtube", "https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(normalizeVideoId("youtube", "https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(normalizeVideoId("youtube", "https://evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});
