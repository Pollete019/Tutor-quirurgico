---
name: deep-research
description: Structured, human-in-the-loop deep research in phases - build an outline of items and fields, research each item on the web into validated JSON, then compile a markdown report with sources. Use it for literature and evidence reviews (clinical, surgical, nursing, academic), comparing technologies, products or tools, market or competitor analysis and due diligence. Also use it whenever the user asks to "investigate", "research in depth", "compare N options", "do a review of" or "make a report about" a topic that covers several objects, even if they never say "deep research".
license: MIT (derived from Weizhena/deep-research-skills)
---

# Deep Research

A research workflow in three phases, with the user approving the output of each one. The point of splitting it up is control: the user fixes *what* is compared (items) and *along which dimensions* (fields) before any expensive searching starts. Every value found then traces back to a source, and anything unverified is clearly marked as uncertain rather than invented.

```
Phase 1  Outline   -> {slug}/outline.yaml + {slug}/fields.yaml   (user approves)
  (opt.) Extend    -> add items / add fields                     (user approves)
Phase 2  Deep      -> {slug}/results/<item>.json, one per item   (validated)
Phase 3  Report    -> {slug}/report.md
```

## Pick the phase

Work out from the request and from the files present which phase applies:

| Situation | Go to |
|---|---|
| New topic, no `outline.yaml` yet | `references/phase-1-outline.md` |
| User wants more items or more fields in an existing outline | `references/phase-extend.md` |
| Outline approved, results missing or incomplete | `references/phase-2-deep.md` |
| All (or enough) results present, user wants the write-up | `references/phase-3-report.md` |

Read only the reference file for the current phase. At the end of each phase, show the user what was produced and ask whether to continue. Don't chain phases without asking, because each one costs a lot of searching and the user may want to change direction.

The user may name the phase directly: "research outline", "add items", "add fields", "deep research", "report", or the legacy commands `/research`, `/research-add-items`, `/research-add-fields`, `/research-deep`, `/research-report`.

## Environment

This skill runs both in Claude Code and in claude.ai. Adapt to the tools you have:

- **Working folder**: in Claude Code, use the current working directory. In claude.ai, use `/mnt/user-data/outputs/` if it exists so the user can download the files. Otherwise use any writable directory and tell the user where the files are.
- **Subagents**: if you have a tool that launches subagents (Agent/Task), phase 2 can research items in parallel. Otherwise, research the items yourself one at a time. The results are the same, it is just slower.
- **Asking the user**: use the structured question tool when you have one. Otherwise ask in plain text and wait for the answer.
- **Scripts** need Python 3 and `pyyaml` (`pip install pyyaml` if the import fails). The paths below are relative to this skill's folder. Resolve them to absolute paths before running.
- **No filesystem at all**: keep the YAML/JSON content in the conversation and produce the report directly. Say that validation was skipped.

## How to search

Every web-search step follows `references/search-method.md`. It covers query variation, source credibility, dating findings and the output format. Before searching, load the domain module(s) that match the topic from `references/modules/`:

| Topic | Module |
|---|---|
| Clinical, surgical, nursing, drugs, devices, health guidelines | `clinical-medicine.md` |
| Papers, academic state of the art | `academic-papers.md` |
| Products, companies, comparisons, best practices, news | `general-web.md` |
| Software bugs, GitHub issues | `github-debug.md` |
| Programming Q&A | `stackoverflow.md` |
| Chinese-language tech ecosystem | `chinese-tech.md` |

Combine modules when the topic spans domains. For example, "evidence on robotic vs laparoscopic cholecystectomy" uses `clinical-medicine` + `academic-papers`.

## Language

Write field values, reports and questions in the user's language unless they ask otherwise. Keep YAML keys and JSON keys in `snake_case` English so the scripts work.

## Principles

- **Never fill a gap with a guess.** If a value can't be verified, write `"[uncertain]"` and list the field in the item's `uncertain` array. The report hides uncertain values, and a hidden gap is far better than a confident error, especially for clinical data.
- **Cite as you go.** Every item's JSON carries a `sources` list, so any claim can be checked later.
- **Date-sensitive topics**: get today's date (`date +%Y-%m-%d`, or from context) and include it in the searches.
- **Clinical topics**: label the evidence level, and never extrapolate doses, indications or device use beyond what the source states. The output supports study and research. It does not replace clinical judgement.
