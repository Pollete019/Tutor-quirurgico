// Extracción de texto de los protocolos subidos. Cada documento queda como una
// lista de "unidades" citables: páginas (PDF) o secciones (TXT/MD).
import { splitSections } from './text.js';

export class ExtractError extends Error {}

export async function extractDocument(buffer, filename) {
  const ext = String(filename).toLowerCase().split('.').pop();
  if (ext === 'pdf') return { unit: 'pág.', pages: await extractPdf(buffer) };
  if (ext === 'txt' || ext === 'md') return extractPlain(buffer);
  throw new ExtractError('Formato no admitido. Usa PDF, TXT o MD (Word: guárdalo como PDF).');
}

export function extractPlain(buffer) {
  const pages = splitSections(buffer.toString('utf8'));
  if (!pages.length) throw new ExtractError('El archivo está vacío.');
  return { unit: 'sec.', pages };
}

async function extractPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, verbosity: 0 }).promise;
  } catch {
    throw new ExtractError('No se ha podido abrir el PDF (¿está dañado o protegido con contraseña?).');
  }
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      text += item.str + (item.hasEOL ? '\n' : ' ');
    }
    pages.push(text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim());
  }
  await pdf.destroy();
  const chars = pages.join('').length;
  if (chars < 50 * Math.max(1, pages.length / 4)) {
    throw new ExtractError('El PDF apenas contiene texto: probablemente es un escaneo. La lectura de escaneados (OCR) no está incluida en este prototipo.');
  }
  return pages;
}
