// Utilidades de texto: normalización, troceado de documentos sin páginas y búsqueda BM25.

const STOPWORDS = new Set((
  // castellano
  'a al algo ante antes como con contra cual cuando de del desde donde durante e el ella ellos en entre era es esa ese eso esta este esto estos fue ha hace hay la las le les lo los mas me mi muy no nos o otra otro para pero por porque que quien se si sin sobre su sus tambien te tiene todo tras tu un una uno unos y ya ' +
  // catalán
  'amb als dels els és hi i la les per perquè què quan quin quina són un una uns unes al del en de el ho li ens us'
).split(' '));

export function normalize(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function tokenize(s) {
  return normalize(s).split(/[^a-z0-9ñç]+/).filter(t => t.length > 1 && !STOPWORDS.has(t));
}

// Documentos sin páginas (TXT/MD): se trocean por encabezados de nivel 1-2 y, si una
// sección es muy larga, por párrafos. Las secciones muy cortas (un título suelto) se
// unen a la siguiente para que cada cita apunte a un fragmento con contenido.
export function splitSections(text, maxChars = 2500, minChars = 300) {
  const clean = String(text).replace(/\r/g, '').trim();
  if (!clean) return [];
  const parts = [];
  for (const part of clean.split(/\n(?=#{1,2} )/)) {
    if (parts.length && parts[parts.length - 1].length < minChars) parts[parts.length - 1] += '\n' + part;
    else parts.push(part);
  }
  const out = [];
  for (const part of parts) {
    if (part.length <= maxChars) { out.push(part.trim()); continue; }
    let buf = '';
    for (const para of part.split(/\n{2,}/)) {
      if (buf && buf.length + para.length + 2 > maxChars) { out.push(buf.trim()); buf = ''; }
      buf += (buf ? '\n\n' : '') + para;
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out.filter(Boolean);
}

// BM25 sobre fragmentos { key, text }. Devuelve los k mejores con su puntuación.
export function bm25Search(fragments, query, k = 5, { k1 = 1.2, b = 0.75 } = {}) {
  const qTerms = [...new Set(tokenize(query))];
  if (!qTerms.length || !fragments.length) return [];
  const docs = fragments.map(f => {
    const toks = tokenize(f.text);
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    return { f, len: toks.length, tf };
  });
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / docs.length || 1;
  const df = new Map(qTerms.map(t => [t, docs.filter(d => d.tf.has(t)).length]));
  const N = docs.length;
  return docs
    .map(d => {
      let score = 0;
      for (const t of qTerms) {
        const n = df.get(t);
        const f = d.tf.get(t);
        if (!n || !f) continue;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avgLen));
      }
      return { ...d.f, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// Estimación conservadora de tokens (≈3,5 caracteres por token en castellano).
export function estimateTokens(text) {
  return Math.ceil(String(text).length / 3.5);
}
