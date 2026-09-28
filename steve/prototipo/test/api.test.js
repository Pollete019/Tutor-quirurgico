import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';

// Cliente de Claude simulado: registra la petición y cita el primer bloque del primer documento.
const calls = [];
const fakeClient = {
  beta: { messages: { create: async req => { calls.push(req); return fakeResponse(req); } } },
  messages: { create: async req => { calls.push(req); return fakeResponse(req); } },
};
function fakeResponse(req) {
  const doc = req.messages[0].content[0];
  return {
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 100 },
    content: [{ type: 'text', text: 'Respuesta', citations: [{ type: 'content_block_location', cited_text: doc.source.content[0].text.slice(0, 20), document_index: 0, document_title: doc.title, start_block_index: 0, end_block_index: 1 }] }],
  };
}

let dataDir, base, server;
const apps = [];
async function start(opts) {
  const app = createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'steve-')), ...opts });
  await new Promise(r => app.server.listen(0, r));
  apps.push(app);
  return { app, base: `http://127.0.0.1:${app.server.address().port}` };
}

async function login(b, usuario) {
  const r = await fetch(`${b}/api/login`, { method: 'POST', headers: { 'X-Steve': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, password: 'steve-demo' }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const call = (b, cookie, p, { method = 'GET', body, headers = {} } = {}) =>
  fetch(`${b}${p}`, { method, headers: { Cookie: cookie, ...(method !== 'GET' ? { 'X-Steve': '1' } : {}), ...headers }, body: body && !(body instanceof Buffer) ? JSON.stringify(body) : body });

before(async () => { ({ base } = await start({ client: null })); });
after(() => apps.forEach(a => a.server.close()));

test('sin sesión no hay acceso y el login incorrecto falla', async () => {
  assert.equal((await fetch(`${base}/api/protocolos`)).status, 401);
  const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'X-Steve': '1' }, body: JSON.stringify({ usuario: 'admin', password: 'mal' }) });
  assert.equal(r.status, 401);
});

test('peticiones que modifican sin cabecera X-Steve se rechazan (CSRF)', async () => {
  const cookie = await login(base, 'enfermera');
  const r = await fetch(`${base}/api/preguntar`, { method: 'POST', headers: { Cookie: cookie }, body: '{"pregunta":"x"}' });
  assert.equal(r.status, 403);
});

test('los protocolos de prueba se cargan y la demo responde con citas', async () => {
  const cookie = await login(base, 'enfermera');
  const docs = await (await call(base, cookie, '/api/protocolos')).json();
  assert.equal(docs.length, 5);
  assert.ok(docs.every(d => d.pages === undefined));
  const r = await (await call(base, cookie, '/api/preguntar', { method: 'POST', body: { pregunta: '¿En qué orden se retira el EPI?' } })).json();
  assert.equal(r.modo, 'demo');
  assert.match(r.sources[0].titulo, /Aislamiento/);
  const u = await (await call(base, cookie, `/api/protocolos/${r.sources[0].docId}/unidad/${r.sources[0].unidades[0]}`)).json();
  assert.ok(u.texto.includes(r.sources[0].cita.replace(/…$/, '').slice(0, 30)));
});

test('preguntas con datos de paciente se bloquean y no se guardan', async () => {
  const cookie = await login(base, 'tcae');
  const r = await call(base, cookie, '/api/preguntar', { method: 'POST', body: { pregunta: 'El paciente de la cama 14 tiene una UPP, ¿qué hago?' } });
  assert.equal(r.status, 422);
  const log = apps[0].store.readLog().filter(e => e.bloqueada);
  assert.ok(log.length >= 1);
  assert.ok(!log.some(e => e.pregunta.includes('cama 14')));
});

test('solo la supervisión gestiona protocolos; obsoletos no se usan', async () => {
  const enf = await login(base, 'enfermera');
  const up = await call(base, enf, '/api/protocolos?archivo=x.md', { method: 'POST', body: Buffer.from('# X\ntexto') });
  assert.equal(up.status, 403);

  const admin = await login(base, 'admin');
  const created = await (await call(base, admin, '/api/protocolos?archivo=higiene.md&titulo=Higiene%20de%20manos&version=7', {
    method: 'POST', body: Buffer.from('# Higiene de manos\n\nLa fricción con solución hidroalcohólica dura entre 20 y 30 segundos.'),
  })).json();
  assert.equal(created.titulo, 'Higiene de manos');
  assert.equal(created.version, '7');

  const ask = async () => (await (await call(base, enf, '/api/preguntar', { method: 'POST', body: { pregunta: 'fricción solución hidroalcohólica segundos' } })).json());
  assert.equal((await ask()).sources[0]?.titulo, 'Higiene de manos');

  assert.equal((await call(base, admin, `/api/protocolos/${created.id}`, { method: 'PATCH', body: { estado: 'obsoleto' } })).status, 200);
  assert.notEqual((await ask()).sources[0]?.titulo, 'Higiene de manos');

  assert.equal((await call(base, admin, `/api/protocolos/${created.id}`, { method: 'DELETE' })).status, 200);
});

test('formato no admitido y PDF inválido devuelven error claro', async () => {
  const admin = await login(base, 'admin');
  const r1 = await call(base, admin, '/api/protocolos?archivo=a.docx', { method: 'POST', body: Buffer.from('xx') });
  assert.equal(r1.status, 422);
  const r2 = await call(base, admin, '/api/protocolos?archivo=a.pdf', { method: 'POST', body: Buffer.from('no es un pdf') });
  assert.equal(r2.status, 422);
});

test('registro de preguntas sin respuesta (solo supervisión)', async () => {
  const enf = await login(base, 'enfermera');
  await call(base, enf, '/api/preguntar', { method: 'POST', body: { pregunta: '¿Cómo se prepara la quimioterapia intratecal?' } });
  assert.equal((await call(base, enf, '/api/registro')).status, 403);
  const admin = await login(base, 'admin');
  const reg = await (await call(base, admin, '/api/registro')).json();
  assert.ok(reg.sinRespuesta.some(e => e.pregunta.includes('intratecal')));
});

test('modo IA: petición con documentos citables y fuentes en la respuesta', async () => {
  const { base: b } = await start({ client: fakeClient, model: 'claude-opus-5' });
  const cookie = await login(b, 'enfermera');
  const r = await (await call(b, cookie, '/api/preguntar', {
    method: 'POST', body: { pregunta: '¿Cada cuánto cambio la sonda?', historial: [{ rol: 'usuario', texto: 'hola' }, { rol: 'steve', texto: 'Hola' }] },
  })).json();
  const req = calls.at(-1);
  assert.equal(req.model, 'claude-opus-5');
  assert.equal(req.fallbacks, 'default');
  assert.equal(req.messages.length, 3);
  const docs = req.messages[0].content.filter(c => c.type === 'document');
  assert.equal(docs.length, 5);
  assert.ok(docs.every(d => d.citations.enabled));
  assert.deepEqual(docs.at(-1).cache_control, { type: 'ephemeral' });
  assert.equal(r.modo, 'completo');
  assert.equal(r.respondida, true);
  assert.equal(r.sources.length, 1);
  assert.deepEqual(r.sources[0].unidades, [1]);
});

test('no se sirven archivos fuera de public/', async () => {
  const r = await fetch(`${base}/..%2fsrc%2fserver.js`);
  assert.equal(r.status, 404);
});
