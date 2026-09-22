# Extend the outline (optional)

Find the existing `*/outline.yaml` and `*/fields.yaml` in the working folder. If there are several, ask which one.

## Add items

1. Ask the user which items to add (specific names?) and whether you should also search the web for more. For the web search, use `search-method.md` and the relevant module, and return candidates with a one-line justification and a source for each.
2. Merge the candidates into `items`. Deduplicate by meaning, not just by exact string: "Da Vinci Xi" and "da Vinci Xi system" are the same item.
3. Show the updated list, save `outline.yaml` in place once the user confirms, and list the new items.

## Add fields

1. Ask whether the user will name the fields or wants you to search for the dimensions typically reported in this domain. Examples: CONSORT/PRISMA items for studies, spec sheets for devices.
2. Show the proposed fields. The user confirms which to keep, the category for each and its `detail_level`.
3. Append them to `fields.yaml`, keeping the exact schema from `phase-1-outline.md`. Save in place.

Items already researched in phase 2 lack the new fields. Tell the user that re-running phase 2 for those items will fill them in: delete their JSON files, or ask phase 2 to update them.
