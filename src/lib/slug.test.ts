import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("remove acentos e pontuação", () => {
    expect(slugify("IA para Negócios Locais")).toBe("ia-para-negocios-locais");
    expect(slugify("  Como criar: Instagram!! ")).toBe("como-criar-instagram");
  });

  it("devolve vazio quando não sobra nada", () => {
    expect(slugify("!!!")).toBe("");
  });
});
