# Phase 1 - Outline

Goal: produce `{slug}/outline.yaml` (what to research) and `{slug}/fields.yaml` (what to collect about each item), and get the user to approve both.

## Step 1 - Draft from your own knowledge

From the topic, draft:
- **Items**: the objects to research (products, techniques, instruments, guidelines, papers, companies...). For each item, give a one-line description and a category.
- **Fields**: the dimensions to collect for every item, grouped into categories.

Show the draft. Ask the user whether to add or remove items and whether the fields cover what they need. Also ask for the **time range** for the web supplement (e.g. last 12 months, since 2020, unlimited).

## Step 2 - Web supplement

Search the web to fill gaps in the draft. Follow `search-method.md` and the relevant module. If you have subagents, you can delegate this step to one subagent with the prompt below and wait for the result. Otherwise, do it yourself with the same brief:

```
## Task
Research topic: {topic}
Current date: {YYYY-MM-DD}
Read and follow {skill_dir}/references/search-method.md and the modules it points to.

Based on the initial framework below, find missing items and recommended fields.

## Existing framework
{step1_output}

## Goals
1. Check whether important items are missing from the framework
2. Add the missing items
3. Search for {topic} items within {time_range} and add them
4. Recommend new fields

## Output (return directly, do not write files)
### Supplementary items
- item_name: why it should be added
### Recommended fields
- field_name: what it captures and why it matters
### Sources
- [title](url)
```

## Step 3 - Existing field definitions

Ask whether the user already has a field list, such as a template, a data-extraction form or a previous `fields.yaml`. If they do, merge it in.

## Step 4 - Write the files

Create the folder `{working_folder}/{slug}/` (slug = short snake_case topic name).

**outline.yaml**
```yaml
topic: "Robotic vs laparoscopic cholecystectomy"
created: 2026-09-22
time_range: "since 2018"
items:
  - name: "Da Vinci Xi"
    category: "Robotic platform"
    description: "Intuitive Surgical multiport system, most widely deployed"
  - name: "Standard 4-port laparoscopic cholecystectomy"
    category: "Laparoscopic technique"
    description: "Reference technique, comparator"
execution:
  batch_size: 3        # items researched in parallel per batch (only with subagents)
  items_per_agent: 1   # items each subagent handles
  output_dir: results  # relative to the {slug}/ folder
```

**fields.yaml** - this exact shape, because `scripts/validate_json.py` rejects any other:
```yaml
fields:
  basic_info:
    - name: name
      description: "Item name"
      detail_level: brief
      required: true
    - name: manufacturer
      description: "Company or originating group"
      detail_level: brief
  evidence:
    - name: key_studies
      description: "Main studies: design, n, year, main result, PMID/DOI"
      detail_level: detailed
    - name: evidence_level
      description: "Highest level of evidence available (guideline / SR-MA / RCT / observational / expert)"
      detail_level: brief
  sources_meta:
    - name: sources
      description: "List of source URLs used for this item"
      detail_level: brief
      required: true
uncertain: []
```

Rules:
- `detail_level` is `brief`, `moderate` or `detailed` and tells phase 2 how much to write.
- If **no** field has `required:`, the validator treats **every** field as required. Mark `required: true` only on the essential fields if you want the others to be optional.
- Always include a `sources` field.
- Keep field names in `snake_case` English. Descriptions can be in the user's language.

Ask the user to choose `batch_size` and `items_per_agent` when subagents are available. Otherwise the defaults are fine.

## Step 5 - Confirm

Show both files and say where they are saved. Offer the next steps: extend the outline (`phase-extend.md`) or start phase 2 (`phase-2-deep.md`).
