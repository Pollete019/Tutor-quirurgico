# Phase 2 - Deep research

Goal: one validated JSON file per item in `{slug}/{output_dir}/`.

## Step 1 - Load and resume

- Read `{slug}/outline.yaml` (items, `execution`) and `{slug}/fields.yaml`.
- List the JSON files already present in the output folder and skip the items they cover. This makes the phase safe to resume after an interruption or a context reset.
- Tell the user how many items remain and how you will proceed (in parallel batches or one at a time).

## Step 2 - Research each item

Build the paths:
- `{item_slug}`: item name with spaces turned into `_` and punctuation removed (`Da_Vinci_Xi`)
- `{output_path}`: absolute path `{slug}/{output_dir}/{item_slug}.json`
- `{fields_path}`: absolute path to `{slug}/fields.yaml`
- `{validator}`: absolute path to this skill's `scripts/validate_json.py`

The brief for one item:

```
## Task
Research the item below and write structured JSON to {output_path}.

{item_yaml}   # the item's full entry from outline.yaml

Topic: {topic}. Current date: {YYYY-MM-DD}. Time range: {time_range}.
Read and follow {skill_dir}/references/search-method.md and the modules it points to.

## Fields
Read {fields_path}. Produce one key per field (snake_case, as named there).
Match the depth given by each field's detail_level.

## Rules
1. Only record values you found in a source. If you could not verify a value, set it
   to "[uncertain]" and add the field name to a top-level "uncertain" array.
2. Include a top-level "sources" array of URLs (with PMID/DOI where relevant).
3. Write values in {language}.
4. Keep the JSON valid (UTF-8, no comments).

## Validation
python3 {validator} -f {fields_path} -j {output_path}
Fix and re-run until it prints PASS. The task is done only then.
```

**With subagents**: launch `batch_size` subagents at a time in the background, each with the brief for `items_per_agent` items. Use a general-purpose agent, or a web-search agent if one exists. Ask the subagents to report back only "done / failed + path", since the data lives in the file. Once a batch finishes, show progress and ask before launching the next one. The user may want to adjust fields after seeing the first results.

**Without subagents**: follow the brief yourself, item by item. After every 2-3 items, show a short progress line. Pause to check in with the user after the first item so they can correct the field depth early.

JSON may be flat (`{"name": ..., "manufacturer": ...}`) or grouped by the categories in fields.yaml (`{"basic_info": {...}, "evidence": {...}}`). Both validate.

## Step 3 - Summary

When every item is done, report:
- items completed and items that failed validation (with reason)
- items with many `uncertain` fields, which are candidates for a targeted second pass
- where the files are

Offer phase 3 (`phase-3-report.md`).
