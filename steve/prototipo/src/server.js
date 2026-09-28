// Servidor HTTP de STEVE (fase 1). Sin framework: node:http + módulos propios.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { createStore } from './store.js';
import { extractDocument, extractPlain, ExtractError } from './extract.js';
import { detectPatientData } from './privacy.js';
import { ask, friendlyApiError } from './steve.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, '..', 'public');
const SEED_DIR = path.join(here, '..', 'seed');
const SERVICIO_DEMO = 'Servicio de demostración';
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_UPLOAD = 20 * 1024 * 1024;

export function createApp(opts = {}) {
  const config = {
    dataDir: opts.dataDir || process.env.STEVE_DATA_DIR || path.join(here, '..', 'data'),
    model: opts.model || process.env.STEVE_MODEL || 'claude-opus-5',
    maxContextTokens: Number(opts.maxContextTokens || process.env.STEVE_MAX_CONTEXT_TOKENS || 150000),
    demoPassword: opts.demoPassword || process.env.STEVE_DEMO_PASSWORD || 'steve-demo',
  };
  // Reenvío automático a otro modelo si el principal rechaza la consulta (solo modelos que lo admiten)
  config.fallbacks = process.env.STEVE_FALLBACKS !== '0' && ['claude-opus-5', 'claude-fable-5-1'].includes(config.model);

  // Sin credenciales → modo demostración (búsqueda sin IA). opts.client permite inyectar un cliente de pruebas.
  const hasKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  const client = opts.client !== undefined ? opts.client
    : (process.env.STEVE_DEMO === '1' || !hasKey ? null : new Anthropic());

  const store = createStore(config.dataDir);
  seed(store, config);

  const sessions = new Map();
  const loginFails = new Map();

  const server = http.createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (err) {
      if (err instanceof HttpError) return json(res, err.status, { error: err.message });
      console.error(err);
      json(res, 500, { error: 'Error interno del servidor.' });
    }
  });

  async function route(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    setSecurityHeaders(res);

    if (!p.startsWith('/api/')) return serveStatic(p, res);

    // Protección CSRF: toda petición que modifica exige una cabecera propia
    // (un formulario de otra web no puede enviarla sin pasar por CORS).
    if (req.method !== 'GET' && req.headers['x-steve'] !== '1') throw new HttpError(403, 'Petición no permitida.');

    if (p === '/api/estado' && req.method === 'GET') {
      return json(res, 200, { modo: client ? 'ia' : 'demo', modelo: client ? config.model : null });
    }
    if (p === '/api/login' && req.method === 'POST') return login(req, res);

    const user = currentUser(req);
    if (!user) throw new HttpError(401, 'Sesión caducada. Vuelve a entrar.');

    if (p === '/api/logout' && req.method === 'POST') {
      sessions.delete(sid(req));
      res.setHeader('Set-Cookie', 'steve_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      return json(res, 200, { ok: true });
    }
    if (p === '/api/yo' && req.method === 'GET') return json(res, 200, user);

    if (p === '/api/protocolos' && req.method === 'GET') {
      const docs = docsFor(user).map(({ pages, ...d }) => ({ ...d, unidades: pages.length }));
      return json(res, 200, docs);
    }
    if (p === '/api/protocolos' && req.method === 'POST') return upload(req, res, url, user);

    let m = p.match(/^\/api\/protocolos\/([a-f0-9-]{36})$/);
    if (m && (req.method === 'PATCH' || req.method === 'DELETE')) {
      requireAdmin(user);
      const doc = store.getDoc(m[1]);
      if (!doc || doc.servicio !== user.servicio) throw new HttpError(404, 'Protocolo no encontrado.');
      if (req.method === 'DELETE') { store.deleteDoc(doc.id); return json(res, 200, { ok: true }); }
      const body = await readJson(req);
      const patch = {};
      if (body.estado !== undefined) {
        if (!['vigente', 'obsoleto'].includes(body.estado)) throw new HttpError(400, 'Estado no válido.');
        patch.estado = body.estado;
      }
      if (body.titulo) patch.titulo = String(body.titulo).slice(0, 150);
      if (body.version) patch.version = String(body.version).slice(0, 20);
      return json(res, 200, strip(store.updateDoc(doc.id, patch)));
    }

    m = p.match(/^\/api\/protocolos\/([a-f0-9-]{36})\/unidad\/(\d+)$/);
    if (m && req.method === 'GET') {
      const doc = store.getDoc(m[1]);
      const n = Number(m[2]);
      if (!doc || doc.servicio !== user.servicio || !doc.pages[n - 1]) throw new HttpError(404, 'Página no encontrada.');
      return json(res, 200, { titulo: doc.titulo, version: doc.version, estado: doc.estado, unit: doc.unit, n, total: doc.pages.length, texto: doc.pages[n - 1] });
    }

    if (p === '/api/preguntar' && req.method === 'POST') return preguntar(req, res, user);

    if (p === '/api/registro' && req.method === 'GET') {
      requireAdmin(user);
      const entries = store.readLog().filter(e => e.servicio === user.servicio).reverse();
      return json(res, 200, {
        total: entries.length,
        sinRespuesta: entries.filter(e => !e.bloqueada && !e.error && !e.respondida).slice(0, 100),
        bloqueadas: entries.filter(e => e.bloqueada).length,
      });
    }
    throw new HttpError(404, 'Ruta no encontrada.');
  }

  // ── Acciones ──
  async function login(req, res) {
    const ip = req.socket.remoteAddress;
    const f = loginFails.get(ip);
    if (f && f.n >= 10 && Date.now() - f.t < 10 * 60 * 1000) throw new HttpError(429, 'Demasiados intentos. Espera 10 minutos.');
    const { usuario, password } = await readJson(req);
    const user = store.checkLogin(String(usuario || ''), String(password || ''));
    if (!user) {
      loginFails.set(ip, { n: (f && Date.now() - f.t < 10 * 60 * 1000 ? f.n : 0) + 1, t: Date.now() });
      throw new HttpError(401, 'Usuario o contraseña incorrectos.');
    }
    loginFails.delete(ip);
    const id = crypto.randomBytes(24).toString('hex');
    sessions.set(id, { user, exp: Date.now() + SESSION_MS });
    res.setHeader('Set-Cookie', `steve_sid=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}`);
    json(res, 200, user);
  }

  async function upload(req, res, url, user) {
    requireAdmin(user);
    const archivo = path.basename(url.searchParams.get('archivo') || '');
    const titulo = (url.searchParams.get('titulo') || archivo.replace(/\.[^.]+$/, '')).trim().slice(0, 150);
    const version = (url.searchParams.get('version') || '1').trim().slice(0, 20);
    if (!archivo || !titulo) throw new HttpError(400, 'Falta el archivo o el título.');
    const buf = await readBody(req, MAX_UPLOAD);
    let extracted;
    try {
      extracted = await extractDocument(buf, archivo);
    } catch (e) {
      if (e instanceof ExtractError) throw new HttpError(422, e.message);
      throw e;
    }
    const doc = store.addDoc({ titulo, version, archivo, ...extracted, subidoPor: user.usuario, servicio: user.servicio });
    json(res, 201, strip(doc));
  }

  async function preguntar(req, res, user) {
    const body = await readJson(req);
    const pregunta = String(body.pregunta || '').trim().slice(0, 2000);
    if (!pregunta) throw new HttpError(400, 'La pregunta está vacía.');
    const historial = sanitizeHistory(body.historial);
    const base = { usuario: user.usuario, rol: user.rol, servicio: user.servicio, pregunta };

    const motivos = detectPatientData(pregunta);
    if (motivos.length) {
      store.log({ ...base, pregunta: '[retirada: contenía datos de paciente]', bloqueada: true, motivos });
      return json(res, 422, {
        error: `Tu pregunta parece incluir datos de un paciente (${motivos.join(', ')}). No se ha enviado. Reformúlala sin datos identificativos.`,
        motivos,
      });
    }

    const t0 = Date.now();
    try {
      const out = await ask({ client, docs: docsFor(user), question: pregunta, historial, config });
      store.log({
        ...base, modo: out.modo, respondida: out.answered, ms: Date.now() - t0,
        fuentes: [...new Set(out.sources.map(s => s.titulo))],
        tokens: out.usage && {
          entrada: out.usage.input_tokens, salida: out.usage.output_tokens,
          cacheLeidos: out.usage.cache_read_input_tokens, cacheEscritos: out.usage.cache_creation_input_tokens,
        },
      });
      json(res, 200, { segments: out.segments, sources: out.sources, respondida: out.answered, modo: out.modo });
    } catch (err) {
      console.error('Error de la API:', err);
      store.log({ ...base, error: String(err.message).slice(0, 300) });
      json(res, 502, { error: friendlyApiError(err) });
    }
  }

  // ── Utilidades ──
  function docsFor(user) { return store.listDocs().filter(d => d.servicio === user.servicio); }
  function sid(req) { return /(?:^|;\s*)steve_sid=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1]; }
  function currentUser(req) {
    const s = sessions.get(sid(req));
    if (!s || s.exp < Date.now()) return null;
    return s.user;
  }

  return { server, store, config, isDemo: !client };
}

