# Initial implementation plan

## 1. Establish a small, portable foundation

- Create a Vite React app using pnpm, TypeScript, vanilla CSS, Oxc transforms, React Compiler, Oxlint, Oxfmt, and Vitest.
- Keep the search component independent of Pokémon data, network calls, wallet state, and result-grid layout.
- Define clear PascalCase component APIs and camelCase application logic, while keeping JSON and API fields in snake_case.
- Use system fonts, a black/white opacity theme, and only Lucide Search/X icons.

## 2. Normalize and index the data

- Capture and sanitize graded Slaking marketplace and collection records.
- Add Pikachu and Alakazam records to exercise a broader dictionary and contextual suggestions.
- Exclude Seaking false positives, ungraded cards, raw cards, incomplete years, and duplicates.
- Generate LQIPs at dataset-build time and keep a generic slab placeholder for missing images.
- Define field metadata for category, subject, price, year, grade, property, set, set number, grader, language, certificate, and ownership.
- Build dictionary entries, numeric values, and postings from records rather than hardcoding vocabulary.

## 3. Implement query parsing and matching

- Parse typed text into committed chips and an editable draft.
- Support natural-language comparisons, explicit aliases, ranges, reversed ranges, sorting modifiers, conjunctions, identifier lists, negative filters, and `about` ranges.
- Infer years, grades, prices, set numbers, and certificate IDs conservatively.
- Apply field-specific matching rules: subject families, exact properties, numeric ranges, price fallback, ownership, and stable sorting.
- Preserve incomplete operators and arbitrary text so the editor never rejects user input.

## 4. Build the controlled search bar

- Render removable chips plus a normal text input that stays focusable across edits, blur/focus cycles, mobile keyboard interactions, and chip deletion.
- Accept completions with Tab, desktop right-arrow, or a mobile swipe while leaving Space responsible only for confidently finished typed queries.
- Support copy, paste, select-all, word-modifier deletion, URL synchronization, shorthand compaction, horizontal panning, and a fixed clear button.
- Keep inactive borders and icons at reduced opacity and animate focus/compaction transitions subtly.
- In the demo, rotate eight empty-state placeholders from broad subjects to niche filters.

## 5. Add the mock REST API and user heuristics

- Serve dictionary, paginated search, and portfolio endpoints from the same indexed records.
- Include the wallet balance plus a compact portfolio-derived preference object in search requests.
- Recalculate preferred subjects, grades, and a robust price range from the selected holdings.
- Keep purchases and sales client-only; send temporary purchased/sold IDs to search without mutating the checked-in source data.

## 6. Build the results and commerce surface

- Render a fluid grid that grows beyond five columns on wide screens and steps down cleanly at smaller widths.
- Use lazy loading, pagination, LQIPs, image fallback, and full-query result totals.
- Add client-only buy and sell actions with disabled unavailable CTAs, animated wallet/portfolio totals, surgical item updates, and header peek behavior when the header is hidden.
- Keep owned and sell states the same width, sizing the resting owned state to the larger sell label.
- Add a detail overlay with metadata, shared-image transitions, directional navigation, URL state, close restoration, neighboring card edges, and mobile swipe/dismiss behavior.

## 7. Validate and deploy

- Cover parser, index, API validation, dataset integrity, preference calculation, purchase/sale logic, and browser interactions with focused tests.
- Verify desktop and mobile layouts in a real browser, including the rotating placeholder, hover width stability, query entry, detail navigation, and commerce actions.
- Build the static Vite output and package the mock API as a small Netlify Function with the JSONL data included.
- Create a GitHub repository, create a Netlify site with the authenticated CLI, deploy production, and probe the page plus dictionary, portfolio, and search endpoints.
