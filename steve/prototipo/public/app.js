// STEVE — interfaz. Sin dependencias; todo el HTML dinámico pasa por esc().
'use strict';

const $ = id => document.getElementById(id);
let me = null;
let historial = [];   // [{ rol: 'usuario' | 'steve', texto }] para las preguntas de seguimiento
let busy = false;

const EJEMPLOS = [
  '¿Cada cuánto se hacen los cambios posturales en riesgo alto?',
  '¿En qué orden me quito el EPI?',
  '¿Qué hago si falta una gasa en el recuento?',
  '¿Cada cuánto se cambia una sonda de silicona?',
];

// ── API ──
async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const opts = { method, headers: { ...headers }, credentials: 'same-origin' };
  if (method !== 'GET') opts.headers['X-Steve'] = '1';
  if (body !== undefined) {
    if (body instanceof Blob) opts.body = body;
    else { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  }
  let res;
  try { res = await fetch(path, opts); } catch { throw new Error('Sin conexión con el servidor.'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== 'api/login') { showLogin(); }
  if (!res.ok) { const e = new Error(data.error || `Error ${res.status}`); e.status = res.status; throw e; }
  return data;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Markdown mínimo sobre texto ya escapado: negrita y saltos de línea.
function fmt(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

// ── Sesión ──
async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  try {
    const estado = await api('api/estado');
    $('demoBanner').hidden = estado.modo !== 'demo';
  } catch { /* sin conexión: se verá al preguntar */ }
  try { me = await api('api/yo'); showApp(); } catch { showLogin(); }
}

function showLogin() {
  me = null;
  $('app').hidden = true;
  $('login').hidden = false;
  $('lUser').focus();
}

function showApp() {
  $('login').hidden = true;
  $('app').hidden = false;
  $('servicio').textContent = `${me.nombre} · ${me.servicio}`;
  document.querySelectorAll('.admin-only').forEach(el => { el.hidden = me.rol !== 'admin'; });
  $('chips').innerHTML = EJEMPLOS.map(q => `<button class="chip" type="button">${esc(q)}</button>`).join('');
  $('question').focus();
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('loginErr').hidden = true;
  try {
    me = await api('api/login', { method: 'POST', body: { usuario: $('lUser').value.trim(), password: $('lPass').value } });
    $('lPass').value = '';
    showApp();
  } catch (err) {
    $('loginErr').textContent = err.message;
    $('loginErr').hidden = false;
  }
});

$('btnSalir').addEventListener('click', async () => {
  await api('api/logout', { method: 'POST' }).catch(() => {});
  nuevaConsulta();
  showLogin();
});

// ── Chat ──
function addMsg(cls, html) {
  $('welcome')?.remove();
  const div = document.createElement('div');
  div.className = `msg ${cls}`;
  div.innerHTML = html;
  $('messages').appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return div;
}

function nuevaConsulta() {
  historial = [];
  $('messages').innerHTML = `<div class="welcome" id="welcome"><img src="icon.svg" alt="" class="welcome-icon"><h2>Nueva consulta</h2><p>Pregunta lo que necesites sobre los protocolos del servicio.</p><div class="chips" id="chips"></div></div>`;
  $('chips').innerHTML = EJEMPLOS.map(q => `<button class="chip" type="button">${esc(q)}</button>`).join('');
}
$('btnNueva').addEventListener('click', nuevaConsulta);

$('messages').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (chip) { $('question').value = chip.textContent; send(); return; }
  const cite = e.target.closest('[data-doc]');
  if (cite) openUnidad(cite.dataset.doc, Number(cite.dataset.n), cite.dataset.cita);
});

async function send() {
  const q = $('question').value.trim();
  if (!q || busy) return;
  busy = true;
  $('btnSend').disabled = true;
  $('question').value = '';
  autoResize();
  addMsg('user', fmt(q));
  const wait = addMsg('steve', '<div class="typing"><span></span><span></span><span></span></div>');
  try {
    const r = await api('api/preguntar', { method: 'POST', body: { pregunta: q, historial } });
    wait.remove();
    renderAnswer(r);
    historial.push({ rol: 'usuario', texto: q }, { rol: 'steve', texto: r.segments.map(s => s.text).join('') });
    historial = historial.slice(-10);
  } catch (err) {
    wait.remove();
    addMsg(err.status === 422 ? 'steve warn' : 'steve error', esc(err.message));
  } finally {
    busy = false;
    $('btnSend').disabled = false;
    $('question').focus();
  }
}

