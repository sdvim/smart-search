# Smart Search

A small React proof of concept combining autocomplete, removable filters, and natural-language modifier queries. The demo searches real, frozen graded Slaking, Pikachu, and Alakazam listings from Courtyard and Fanatics Collect. Buy buttons are intentionally inert.

## Run

Use Node 22.12+ and pnpm 11.

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173. The checked-in dataset already includes image placeholders; seeding is not required to start the demo.

To access the dev server from another device on the same LAN, run `pnpm dev:lan`, then open `http://<this-computer's-LAN-IP>:5173` from that device. This binds Vite to all interfaces; use a trusted network and allow port 5173 through the local firewall if prompted.

```sh
pnpm exec playwright install chromium
pnpm check
```

`check` runs TypeScript, Oxlint, Oxfmt, unit/API tests, real-browser interaction tests, and a production build. Individual commands are `typecheck`, `lint`, `format:check`, `test`, `test:browser`, and `build`. Use `pnpm format` to format files. `pnpm preview` serves the built page with the same local REST API.

Vite uses Oxc transforms and `@vitejs/plugin-react` with `compiler: true`. React Compiler runs through `oxc-transform-react`; there is no Babel pipeline, CSS framework, router, or global state library.

## Interaction

- Start typing `Sla`. Tab or right-arrow movement at the end accepts the inline completion. On mobile, swipe right over the input or ghost text; tapping the ghost text always keeps the editor in normal input mode.
- Suggestions use the existing filters, indexed values, match counts, and configured field priorities. After the subject, the demo prefers price, grade, year, properties, then sets. Suggestions never apply until accepted.
- Enter or Space confirms recognized clauses. Space also accepts a direct ghost completion such as `Sla` → `Slaking`; a delimiter Space still commits the typed clause without accepting the next suggestion. Suggestions never rewrite the active draft while it is being typed, so partial and arbitrary text remains editable even when it becomes a known value. A possible multiword match such as `Slaking e` remains editable, and typing `Slaking something-unexpected` simply removes the incompatible ghost. IME composition is not tokenized mid-composition.
- Committed chips synchronize to the URL's `q` query parameter and rehydrate as chips when the page is refreshed. Editing a chip leaves the previous URL value in place until the edit is committed or the chip is fully deleted.
- Tap a chip to edit it in place, use its X to remove it, or press Backspace in an empty draft to reopen the previous chip. Holding Backspace continues through chips after the first edit, while Alt-, Control-, and Command-Backspace remove a preceding chip as one word when the caret reaches the chip boundary. Escape cancels a chip edit or dismisses completion so Tab can leave the input. Shift-Tab always moves focus normally.
- Chips shorten oldest-first only when needed, with a 160 ms width transition. After compaction, the track scrolls left to keep the active input visible. Drag chips in either direction to pan; the clear button stays fixed.
- The portfolio/search header is sticky while scrolling upward and slides away while scrolling downward. It uses the body theme background and keeps a small bottom buffer above results. The result grid uses fluid card tracks, adding columns on wide screens and stepping down through five, four, three, and two columns as space narrows.
- Results update after a 150 ms debounce. Superseded requests are cancelled and late responses are ignored. Results load 24 cards at a time; an intersection sentinel fetches the next page as it approaches the viewport. Loading, no-match, failed-request/retry, broken-image, and missing-image states are included.

The header balance is `$398.28`. Only `user.wallet_balance` is sent to search. The portfolio figure is display-only. Wallet suggestions use the nearest power of ten by numeric distance: `398.28 → 100`, `650 → 1000`, with ties rounding up. They influence completion, never filter the user's results automatically.

## Query grammar

