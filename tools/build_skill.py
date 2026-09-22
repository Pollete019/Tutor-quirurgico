"""Genera el skill a partir del JSON de tools/extract.js.
Uso: node tools/extract.js tutor.html /tmp/out && python3 tools/build_skill.py /tmp/out/data.json skills/tutor-instrumental-quirurgico
"""
import json, base64, re, unicodedata, os, sys
d = json.load(open(sys.argv[1]))
out = sys.argv[2]
ref = os.path.join(out, 'references'); img = os.path.join(out, 'assets', 'img'); data = os.path.join(out, 'data')
for p in (ref, img, data): os.makedirs(p, exist_ok=True)
L = 'ABCD'
def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

# --- Preguntas (dedupe exact repeats) ---
preg = {}
for tema in d['TEMAS_TEST']:
    seen, lst = set(), []
    for q in d['PREGUNTAS'].get(tema, []):
        if q['q'] in seen: continue
        seen.add(q['q']); lst.append({'q': q['q'], 'ops': q['ops'], 'c': q['c'], 'exp': q['exp']})
    preg[tema] = lst
# Fix: en el HTML v3.1.1 un caso de Traumatología repite la clave `c` (enunciado y correcta)
for e, lst in d['CASOS'].items():
    for x in lst:
        if not isinstance(x['c'], str):
            if x['ops'][0] == 'Con cualquier destornillador':
                x['ok'], x['c'] = x['c'], 'Fijación de fractura supracondílea de fémur distal con placa LCP. ¿Cómo se fijan los tornillos?'
            else:
                sys.exit(f'Caso sin enunciado en {e}: {x["ops"]}')
casos = {e: [{'c': x['c'], 'ops': x['ops'], 'ok': x['ok'], 'd': x['d'], 'e': x['e']} for x in d['CASOS'][e]] for e in d['ESPECIALIDADES']}
vis = []
for v in d['VISUAL_ITEMS']:
    m = re.match(r'data:image/(\w+);base64,(.*)', v['img'], re.S)
    fn = slug(v['name']) + '.jpg'
    open(os.path.join(img, fn), 'wb').write(base64.b64decode(m.group(2)))
    vis.append({'name': v['name'], 'grupo': v['grupo'], 'desc': v['desc'], 'img': 'assets/img/' + fn, 'options': v['options']})
dial = [{'esc': v['esc'], 'turnos': v['turnos'], 'preguntas': (lambda x: x if isinstance(x, list) else [x])(d['VIC_PREGUNTAS'][i])} for i, v in enumerate(d['VICARIOS'])]
json.dump({'preguntas': preg, 'casos': casos, 'visual': vis}, open(os.path.join(data, 'banco.json'), 'w'), ensure_ascii=False, indent=1)

def w(name, text): open(os.path.join(ref, name), 'w').write(text.rstrip() + '\n')

# preguntas.md
t = ['# Banco de preguntas tipo test', '', f'{sum(map(len, preg.values()))} preguntas en {len(preg)} temas. Formato: enunciado, opciones A–D, respuesta correcta y explicación.', '',
     '> Uso interno del tutor: NO mostrar la línea "Correcta" ni la explicación antes de que el alumno responda.', '', '## Índice', '']
t += [f'- {k} ({len(v)})' for k, v in preg.items()]
for tema, lst in preg.items():
    t += ['', f'## {tema}', '']
    for i, q in enumerate(lst, 1):
        t += [f'### {slug(tema)}-{i:02d}', q['q']]
        t += [f'- {L[j]}) {o}' for j, o in enumerate(q['ops'])]
        t += [f'- **Correcta:** {L[q["c"]]}', f'- **Explicación:** {q["exp"]}', '']
w('preguntas.md', '\n'.join(t))

# casos.md
t = ['# Casos clínicos', '', f'{sum(map(len, casos.values()))} casos en {len(casos)} especialidades. Cada caso: escenario, opciones, correcta, decisión ideal (instrumental) y error típico.', '',
     '> Uso interno: NO revelar la correcta, la decisión ni el error típico antes de la respuesta.', '', '## Índice', '']
