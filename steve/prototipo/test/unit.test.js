import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bm25Search, splitSections, tokenize } from '../src/text.js';
import { detectPatientData } from '../src/privacy.js';
import { buildRequest, parseResponse, selectContext, demoAnswer, NO_CONSTA } from '../src/steve.js';

const doc = (id, titulo, pages, estado = 'vigente') => ({ id, titulo, version: '1', unit: 'pág.', pages, estado });

test('tokenize quita acentos y palabras vacías', () => {
  assert.deepEqual(tokenize('¿Cómo se retira la sonda vesical?'), ['retira', 'sonda', 'vesical']);
});

test('splitSections corta por encabezados y une secciones sin contenido', () => {
  const s = splitSections('# T\nintro\n## A\ntexto a\n## B\ntexto b', 2500, 0);
  assert.equal(s.length, 3);
  assert.match(s[2], /^## B/);
  const largo = 'x'.repeat(400);
  const m = splitSections(`## 3. EPI\n### Contacto\n${largo}\n## 4. Traslados\n${largo}`);
  assert.equal(m.length, 2);
  assert.match(m[0], /^## 3\. EPI\n### Contacto/);
});

test('bm25 prioriza el fragmento relevante', () => {
  const r = bm25Search([{ key: 1, text: 'cambios posturales cada 2 horas' }, { key: 2, text: 'retirada del EPI guantes bata' }], 'cambios posturales', 1);
  assert.equal(r[0].key, 1);
});

test('detecta datos de paciente y no da falsos positivos habituales', () => {
  assert.deepEqual(detectPatientData('paciente de la cama 12 con fiebre'), ['número de cama o habitación']);
  assert.ok(detectPatientData('NHC 1234567, ¿qué apósito?').includes('número de historia clínica'));
  assert.ok(detectPatientData('DNI 12345678Z').includes('DNI'));
  assert.ok(detectPatientData('CIP ABCD1234567890').length);
  assert.deepEqual(detectPatientData('¿Se puede elevar la cabecera de la cama 30 grados?'), []);
  assert.deepEqual(detectPatientData('¿Cada cuánto se cambia una sonda de silicona?'), []);
  assert.deepEqual(detectPatientData('recuento de 10 gasas en cirugía de 3 horas'), []);
});

test('selectContext envía todo si cabe y solo vigentes', () => {
  const docs = [doc('a', 'A', ['uno', 'dos']), doc('b', 'B', ['tres'], 'obsoleto')];
  const { modo, parts } = selectContext(docs, 'x', 1000);
  assert.equal(modo, 'completo');
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].pages, [0, 1]);
});

test('selectContext recorta por relevancia si no cabe', () => {
  const docs = [doc('a', 'A', ['cambios posturales cada dos horas '.repeat(20), 'nada relevante '.repeat(20)]), doc('b', 'B', ['guantes y bata '.repeat(20)])];
  const { modo, parts } = selectContext(docs, 'cambios posturales', 250);
  assert.equal(modo, 'fragmentos');
  assert.deepEqual(parts.map(p => [p.doc.id, p.pages]), [['a', [0]]]);
});

test('buildRequest: documentos con citas, caché en el último y sin fallbacks salvo que se pidan', () => {
  const parts = [{ doc: doc('a', 'A', ['p1', 'p2']), pages: [0, 1] }, { doc: doc('b', 'B', ['q1']), pages: [0] }];
  const req = buildRequest(parts, '¿pregunta?', [{ rol: 'usuario', texto: 'hola' }, { rol: 'steve', texto: 'respuesta' }], { model: 'm', fallbacks: false });
  assert.equal(req.messages.length, 3);
  const first = req.messages[0].content;
  assert.equal(first[0].type, 'document');
  assert.deepEqual(first[0].source.content.map(b => b.text), ['p1', 'p2']);
  assert.deepEqual(first[0].citations, { enabled: true });
  assert.equal(first[0].cache_control, undefined);
  assert.deepEqual(first[1].cache_control, { type: 'ephemeral' });
  assert.equal(first[2].text, 'hola');
  assert.equal(req.messages[2].content, '¿pregunta?');
  assert.equal(req.fallbacks, undefined);
  const withFb = buildRequest(parts, 'q', [], { model: 'claude-opus-5', fallbacks: true });
  assert.equal(withFb.fallbacks, 'default');
  assert.deepEqual(withFb.betas, ['server-side-fallback-2026-07-01']);
});

test('parseResponse traduce bloques citados a páginas reales', () => {
  // En modo fragmentos se envían solo las páginas 3 y 5 (índices 2 y 4) del documento
  const parts = [{ doc: doc('a', 'Prot A', ['', '', 'p3', '', 'p5']), pages: [2, 4] }];
  const resp = {
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: '' },
      { type: 'text', text: 'Según el protocolo, ' },
      { type: 'text', text: 'cada 2 horas', citations: [{ type: 'content_block_location', cited_text: 'p5', document_index: 0, document_title: 'Prot A', start_block_index: 1, end_block_index: 2 }] },
      { type: 'text', text: ' y de noche', citations: [{ type: 'content_block_location', cited_text: 'p5', document_index: 0, document_title: 'Prot A', start_block_index: 1, end_block_index: 2 }] },
    ],
  };
  const out = parseResponse(resp, parts);
  assert.equal(out.answered, true);
  assert.equal(out.sources.length, 1);
  assert.deepEqual(out.sources[0].unidades, [5]);
  assert.deepEqual(out.segments.map(s => s.cites), [[], [1], [1]]);
});

test('parseResponse: sin citas no cuenta como respondida; refusal controlado', () => {
  const parts = [{ doc: doc('a', 'A', ['x']), pages: [0] }];
  assert.equal(parseResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: NO_CONSTA }] }, parts).answered, false);
  const r = parseResponse({ stop_reason: 'refusal', content: [] }, parts);
  assert.equal(r.answered, false);
  assert.equal(r.segments.length, 1);
});

test('demoAnswer devuelve fragmentos citados o "No consta"', () => {
  const docs = [doc('a', 'UPP', ['Riesgo alto: cambios posturales cada 2 horas.', 'Otra cosa']), doc('b', 'EPI', ['Orden de retirada: guantes, bata.'])];
  const r = demoAnswer(docs, 'cambios posturales riesgo alto');
  assert.equal(r.sources[0].titulo, 'UPP');
  assert.deepEqual(r.sources[0].unidades, [1]);
  assert.equal(demoAnswer(docs, 'quimioterapia intratecal').answered, false);
});
