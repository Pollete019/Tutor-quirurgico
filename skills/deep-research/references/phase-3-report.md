# Phase 3 - Report

Goal: `{slug}/report.md`, which covers every field of every item, hides uncertain values and keeps the sources.

## Step 1 - Pick summary fields for the table of contents

Read the result JSONs and list the short, comparable fields: numbers, dates, levels, prices, one-word verdicts (e.g. `evidence_level`, `approval_year`, `cost`, `sample_size`). Ask the user which of them to show next to each item in the table of contents. Offer the fields that actually exist as the options.

## Step 2 - Generate

Run the bundled script. Don't write a new one, because it already handles flat and nested JSON, uncertain values, extra fields and sources:

```bash
python3 {skill_dir}/scripts/generate_report.py {slug} \
  --toc-fields evidence_level,approval_year \
  --title "Custom title (optional)"
```

- `{slug}` is the folder containing `outline.yaml`. The script reads `execution.output_dir` from it.
- Output goes to `{slug}/report.md`, or to the path given with `--output`.
- `--lang es` switches the fixed headings (contents, sources, other info, not verified) to Spanish. `en` is the default.

The script covers all the mechanics. If the user wants changes to wording or structure, edit `report.md` afterwards rather than the script.

## Step 3 - Add the synthesis

The script produces the per-item sections and does not interpret anything. Add a short written section at the top, in the user's language:
- **Key findings**: 3-6 bullets that compare the items. What stands out? Where do they differ? For clinical topics: where is the evidence strong and where is it weak?
- **Gaps**: fields that were uncertain across many items, and what it would take to resolve them.

Base the synthesis only on data already in the JSON files. Don't add new claims at this stage.

Show the user where the report is and give a brief summary. In claude.ai, if the file is under `/mnt/user-data/outputs/`, present it for download.
