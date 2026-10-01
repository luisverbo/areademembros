import "server-only";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import type { NotebookCourse } from "@/lib/notes-data";
import { formatTimestamp } from "@/lib/transcript";

const stamp = (s: number | null) => (s === null ? "" : `[${formatTimestamp(s)}] `);

export async function notebookToDocx(courses: NotebookCourse[], title: string): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }),
    new Paragraph({ children: [new TextRun({ text: `Exportado em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, italics: true, color: "666666" })] }),
  ];
  for (const course of courses) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(course.title)] }));
    for (const lesson of course.lessons) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(lesson.title)] }));
      for (const note of lesson.notes) {
        const lines = note.content.split("\n");
        children.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 160 },
            children: lines.flatMap((line, i) => [
              ...(i === 0 && note.timestamp_seconds !== null ? [new TextRun({ text: stamp(note.timestamp_seconds), bold: true, color: "D63A42" })] : []),
              new TextRun({ text: line, break: i > 0 ? 1 : undefined }),
            ]),
          }),
        );
      }
    }
  }
  return Packer.toBuffer(new Document({ creator: "LC.Academy", title, sections: [{ children }] }));
}

/** As fontes padrão do PDF não têm emoji e alguns símbolos: troca o que não dá para desenhar. */
function printable(font: PDFFont, text: string): string {
  return [...text.replace(/\t/g, "  ")]
    .map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return "?";
      }
    })
    .join("");
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) out.push(line);
        // palavra maior que a linha: quebra no meio
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
          let cut = rest.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
          out.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
    }
    out.push(line);
  }
  return out;
}

export async function notebookToPdf(courses: NotebookCourse[], title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("LC.Academy");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [W, H, M] = [595.28, 841.89, 50]; // A4
  const maxWidth = W - M * 2;
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const ensure = (needed: number) => {
    if (y - needed < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const draw = (text: string, font: PDFFont, size: number, color = rgb(0.1, 0.1, 0.1), gapAfter = 4) => {
    for (const line of wrap(font, printable(font, text), size, maxWidth)) {
      ensure(size + 4);
      page.drawText(line, { x: M, y: y - size, size, font, color });
      y -= size + 4;
    }
    y -= gapAfter;
  };

  draw(title, bold, 20, rgb(0.08, 0.08, 0.09), 2);
  draw(`Exportado em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, regular, 9, rgb(0.45, 0.45, 0.48), 14);
  for (const course of courses) {
    ensure(40);
    draw(course.title, bold, 15, rgb(0.84, 0.23, 0.26), 6);
    for (const lesson of course.lessons) {
      ensure(30);
      draw(lesson.title, bold, 12, rgb(0.1, 0.1, 0.1), 4);
      for (const note of lesson.notes) {
        draw(`${stamp(note.timestamp_seconds)}${note.content}`, regular, 10.5, rgb(0.15, 0.15, 0.17), 8);
      }
      y -= 6;
    }
  }
  return pdf.save();
}
