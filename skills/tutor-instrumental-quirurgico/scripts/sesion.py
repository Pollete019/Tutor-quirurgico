#!/usr/bin/env python3
"""Selecciona y baraja ejercicios del banco del tutor.

Las opciones se barajan siempre: en el banco original la correcta es casi
siempre la misma posición (B en test, A en casos).

Uso:
  sesion.py temas                              # temas, especialidades y grupos con recuento
  sesion.py test  [--tema T] [--n 10]          # preguntas tipo test
  sesion.py casos [--esp E]  [--n 5]           # casos clínicos
  sesion.py visual [--grupo G] [--n 10]        # identificación por imagen
  --excluir "id1,id2"  evita repetir ítems ya preguntados en la sesión
  --seed N             resultado reproducible

La salida muestra primero lo que se enseña al alumno y al final la
CLAVE (solo para el tutor).
"""
import argparse, json, random, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANCO = json.loads((ROOT / "data" / "banco.json").read_text(encoding="utf-8"))
L = "ABCD"


def norm(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().strip()


def resolver(nombre, claves):
    if not nombre:
        return list(claves)
    n = norm(nombre)
    hits = [k for k in claves if norm(k) == n] or [k for k in claves if n in norm(k)]
    if not hits:
        sys.exit(f"'{nombre}' no encontrado. Opciones: {', '.join(claves)}")
    return hits


def pool(seccion, filtro):
    datos = BANCO[seccion]
    return [(f"{k}#{i}", k, it) for k in resolver(filtro, datos) for i, it in enumerate(datos[k])]


def barajar(ops, correcta, rng):
    orden = list(range(len(ops)))
    rng.shuffle(orden)
    return [ops[j] for j in orden], orden.index(correcta)


def elegir(items, n, excluir, rng):
    items = [x for x in items if x[0] not in excluir]
    rng.shuffle(items)
    return items[:n]


def cmd_temas(_):
    for sec, titulo in (("preguntas", "Temas de test"), ("casos", "Especialidades (casos)")):
        print(f"## {titulo}")
        for k, v in BANCO[sec].items():
            print(f"- {k}: {len(v)}")
    grupos = {}
    for v in BANCO["visual"]:
        grupos[v["grupo"]] = grupos.get(v["grupo"], 0) + 1
    print("## Grupos visuales")
    for k, v in sorted(grupos.items()):
        print(f"- {k}: {v}")


def cmd_test(a, rng):
    sel = elegir(pool("preguntas", a.tema), a.n, a.excluir, rng)
    clave = []
    for num, (iid, tema, q) in enumerate(sel, 1):
        ops, c = barajar(q["ops"], q["c"], rng)
        print(f"### P{num} · {tema}\n{q['q']}")
        print("\n".join(f"{L[j]}) {o}" for j, o in enumerate(ops)) + "\n")
        clave.append(f"P{num} [{iid}] → {L[c]}. {q['exp']}")
    print("---\n## CLAVE (no mostrar)\n" + "\n".join(clave))


def cmd_casos(a, rng):
    sel = elegir(pool("casos", a.esp), a.n, a.excluir, rng)
    clave = []
    for num, (iid, esp, q) in enumerate(sel, 1):
        ops, c = barajar(q["ops"], q["ok"], rng)
        print(f"### Caso {num} · {esp}\n{q['c']}")
        print("\n".join(f"{L[j]}) {o}" for j, o in enumerate(ops)) + "\n")
        clave.append(f"Caso {num} [{iid}] → {L[c]}.\n  Decisión ideal: {q['d']}\n  Error típico: {q['e']}")
    print("---\n## CLAVE (no mostrar)\n" + "\n".join(clave))


def cmd_visual(a, rng):
    items = [(f"vis#{i}", v["grupo"], v) for i, v in enumerate(BANCO["visual"])]
    if a.grupo:
        g = norm(a.grupo)
        items = [x for x in items if g in norm(x[1])] or sys.exit(f"Grupo '{a.grupo}' no encontrado")
    sel = elegir(items, a.n, a.excluir, rng)
    clave = []
    for num, (iid, grupo, v) in enumerate(sel, 1):
        ops = v["options"][:]
        rng.shuffle(ops)
        print(f"### Imagen {num}\nArchivo: {ROOT / v['img']}")
        print("\n".join(f"{L[j]}) {o}" for j, o in enumerate(ops)) + "\n")
        clave.append(f"Imagen {num} [{iid}] → {L[ops.index(v['name'])]}) {v['name']} ({grupo}). {v['desc']}")
    print("---\n## CLAVE (no mostrar)\n" + "\n".join(clave))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("temas")
    for nombre, filtro, n in (("test", "--tema", 10), ("casos", "--esp", 5), ("visual", "--grupo", 10)):
        s = sub.add_parser(nombre)
        s.add_argument(filtro)
        s.add_argument("--n", type=int, default=n)
        s.add_argument("--excluir", default="")
        s.add_argument("--seed", type=int)
    a = p.parse_args()
    if a.cmd == "temas":
        return cmd_temas(a)
    a.excluir = {x.strip() for x in a.excluir.split(",") if x.strip()}
    rng = random.Random(a.seed)
    {"test": cmd_test, "casos": cmd_casos, "visual": cmd_visual}[a.cmd](a, rng)


if __name__ == "__main__":
    main()