function renderAnswer(r) {
  const body = r.segments.map(seg => {
    const refs = seg.cites.map(n => {
      const s = r.sources[n - 1];
      return `<button class="cite" type="button" data-doc="${esc(s.docId)}" data-n="${s.unidades[0]}" data-cita="${esc(s.cita)}" title="${esc(s.titulo)}">${n}</button>`;
    }).join('');
    // La referencia va pegada al texto, antes del salto de línea final
    const [, txt, nl] = seg.text.match(/^([\s\S]*?)(\s*)$/);
    return fmt(txt) + refs + fmt(nl);
  }).join('');
  const noConsta = !r.respondida;
  const sources = r.sources.length ? `<div class="sources"><div class="sources-title">Fuentes</div>${r.sources.map((s, i) => `
    <button class="source" type="button" data-doc="${esc(s.docId)}" data-n="${s.unidades[0]}" data-cita="${esc(s.cita)}">
      <span class="source-n">${i + 1}</span>
      <span><strong>${esc(s.titulo)}</strong> · v${esc(s.version)} · ${esc(s.unit)} ${esc(s.unidades.join('–'))}
      <span class="source-quote">“${esc(s.cita.length > 160 ? s.cita.slice(0, 159) + '…' : s.cita)}”</span></span>
    </button>`).join('')}</div>` : '';
  const note = r.modo === 'demo' ? '' : '<div class="ai-note">✨ Respuesta generada por IA a partir de los protocolos. Comprueba la fuente antes de actuar.</div>';
  addMsg('steve', `<div class="${noConsta ? 'no-consta' : ''}">${body}</div>${sources}${noConsta ? '' : note}`);
}

$('askForm').addEventListener('submit', e => { e.preventDefault(); send(); });
$('question').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); send(); }
});
function autoResize() { const t = $('question'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }
$('question').addEventListener('input', autoResize);

// ── Dictado por voz ──
let rec = null;
$('btnVoz').addEventListener('click', () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert('Este navegador no permite dictar. Prueba con Chrome o Safari.'); return; }
  if (rec) { rec.stop(); return; }
  rec = new SR();
  rec.lang = document.documentElement.lang === 'ca' ? 'ca-ES' : 'es-ES';
  rec.interimResults = false;
  rec.onstart = () => $('btnVoz').classList.add('listening');
  rec.onresult = e => { $('question').value = e.results[0][0].transcript; autoResize(); };
  rec.onend = () => { $('btnVoz').classList.remove('listening'); rec = null; };
  rec.onerror = () => {};
  rec.start();
});

// ── Modal ──
function openModal(title, html) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = html;
  $('modal').hidden = false;
}
function closeModal() { $('modal').hidden = true; }
$('modalClose').addEventListener('click', closeModal);
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Página o sección citada, con el texto citado resaltado
async function openUnidad(docId, n, cita) {
  try {
    const u = await api(`api/protocolos/${docId}/unidad/${n}`);
    let html = esc(u.texto);
    // Resaltado tolerante a diferencias de espacios y saltos de línea
    const words = cita ? esc(cita.replace(/…$/, '')).trim().split(/\s+/).filter(Boolean) : [];
    if (words.length) {
      const re = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'));
      html = html.replace(re, m => `<mark>${m}</mark>`);
    }
    openModal(`${u.titulo} · v${u.version}`, `
      <div class="page-nav">
        <button class="btn-ghost btn-small" data-nav="${n - 1}" ${n <= 1 ? 'disabled' : ''}>← Anterior</button>
        <span>${esc(u.unit)} ${n} de ${u.total}${u.estado === 'obsoleto' ? ' · <strong>OBSOLETO</strong>' : ''}</span>
        <button class="btn-ghost btn-small" data-nav="${n + 1}" ${n >= u.total ? 'disabled' : ''}>Siguiente →</button>
      </div>
      <div class="page-text">${html}</div>`);
    $('modalBody').querySelectorAll('[data-nav]').forEach(b =>
      b.addEventListener('click', () => openUnidad(docId, Number(b.dataset.nav))));
    $('modalBody').querySelector('mark')?.scrollIntoView({ block: 'center' });
  } catch (err) { alert(err.message); }
}

// Lista de protocolos (y gestión para la supervisión)
$('btnProtocolos').addEventListener('click', renderProtocolos);