| Intent               | Examples                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Subject, category    | `Slaking`, `Pikachu`, `Alakazam ex`, `category:pokemon`                                                              |
| Exact year           | `2005`, `year:2005`, `y:2005`                                                                                        |
| Year range           | `2000-2010`, `from 2000 to 2010`, `between 2000 and 2010`, `y:2000-2010`                                             |
| Year comparison      | `before 2010`, `earlier than 2010`, `<2010`, `after 2000`, `later than 2000`, `y:>=2000`                             |
| Price                | `$100`, `price:100`, `under $100`, `below $100`, `above $100`, `between $100 and $1000`, `$100-$1000`                |
| Inclusive comparison | `at least $100`, `no less than $100`, `>=$100`, `$100+`, `at most $100`, `no more than $100`, `up to $100`, `<=$100` |
| Exclusive comparison | `more than $100`, `greater than $100`, `>$100`, `less than $100`, `fewer than $100`, `<$100`                         |
| Grade                | `9`, `9.5`, `grade 9+`, `g:8.5-10`                                                                                   |
| Set, property        | `in Deoxys`, `set:Deoxys`, `is reverse holo`, `is:reverse holo`                                                      |
| Set numbers          | `#006 and #12 and #292`, `6, 12, 292`, `6,12,292`, `#227/191`                                                        |
| Certificates         | `#6018503138 and 89733218`, `6018503138, 89733218`, `cert:0001234567`                                                |

Ranges include both endpoints. Reversing their written order reverses sorting: `2010-2000` still searches 2000 through 2010, newest first. Multiple ranges sort in query order, then by stable record ID. Prefix comparisons are conventional. A suffix is literal: `2000<` means values greater than 2000, while `2000>` means values less than 2000. `+` means greater than or equal to.

Bare four-digit integers infer years. Plausible half-step values from 1 through 10 infer grades, including `9.5`. Other bare decimals infer prices. `$` and explicit field names override inference. A bare integer list means set numbers; long or known certificate strings infer certificates. Identifiers never accept ranges. Certificate leading zeros are preserved, while `#006` and `#6` match the same set number. A set numerator also matches its printed denominator form.

Different fields combine with AND. Repeated categorical values and identifier lists are alternatives (OR); properties and numeric constraints combine with AND. `Slaking` includes its subject variants, but properties match exactly: `holo` does not silently include `reverse holo`. Price uses `listed_value`, falling back to `fair_market_value`, compares integer cents, and preserves zero. Missing prices do not match numeric constraints.

Unknown text stays editable and is matched as word prefixes. Incomplete operators such as `grade:` and `under $` preserve the other filters instead of prematurely producing no results. There is no fuzzy spelling correction, so `Seaking` never becomes `Slaking`.

## Structure and reuse

| Location          | Responsibility                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/components/` | Controlled `SmartSearchBar`, chip rendering, measured compaction, pointer/keyboard behavior, standalone CSS |
| `src/search/`     | React-free field definitions, vocabulary/postings index, parser, matching, ranking, and edit helpers        |
| `src/demo/`       | Collectible schema, field priorities, REST adapter, result cards, and responsive page                       |
| `server/`         | Small JSON REST handler, mounted by a Vite dev/preview plugin                                               |
| `scripts/`        | Source normalization, slab deduplication, and build-time LQIP generation                                    |
| `data/`           | Sanitized source snapshot and normalized JSONL records                                                      |
| `tests/`          | Grammar/engine, API, dataset, and browser interaction tests                                                 |

The component has no Pokémon, wallet, fetch, or result-grid dependency. Reuse `src/components` with `src/search/types.ts`, or copy the whole search engine and supply different `SearchField` definitions and records. `SearchField` configures aliases, value kind, priority, inference role, family/property matching, and fallback keys. The index builds vocabulary and exact-match postings from the supplied records, rather than a hardcoded list of subjects or sets.

The controlled interface is `value`, `onChange`, `suggestion`, `onAcceptSuggestion`, and `onSubmit`, with optional accessible label and placeholder. `SearchValue` keeps committed tokens, the current draft, and an optional edited token ID. `updateDraft` parses/commits drafts; `serializeQuery` and `activeRange` preserve editing position for the endpoint. See `src/demo/App.tsx` for the complete adapter. No package publication or generic plug-in framework is required.

The page uses the system sans-serif stack and only Lucide Search/X. The component provides local box sizing and uses `--ink` / `--paper` CSS variables with black/white defaults. The demo follows the system dark preference. Reduced-motion preferences disable transitions.

## Mock REST API

`GET /api/dictionary` returns field definitions, observed text values/counts, and numeric values. `POST /api/search` returns `{ items, total, suggestion, page, page_size, has_more }`.
The demo keeps the full match count in `total` and returns 24 cards per page so broad searches stay responsive. Send a zero-based `page` and optional `page_size` (1–100) to request a specific page; the UI uses 24-card pages and loads them lazily as the results sentinel enters the viewport.

```sh
curl http://127.0.0.1:5173/api/search \
  -H 'content-type: application/json' \
  -d '{"query":"Slaking under $100","active_range":[8,18],"user":{"wallet_balance":398.28}}'
