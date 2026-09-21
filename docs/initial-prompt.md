# Initial prompt

We are creating a fresh repo to demonstrate and create a general purpose smart search bar React component. It is intended to take the best UX from autocomplete, filtering, and modifier queries.

Suggestions will start broad and get increasingly narrower as more context is provided.

The initial test case will be searching through graded Pokémon cards and their market values, specifically graded Slaking cards.

Example of how context becomes narrower:

`<category:pokemon,basketball,baseball,sports> <subject:slaking,michael jordan,babe ruth,wayne gretzky> <price[s]> <year[s]> <grade[s]> <set[s]> <property[s]> <set_number[s]> <grader_cert_id[s]>`

We may include information about the user to the search endpoint to better optimize suggestions. To keep things simple, the test case will send `user.wallet_balance`.

`user.wallet_balance` influences the suggested price ranges, rounded to the nearest factor of 10.

Based on the data, create an index that captures arbitrary data like subject names, set names, properties, and other values. The index should also shape the dictionary of keywords for search queries based on the expected data. Simple natural language should be supported:

- from/to
- between/and
- before, under
- after, over
- at least, more than, less than
- is
- and

Numeric values such as year, grade, and price can be specified as ranges:

- `2000-2010`
- `from 2000 to 2010`
- `between 2000 and 2010`
- `year:2000-2010`
- `before 2010`
- `<2010`
- `under $100.00`
- `<$100`
- `between $100 and $1000`
- `$100-$1000`
- `at least $100.00`
- `>=$100`
- `more than $100.00`
- `>$100`
- `less than $100`
- `<$100`

Backward ranges infer reverse sorting:

- `2010-2000`
- `from 2010 to 2000`
- `between 2010 and 2000`

Explicit modifier queries are also accepted:

- `year:2000`
- `y:2000`
- `y:2000+`
- `y:2000<`
- `y:>2000`
- `y:>=2000`
- `price:100`
- `$100`
- `>$100`
- `$100<`
- `$100+`
- `grade:`
- `g:`
- `is (property[s])`
- `in (set[s])`

Unique values such as set numbers and grader certificate IDs cannot follow ranges, but they can be combined:

- `#006 and #12 and #292`
- `6, 12, 292`
- `6,12,292`
- `#6018503138 and 89733218`
- `6018503138, 89733218`

Infer four-digit numbers as years, values from 1 through 10 as grades, and other floats as prices or fair market value. A price query prefers `listed_value` and falls back to `fair_market_value`.

As the search bar understands more of the query, it should suggest the next most probable query. Mobile should accept a suggestion with a swipe gesture similar to Gmail; desktop should use Tab like shell completion. Users must always be able to continue typing arbitrary text, even when a suggestion is visible.

When query terms overflow, compact them to shorthand where possible:

- `year:2005` → `2005`
- `under $100` → `<$100`
- `grade 9+` → `9+`
- `before 2010` → `<2010`
- `is:reverse holo` → `reverse holo`

After compaction, overflow naturally toward the left. Chips can be panned horizontally; the clear button stays fixed to the right. Compaction should transition subtly and smoothly.

## Technology

- pnpm
- React
- Oxlint
- Oxfmt
- Oxc transform with React Compiler
- Vite
- Vitest
- vanilla CSS
- `$vercel-react-best-practices`

Use snake_case for database and backend fields, PascalCase for component names, and camelCase for variables and functions. Avoid comments except useful JSDoc.

## Data

Create a mock database API backed by JSONL and served through a REST endpoint. Seed data from:

- <https://courtyard.io/user/slaking/collection>
- <https://www.fanaticscollect.com/marketplace?type=FIXED&q=slaking&itemsPerPage=48>

Avoid Seaking false matches, duplicates, and ungraded cards. The initial target is at least 1,000 total items, ideally more, including Slaking, Pikachu, and Alakazam.

Collectible records should generally include:

- title
- subject
- set_number
- set_name
- language
- year
- grader
- grade
- grader_label
- grader_cert_id
- fair_market_value
- listed_value
- properties
- image_url
- lqip_base64

Infer missing information from titles when needed. For available images, create an approximately 18px WebP LQIP at 50% quality during dataset generation and store its base64 value. Use a generic placeholder SVG when no image is available.

## Design

Only Lucide Search and X icons are used. Use a classic system sans-serif fallback chain rather than adding Inter. The initial design is black on white, with a minimal white/black/opacity theme that makes dark mode easy to infer.

The mobile reference is the supplied Figma Contextual Search frame. The desktop results reference is the supplied Figma search-with-results frame.

The results page should only surface records from the mock database. Buy buttons have a hover state but no real transaction. Use LQIPs while images load and a generic placeholder SVG when images are unavailable.

## Scope and quality

Keep the implementation generic, portable, readable, and easy to review. Do not overengineer the proof of concept. Tests should be thorough and accurate without being superfluous. The final page should be deployable as a static Vite site with a small mock API function when needed.
