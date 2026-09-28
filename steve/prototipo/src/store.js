// Almacenamiento en disco (JSON) para el prototipo. En producción se sustituiría
// por una base de datos; la interfaz de este módulo es la que habría que mantener.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function createStore(dataDir) {
  const docsDir = path.join(dataDir, 'docs');
  const usersFile = path.join(dataDir, 'users.json');
  const logFile = path.join(dataDir, 'log.jsonl');
  fs.mkdirSync(docsDir, { recursive: true });

  const docPath = id => path.join(docsDir, `${id}.json`);
  const writeJson = (file, obj) => {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
    fs.renameSync(tmp, file);
  };

  return {
    // ── Protocolos ──
    listDocs() {
      return fs.readdirSync(docsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(fs.readFileSync(path.join(docsDir, f), 'utf8')))
        .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
    },
    getDoc(id) {
      if (!/^[a-f0-9-]{36}$/.test(id)) return null;
      try { return JSON.parse(fs.readFileSync(docPath(id), 'utf8')); } catch { return null; }
    },
    addDoc({ titulo, version, archivo, unit, pages, subidoPor, servicio }) {
      const doc = {
        id: crypto.randomUUID(), titulo, version: version || '1', archivo, unit, pages,
        estado: 'vigente', servicio, subidoPor, fecha: new Date().toISOString(),
      };
      writeJson(docPath(doc.id), doc);
      return doc;
    },
    updateDoc(id, patch) {
      const doc = this.getDoc(id);
      if (!doc) return null;
      Object.assign(doc, patch, { modificado: new Date().toISOString() });
      writeJson(docPath(id), doc);
      return doc;
    },
    deleteDoc(id) {
      if (!this.getDoc(id)) return false;
      fs.unlinkSync(docPath(id));
      return true;
    },

    // ── Usuarios ──
    listUsers() {
      try { return JSON.parse(fs.readFileSync(usersFile, 'utf8')); } catch { return []; }
    },
    addUser({ usuario, nombre, rol, servicio, password }) {
      const users = this.listUsers();
      if (users.some(u => u.usuario === usuario)) throw new Error(`El usuario ${usuario} ya existe`);
      users.push({ usuario, nombre, rol, servicio, hash: hashPassword(password) });
      writeJson(usersFile, users);
    },
    checkLogin(usuario, password) {
      const u = this.listUsers().find(x => x.usuario === usuario);
      if (!u || !verifyPassword(password, u.hash)) return null;
      const { hash, ...pub } = u;
      return pub;
    },

    // ── Registro de consultas ──
    log(entry) {
      fs.appendFileSync(logFile, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
    },
    readLog() {
      try {
        return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
      } catch { return []; }
    },
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(password, salt, 32).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}