```

`active_range` contains start/end character offsets for the editable draft. The engine applies that draft to results but excludes it from the completion baseline. It also preserves filters after an earlier chip being edited. Omit the range to suggest the next clause after the whole query. No user authentication, external marketplace calls, purchases, or writes occur through this API.

The dataset is read once at server startup. Restart after rebuilding it. This is a local mock: serving `dist/` alone on a static host does not provide the REST endpoints. A deployed version would need the handler hosted separately.

## Dataset and provenance

The initial snapshot was captured on September 20, 2026 from [Courtyard's Slaking collection](https://courtyard.io/user/slaking/collection), [Fanatics Collect's Slaking marketplace](https://www.fanaticscollect.com/marketplace?type=FIXED&q=slaking&itemsPerPage=48), [Fanatics Collect's Pikachu marketplace](https://www.fanaticscollect.com/marketplace?type=FIXED&q=pikachu&itemsPerPage=48), and [Fanatics Collect's Alakazam marketplace](https://www.fanaticscollect.com/marketplace?type=FIXED&q=alakazam&itemsPerPage=48). Each record retains its public source URL. `data/source.jsonl` contains only the collectible fields needed for this exercise, not marketplace credentials or owner profiles.

There are 2,932 source candidates and 2,793 normalized graded slabs: 67 from Courtyard and 2,726 from Fanatics. Normalization excludes Seaking, raw cards, records without a year, authentication-only records without a numeric grade, and marketplace titles that mention a target Pokémon only as a set name. Deduplication uses grader plus certificate, falling back to image URL or source ID. Different certificates remain different collectible items even when their card titles match.

Values are a frozen demo snapshot, not current market quotes. Set names, properties, language, and grade labels are best-effort source/title inference, not a catalog authority. Remote images remain hosted by their respective providers and may later disappear.

```sh
pnpm seed
```

This rebuilds `data/items.jsonl` from the checked-in source snapshot. It does not crawl the marketplaces again. `scripts/lqip.ts` downloads each available image, preserves aspect ratio within 18×18 pixels, encodes WebP at quality 50, and stores its base64 bytes in JSONL. Images are processed six at a time with a 15-second timeout. Failures are reported and fall back to the generic slab SVG; image processing never runs in the search request path. 2,791 of the 2,793 initial records have generated LQIPs; the two records without images use the generic placeholder.

## Verification scope

The tests cover the documented numeric forms, reversed sorting, identifiers, conjunctions, price fallback, wallet ranking, malformed/incomplete input, active-clause editing, source exclusions, deduplication, placeholder encoding, keyboard/edit/clear behavior, touch swipes/panning, compaction, IME, stale responses, paginated lazy loading, errors/retry, image fallback, and inert Buy buttons.

Desktop and 390 px mobile layouts are inspected in dedicated Helium through Chrome DevTools. Browser tests use Playwright's Chromium with touch emulation, and a Maestro iOS Safari flow covers mobile keyboard and caret movement. The supplied mobile reference and browser-accessible Figma desktop frame guide sizing and spacing. Figma's design-context connector did not grant access, so this is visual comparison rather than a verified exact-token export.