function seed(store, config) {
  if (!store.listUsers().length) {
    for (const [usuario, nombre, rol] of [['admin', 'Supervisión (demo)', 'admin'], ['enfermera', 'Enfermera (demo)', 'enfermera'], ['tcae', 'TCAE (demo)', 'tcae']]) {
      store.addUser({ usuario, nombre, rol, servicio: SERVICIO_DEMO, password: config.demoPassword });
    }
  }
  if (!store.listDocs().length && fs.existsSync(SEED_DIR)) {
    for (const f of fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.md')).sort()) {
      const text = fs.readFileSync(path.join(SEED_DIR, f), 'utf8');
      const titulo = (text.match(/^# (.+)$/m)?.[1] || f).trim();
      const version = text.match(/^Versión:\s*(\S+)/mi)?.[1] || '1';
      store.addDoc({ titulo, version, archivo: f, ...extractPlain(Buffer.from(text)), subidoPor: 'sistema', servicio: SERVICIO_DEMO });
    }
  }
}

function sanitizeHistory(h) {
  if (!Array.isArray(h)) return [];
  const out = [];
  for (const m of h.slice(-10)) {
    const rol = m?.rol === 'steve' ? 'steve' : 'usuario';
    const texto = String(m?.texto || '').trim().slice(0, 4000);
    if (!texto) continue;
    // La conversación debe alternar y empezar por el usuario
    if ((out.length === 0 && rol !== 'usuario') || out.at(-1)?.rol === rol) continue;
    out.push({ rol, texto });
  }
  if (out.at(-1)?.rol === 'usuario') out.pop();
  return out;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function requireAdmin(user) {
  if (user.rol !== 'admin') throw new HttpError(403, 'Solo la supervisión puede gestionar protocolos.');
}

function strip({ pages, ...d }) { return { ...d, unidades: pages.length }; }

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'El archivo supera 20 MB.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  try { return JSON.parse((await readBody(req, 256 * 1024)).toString('utf8') || '{}'); } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, 'JSON no válido.');
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serveStatic(p, res) {
  const rel = p === '/' ? 'index.html' : decodeURIComponent(p).replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('No encontrado');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'");
}

// Arranque directo: node src/server.js
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { server, config, isDemo } = createApp();
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => {
    console.log(`STEVE escuchando en http://localhost:${port}`);
    console.log(isDemo
      ? 'Modo DEMOSTRACIÓN: no hay ANTHROPIC_API_KEY, las respuestas son fragmentos sin IA.'
      : `Modo IA con el modelo ${config.model}.`);
    if (!process.env.STEVE_DEMO_PASSWORD) console.log('Usuarios de prueba: admin / enfermera / tcae — contraseña "steve-demo" (cámbiala con STEVE_DEMO_PASSWORD).');
  });
}
