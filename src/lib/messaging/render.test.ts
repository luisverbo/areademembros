import { describe, expect, it } from "vitest";
import { firstName, renderTemplate } from "./render";

describe("renderTemplate", () => {
  it("troca as variáveis", () => {
    expect(renderTemplate("Oi, {{nome}}! Aula de {{curso}}: {{link}}", { nome: "Ana", curso: "Mentoria", link: "https://x.com/a" })).toBe(
      "Oi, Ana! Aula de Mentoria: https://x.com/a",
    );
  });
  it("aceita espaços e maiúsculas na variável", () => {
    expect(renderTemplate("{{ Nome }}", { nome: "Ana" })).toBe("Ana");
  });
  it("variável vazia não deixa vírgula nem espaço sobrando", () => {
    expect(renderTemplate("Oi, {{nome}}! Tudo bem?", { nome: "" })).toBe("Oi! Tudo bem?");
    expect(renderTemplate("Parabéns, {{nome}}. Fim", {})).toBe("Parabéns. Fim");
  });
  it("mantém quebras de linha", () => {
    expect(renderTemplate("Oi {{nome}}\n\nLinha 2", { nome: "Bia" })).toBe("Oi Bia\n\nLinha 2");
  });
});

describe("firstName", () => {
  it("primeiro nome ou vazio", () => {
    expect(firstName("  Maria  Souza ")).toBe("Maria");
    expect(firstName(null)).toBe("");
  });
});