async function renderProtocolos() {
  let docs;
  try { docs = await api('api/protocolos'); } catch (err) { alert(err.message); return; }
  const admin = me.rol === 'admin';
  const upload = admin ? `
    <form class="upload" id="uploadForm">
      <div class="section-title">Subir protocolo</div>
      <input type="file" id="upFile" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" required>
      <div class="upload-row">
        <input id="upTitulo" placeholder="Título (opcional)" maxlength="150">
        <input id="upVersion" placeholder="Versión" maxlength="20">
      </div>
      <button class="btn-primary" type="submit" id="upBtn">Subir</button>
      <p class="error" id="upErr" hidden></p>
    </form>` : '';
  const vig = docs.filter(d => d.estado === 'vigente').length;
  const list = docs.map(d => `
    <div class="doc-row ${d.estado}">
      <div class="doc-title">${esc(d.titulo)}<span class="badge ${d.estado}">${d.estado}</span></div>
      <div class="doc-meta">v${esc(d.version)} · ${d.unidades} ${d.unit === 'pág.' ? 'páginas' : 'secciones'} · ${esc(d.archivo)} · ${new Date(d.fecha).toLocaleDateString('es')}</div>
      <div class="doc-actions">
        <button class="btn-ghost btn-small" data-ver="${d.id}">Leer</button>
        ${admin ? `<button class="btn-ghost btn-small" data-estado="${d.id}" data-a="${d.estado === 'vigente' ? 'obsoleto' : 'vigente'}">Marcar ${d.estado === 'vigente' ? 'obsoleto' : 'vigente'}</button>
        <button class="btn-ghost btn-small btn-danger" data-borrar="${d.id}" data-t="${esc(d.titulo)}">Eliminar</button>` : ''}
      </div>
    </div>`).join('');
  openModal(`Protocolos (${vig} vigentes)`, `${upload}<div class="section-title">STEVE solo responde con los vigentes</div>${list || '<p class="muted">No hay protocolos.</p>'}`);

  const body = $('modalBody');
  body.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => openUnidad(b.dataset.ver, 1)));
  body.querySelectorAll('[data-estado]').forEach(b => b.addEventListener('click', async () => {
    try { await api(`api/protocolos/${b.dataset.estado}`, { method: 'PATCH', body: { estado: b.dataset.a } }); renderProtocolos(); } catch (err) { alert(err.message); }
  }));
  body.querySelectorAll('[data-borrar]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar "${b.dataset.t}"? Si solo ha quedado desactualizado, es mejor marcarlo como obsoleto.`)) return;
    try { await api(`api/protocolos/${b.dataset.borrar}`, { method: 'DELETE' }); renderProtocolos(); } catch (err) { alert(err.message); }
  }));
  $('uploadForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = $('upFile').files[0];
    if (!f) return;
    $('upBtn').disabled = true;
    $('upBtn').textContent = 'Procesando…';
    $('upErr').hidden = true;
    const qs = new URLSearchParams({ archivo: f.name, titulo: $('upTitulo').value.trim(), version: $('upVersion').value.trim() || '1' });
    try {
      await api(`api/protocolos?${qs}`, { method: 'POST', body: f, headers: { 'Content-Type': f.type || 'application/octet-stream' } });
      renderProtocolos();
    } catch (err) {
      $('upErr').textContent = err.message;
      $('upErr').hidden = false;
      $('upBtn').disabled = false;
      $('upBtn').textContent = 'Subir';
    }
  });
}

// Preguntas sin respuesta (supervisión): indica qué falta en los protocolos
$('btnRegistro').addEventListener('click', async () => {
  let r;
  try { r = await api('api/registro'); } catch (err) { alert(err.message); return; }
  const items = r.sinRespuesta.map(e => `
    <div class="log-item">${esc(e.pregunta)}
      <div class="log-meta">${new Date(e.ts).toLocaleString('es')} · ${esc(e.rol)}</div>
    </div>`).join('');
  openModal('Preguntas sin respuesta', `
    <p class="muted">${r.total} consultas registradas · ${r.bloqueadas} bloqueadas por contener datos de pacientes.
    Estas preguntas no encontraron respuesta en los protocolos: pueden indicar huecos en la documentación.</p>
    ${items || '<p class="ok">Ninguna por ahora.</p>'}`);
});

init();
