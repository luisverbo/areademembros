import "server-only";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatLongDate as formatIssuedDate } from "@/lib/datetime";
import { printable } from "@/lib/notes-export";

export type CertificateData = {
  studentName: string;
  courseTitle: string;
  hours: number | null;
  issuedAt: string;
  code: string;
  appName: string;
  verifyUrl: string;
};

const INK = rgb(0.08, 0.08, 0.09); // #141416
const MUTED = rgb(0.38, 0.38, 0.42);
const ACCENT = rgb(0.839, 0.227, 0.259); // #D63A42
const LINE = rgb(0.86, 0.86, 0.88);

/** Certificado em A4 paisagem, fundo claro (para imprimir), com o vermelho da marca. */
export async function certificateToPdf(data: CertificateData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificado - ${data.courseTitle}`);
  pdf.setAuthor(data.appName);
  const page = pdf.addPage([842, 595]);
  const { width, height } = page.getSize();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Moldura e faixa
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: LINE, borderWidth: 1 });
  page.drawRectangle({ x: 24, y: height - 30, width: width - 48, height: 6, color: ACCENT });

  const center = (text: string, y: number, size: number, font = regular, color = INK) => {
    let s = size;
    const safe = printable(font, text);
    while (font.widthOfTextAtSize(safe, s) > width - 140 && s > 10) s -= 1;
    page.drawText(safe, { x: (width - font.widthOfTextAtSize(safe, s)) / 2, y, size: s, font, color });
  };

  // Marca: "LC" + ponto vermelho + "Academy"
  const [first, ...rest] = data.appName.split(".");
  const brandSize = 18;
  const tail = rest.length ? rest.join(".") : "";
  const brandWidth = bold.widthOfTextAtSize(printable(bold, first + (tail ? `.${tail}` : "")), brandSize);
  let x = (width - brandWidth) / 2;
  page.drawText(printable(bold, first), { x, y: height - 90, size: brandSize, font: bold, color: INK });
  x += bold.widthOfTextAtSize(printable(bold, first), brandSize);
  if (tail) {
    page.drawText(".", { x, y: height - 90, size: brandSize, font: bold, color: ACCENT });
    x += bold.widthOfTextAtSize(".", brandSize);
    page.drawText(printable(bold, tail), { x, y: height - 90, size: brandSize, font: bold, color: INK });
  }

  center("CERTIFICADO DE CONCLUSÃO", height - 160, 30, bold);
  center("Certificamos que", height - 215, 14, regular, MUTED);
  center(data.studentName, height - 265, 34, bold);
  page.drawLine({ start: { x: 200, y: height - 280 }, end: { x: width - 200, y: height - 280 }, thickness: 1, color: LINE });
  center("concluiu o curso", height - 315, 14, regular, MUTED);
  center(data.courseTitle, height - 355, 24, bold);
  const detail = [
    data.hours ? `carga horária de ${data.hours} hora${data.hours === 1 ? "" : "s"}` : null,
    `em ${formatIssuedDate(data.issuedAt)}`,
  ]
    .filter(Boolean)
    .join(", ");
  center(detail.charAt(0).toUpperCase() + detail.slice(1), height - 395, 13, regular, MUTED);

  center(`Código de verificação: ${data.code}`, 72, 10, bold, INK);
  center(`Confira em ${data.verifyUrl}`, 56, 9, regular, MUTED);
  return pdf.save();
}
