#!/usr/bin/env python3
"""Build report.md from a deep-research project folder.

Usage:
    python3 generate_report.py <project_dir> [--toc-fields a,b] [--title T]
                               [--output PATH] [--lang en|es]

<project_dir> contains outline.yaml and fields.yaml; results are read from
execution.output_dir (default: results). Values marked "[uncertain]", listed
in the item's "uncertain" array, or empty are left out.
"""

import argparse
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

import yaml

LABELS = {
    "en": {
        "contents": "Contents",
        "sources": "Sources",
        "other": "Other information",
        "not_verified": "Not verified",
        "generated": "Generated",
        "items": "items",
    },
    "es": {
        "contents": "Índice",
        "sources": "Fuentes",
        "other": "Otra información",
        "not_verified": "No verificado",
        "generated": "Generado",
        "items": "elementos",
    },
}

INTERNAL_KEYS = {"_source_file", "uncertain", "sources"}
UNCERTAIN = "[uncertain]"
LONG_TEXT = 100


def load_yaml(path):
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_fields(fields_path):
    """Return ordered [(category, [(name, description), ...]), ...]."""
    data = load_yaml(fields_path)
    fields = data.get("fields")
    if not isinstance(fields, dict):
        sys.exit(f"[ERROR] {fields_path}: expected a top-level 'fields:' mapping of categories")
    out = []
    for category, entries in fields.items():
        items = []
        for entry in entries or []:
            if isinstance(entry, dict) and entry.get("name"):
                items.append((str(entry["name"]), str(entry.get("description", ""))))
            elif isinstance(entry, str):
                items.append((entry, ""))
        out.append((str(category), items))
    return out


def humanize(key):
    return str(key).replace("_", " ").strip().capitalize()


def slugify(text, seen):
    """GitHub-style heading anchor, de-duplicated."""
    text = unicodedata.normalize("NFC", text).lower().strip()
    text = re.sub(r"[^\w\- ]", "", text)
    slug = text.replace(" ", "-")
    base, n = slug, 1
    while slug in seen:
        slug = f"{base}-{n}"
        n += 1
    seen.add(slug)
    return slug


def is_missing(value):
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip() or UNCERTAIN in value
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return False


def clean(value):
    """Drop uncertain/empty parts inside lists and dicts."""
    if isinstance(value, list):
        return [clean(v) for v in value if not is_missing(v)]
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items() if not is_missing(v)}
    return value


def fmt_scalar(value):
    return str(value).strip().replace("\n", "<br>")


def fmt_value(value):
    """Format a value as markdown (may span several lines)."""
    value = clean(value)
    if isinstance(value, dict):
        parts = [f"{humanize(k)}: {fmt_inline(v)}" for k, v in value.items()]
        return "; ".join(parts) if sum(len(p) for p in parts) < 160 else "\n" + "\n".join(f"  - {p}" for p in parts)
    if isinstance(value, list):
        if not value:
            return ""
        if all(isinstance(v, dict) for v in value):
            return "\n" + "\n".join(f"  - {' | '.join(f'{humanize(k)}: {fmt_inline(v)}' for k, v in d.items())}" for d in value)
        rendered = [fmt_inline(v) for v in value]
        if len(rendered) <= 5 and sum(len(r) for r in rendered) < 120:
            return ", ".join(rendered)
        return "\n" + "\n".join(f"  - {r}" for r in rendered)
    text = fmt_scalar(value)
    if len(text) > LONG_TEXT:
        return "\n\n  > " + text
    return text


def fmt_inline(value):
    if isinstance(value, dict):
        return "; ".join(f"{humanize(k)}: {fmt_inline(v)}" for k, v in value.items() if not is_missing(v))
    if isinstance(value, list):
        return ", ".join(fmt_inline(v) for v in value if not is_missing(v))
    return fmt_scalar(value)


def find_field(data, name, category):
    """Look up a field at top level, then in its category, then in any nested dict."""
    if name in data:
        return True, data[name]
    cat = data.get(category)
    if isinstance(cat, dict) and name in cat:
        return True, cat[name]
    for value in data.values():
        if isinstance(value, dict) and name in value:
            return True, value[name]
    return False, None


def item_name(data, path):
    found, value = find_field(data, "name", "basic_info")
    if found and isinstance(value, str) and value.strip() and UNCERTAIN not in value:
        return value.strip()
    return path.stem.replace("_", " ")


def collect_uncertain(data):
    names = set()
    if isinstance(data.get("uncertain"), list):
        names.update(str(x) for x in data["uncertain"])
    for value in data.values():
        if isinstance(value, dict) and isinstance(value.get("uncertain"), list):
            names.update(str(x) for x in value["uncertain"])
    return names


def collect_sources(data):
    sources = []
    for container in [data] + [v for v in data.values() if isinstance(v, dict)]:
        value = container.get("sources")
        if isinstance(value, list):
            sources.extend(value)
        elif isinstance(value, str) and value.strip():
            sources.append(value)
    seen, out = set(), []
    for s in sources:
        key = json.dumps(s, sort_keys=True, ensure_ascii=False)
        if key not in seen and not is_missing(s):
            seen.add(key)
            out.append(s)
    return out