t += [f'- {k} ({len(v)})' for k, v in casos.items()]
for esp, lst in casos.items():
    t += ['', f'## {esp}', '']
    for i, c in enumerate(lst, 1):
        t += [f'### {slug(esp)}-{i:02d}', c['c']]
        t += [f'- {L[j]}) {o}' for j, o in enumerate(c['ops'])]
        t += [f'- **Correcta:** {L[c["ok"]]}', f'- **Decisión ideal:** {c["d"]}', f'- **Error típico:** {c["e"]}', '']
w('casos.md', '\n'.join(t))

# dialogos.md
t = ['# Diálogos clínicos (aprendizaje vicario)', '', 'Personajes: **Dra. Fonseca** (cirujana adjunta), **Álex** (residente, comete los errores), **Carmen** (instrumentista experta), **Narrador**.',
     'Las líneas marcadas ⚠️ contienen el error conceptual que se corrige después. Cada escena incluye preguntas de comprensión con el turno (nº de intervención) tras el que se lanzan.', '']
for i, s in enumerate(dial, 1):
    t += [f'## Escena {i}: {s["esc"]}', '']
    for n, tu in enumerate(s['turnos'], 1):
        mark = ' ⚠️' if tu.get('cls') == 'err-bub' else ''
        t.append(f'{n}. **{tu["q"]}**{mark}: {tu["t"]}')
    t += ['', '**Preguntas de comprensión:**', '']
    for q in s['preguntas']:
        t.append(f'- (tras turno {q["turno"]}) {q["p"]}')
        t += [f'  - {L[j]}) {o}' for j, o in enumerate(q['ops'])]
        t += [f'  - **Correcta:** {L[q["c"]]} — {q["exp"]}']
    t.append('')
w('dialogos.md', '\n'.join(t))

# fichas.md
t = ['# Fichas de instrumental', '', f'{sum(map(len, d["FICHAS"].values()))} instrumentos agrupados por familia. Campos: función, rasgo visual clave, con qué se confunde y perla clínica.', '']
for g in d['GRUPOS_FICHAS']:
    t += [f'## {g}', '']
    for f in d['FICHAS'].get(g, []):
        t += [f'### {f["n"]}', f'- **Función:** {f["s"]}', f'- **Rasgo clave:** {f["r"]}', f'- **Se confunde con:** {f["co"]}', f'- **Perla:** {f["p"]}', '']
w('fichas.md', '\n'.join(t))

# comparativas.md
t = ['# Comparativas entre instrumentos similares', '']
for c in d['COMPARATIVAS']:
    t += [f'## {c["t"]}', f'- **En común:** {c["co"]}', f'- **Diferencia visual:** {c["vi"]}', f'- **Diferencia funcional:** {c["fu"]}', f'- **Error típico:** {c["er"]}', f'- **Regla para recordar:** {c["re"]}', '']
w('comparativas.md', '\n'.join(t))

# errores.md
t = ['# Errores conceptuales frecuentes', '']
for i, e in enumerate(d['ERRORES'], 1):
    t += [f'## {i}. {e["t"]}', e['c'], '']
w('errores.md', '\n'.join(t))

# visual.md
t = ['# Identificación visual — catálogo de imágenes', '', f'{len(vis)} imágenes reales (JPEG) en `assets/img/`. Cada entrada: grupo, descripción/rasgo diferencial y distractores sugeridos (las 4 opciones incluyen la correcta).', '']
for v in vis:
    dis = [o for o in v['options'] if o != v['name']]
    t += [f'## {v["name"]}', f'- **Imagen:** `{v["img"]}`', f'- **Grupo:** {v["grupo"]}', f'- **Descripción:** {v["desc"]}', f'- **Distractores:** {", ".join(dis)}', '']
w('visual.md', '\n'.join(t))
print('ok', {k: len(v) for k, v in preg.items()}, len(vis))
