import { describe, expect, it } from "vitest";
import { linkify } from "./linkify";

describe("linkify", () => {
  it("transforma o link do Drive em link e mantém o texto em volta", () => {
    const parts = linkify("Baixe o arquivo aqui: https://drive.google.com/file/d/1AbC_x-9/view?usp=sharing\nBoa aula!");
    expect(parts).toEqual([
      { type: "text", value: "Baixe o arquivo aqui: " },
      {
        type: "link",
        value: "https://drive.google.com/file/d/1AbC_x-9/view?usp=sharing",
        href: "https://drive.google.com/file/d/1AbC_x-9/view?usp=sharing",
      },
      { type: "text", value: "\nBoa aula!" },
    ]);
  });

  it("tira a pontuação do fim da frase e aceita www.", () => {
    const parts = linkify("Veja https://exemplo.com/a. E também www.site.com.br, ok?");
    expect(parts.filter((p) => p.type === "link")).toEqual([
      { type: "link", value: "https://exemplo.com/a", href: "https://exemplo.com/a" },
      { type: "link", value: "www.site.com.br", href: "https://www.site.com.br" },
    ]);
  });

  it("não cria link para outros esquemas (javascript:, mailto:) e texto sem link fica igual", () => {
    expect(linkify("javascript:alert(1) sem link")).toEqual([{ type: "text", value: "javascript:alert(1) sem link" }]);
  });
});
