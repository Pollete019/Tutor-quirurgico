// Detección de datos identificativos de pacientes en la pregunta.
// No es exhaustiva: es una red de seguridad, no sustituye a la formación del personal.

const RULES = [
  { re: /\b(nhc|n\.?\s?h\.?\s?c\.?|historia\s+cl[ií]nica|hist[oò]ria\s+cl[ií]nica)\s*[:#nº°.]*\s*\d{4,}/i, motivo: 'número de historia clínica' },
  { re: /\b\d{8}\s?-?\s?[a-hj-np-tv-z]\b/i, motivo: 'DNI' },
  { re: /\b[xyz]\s?-?\s?\d{7}\s?-?\s?[a-z]\b/i, motivo: 'NIE' },
  { re: /\b[a-z]{4}\s?\d{10}\b/i, motivo: 'código de tarjeta sanitaria (CIP)' },
  { re: /\b(cama|llit|box|habitaci[oó]n?|hab\.)\s*(n[ºo°.]\s*)?\d{1,4}[a-z]?\b(?!\s*(°|º|grados|graus|cm|%))/i, motivo: 'número de cama o habitación' },
  { re: /(\+34\s?)?\b[6789]\d{2}\s?\d{3}\s?\d{3}\b/, motivo: 'número de teléfono' },
  { re: /\b(naci[oó]|nacido|nacida|fecha\s+de\s+nacimiento|f\.?\s?nac\.?)\b.{0,15}\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/i, motivo: 'fecha de nacimiento' },
];

export function detectPatientData(text) {
  return RULES.filter(r => r.re.test(text)).map(r => r.motivo);
}