def fmt_source(src):
    if isinstance(src, dict):
        url = src.get("url") or src.get("link") or ""
        title = src.get("title") or src.get("name") or url
        rest = [fmt_inline(v) for k, v in src.items() if k not in {"url", "link", "title", "name"} and not is_missing(v)]
        head = f"[{title}]({url})" if url else str(title)
        return head + (f" - {'; '.join(rest)}" if rest else "")
    text = str(src).strip()
    if re.match(r"^https?://\S+$", text):
        return f"<{text}>"
    return text


def build(project_dir, toc_fields, title, lang):
    labels = LABELS[lang]
    outline_path = project_dir / "outline.yaml"
    fields_path = project_dir / "fields.yaml"
    for p in (outline_path, fields_path):
        if not p.exists():
            sys.exit(f"[ERROR] missing {p}")
    outline = load_yaml(outline_path)
    categories = load_fields(fields_path)
    defined = {name for _, entries in categories for name, _ in entries}
    category_keys = {c for c, _ in categories}

    output_dir = project_dir / (outline.get("execution", {}) or {}).get("output_dir", "results")
    files = sorted(output_dir.glob("*.json"))
    if not files:
        sys.exit(f"[ERROR] no JSON results in {output_dir}")

    # Keep outline order where possible.
    order = {str(it.get("name", "")).strip().lower(): i for i, it in enumerate(outline.get("items", []) or []) if isinstance(it, dict)}
    items = []
    for path in files:
        try:
            with path.open(encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"[WARN] skipping {path.name}: {e}", file=sys.stderr)
            continue
        if not isinstance(data, dict):
            print(f"[WARN] skipping {path.name}: top level is not an object", file=sys.stderr)
            continue
        items.append((item_name(data, path), data))
    items.sort(key=lambda it: (order.get(it[0].lower(), len(order)), it[0].lower()))

    seen_slugs = set()
    topic = title or outline.get("topic") or project_dir.name
    lines = [f"# {topic}", ""]
    lines += [f"_{labels['generated']}: {date.today().isoformat()} · {len(items)} {labels['items']}_", ""]

    slugs = []
    for name, _ in items:
        slugs.append(slugify(name, seen_slugs))
    slugify(topic, seen_slugs)

    lines += [f"## {labels['contents']}", ""]
    for i, ((name, data), slug) in enumerate(zip(items, slugs), 1):
        unc = collect_uncertain(data)
        extras = []
        for field in toc_fields:
            if field in unc:
                continue
            found, value = find_field(data, field, "")
            if found and not is_missing(value):
                text = fmt_inline(clean(value)).replace("<br>", " ")
                if len(text) > 60:
                    text = text[:57].rstrip() + "..."
                extras.append(f"{humanize(field)}: {text}")
        suffix = f" - {' | '.join(extras)}" if extras else ""
        lines.append(f"{i}. [{name}](#{slug}){suffix}")
    lines.append("")

    for (name, data), slug in zip(items, slugs):
        unc = collect_uncertain(data)
        lines += ["---", "", f"## {name}", ""]
        hidden = []
        for category, entries in categories:
            block = []
            for field, _desc in entries:
                if field == "name" or field == "sources":
                    continue
                found, value = find_field(data, field, category)
                if not found:
                    continue
                if field in unc or is_missing(value):
                    hidden.append(field)
                    continue
                block.append(f"- **{humanize(field)}**: {fmt_value(value)}")
            if block:
                lines += [f"### {humanize(category)}", ""] + block + [""]

        extra = []
        for key, value in data.items():
            if key in INTERNAL_KEYS or key in defined or key in category_keys:
                continue
            if key in unc or is_missing(value):
                continue
            extra.append(f"- **{humanize(key)}**: {fmt_value(value)}")
        for category in category_keys:
            nested = data.get(category)
            if isinstance(nested, dict):
                for key, value in nested.items():
                    if key in INTERNAL_KEYS or key in defined or key in unc or is_missing(value):
                        continue
                    extra.append(f"- **{humanize(key)}**: {fmt_value(value)}")
        if extra:
            lines += [f"### {labels['other']}", ""] + extra + [""]

        missing = sorted(set(hidden) | {u for u in unc if u in defined})
        if missing:
            lines += [f"<details><summary>{labels['not_verified']} ({len(missing)})</summary>", ""]
            lines += [f"- {humanize(m)}" for m in missing]
            lines += ["", "</details>", ""]

        sources = collect_sources(data)
        if sources:
            lines += [f"### {labels['sources']}", ""]
            lines += [f"{i}. {fmt_source(s)}" for i, s in enumerate(sources, 1)]
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def main():
    parser = argparse.ArgumentParser(description="Generate report.md from deep-research JSON results")
    parser.add_argument("project_dir", help="Folder containing outline.yaml and fields.yaml")
    parser.add_argument("--toc-fields", default="", help="Comma-separated fields shown next to each item in the contents")
    parser.add_argument("--title", default="", help="Report title (default: outline topic)")
    parser.add_argument("--output", default="", help="Output path (default: <project_dir>/report.md)")
    parser.add_argument("--lang", choices=sorted(LABELS), default="en", help="Language of fixed headings")
    args = parser.parse_args()

    project_dir = Path(args.project_dir).resolve()
    toc = [f.strip() for f in args.toc_fields.split(",") if f.strip()]
    report = build(project_dir, toc, args.title, args.lang)
    out = Path(args.output) if args.output else project_dir / "report.md"
    out.write_text(report, encoding="utf-8")
    print(f"[OK] wrote {out}")


if __name__ == "__main__":
    main()
