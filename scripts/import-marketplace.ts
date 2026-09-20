import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { SourceRecord } from "./normalize.ts";

type MarketplaceHit = {
  listingUuid: string;
  title: string;
  subtitle?: string;
  currentPrice?: number;
  images?: { primary?: { medium?: string; small?: string; thumbnail?: string } };
};

type SearchResult = { hits: MarketplaceHit[]; nbHits: number; nbPages: number };

const endpoint = process.env.ALGOLIA_ENDPOINT ?? "";
if (!endpoint) throw new Error("ALGOLIA_ENDPOINT is required");

const maxHits = Number(process.env.MARKETPLACE_MAX_HITS ?? 3000);
const terms = ["slaking", "pikachu", "alakazam"];
const sourceUrl = new URL("../data/source.jsonl", import.meta.url);
const graderPattern =
  /\b(PSA|CGC|SGC|BGS|AGS|TAG|HGA|CSG|GMA|VGA|ACE|KSA|MNT|Beckett)\s+\d+(?:\.\d+)?\b/i;

async function query(term: string, page: number) {
  const params = new URLSearchParams({
    query: term,
    page: String(page),
    hitsPerPage: "1000",
    attributesToRetrieve:
      "listingUuid,marketplace,marketplaceSource,title,subtitle,currentPrice,status,images.primary",
    filters: '(marketplace:"FIXED") AND (status:"Live") AND (marketplaceSource:"bo")',
    attributesToHighlight: "",
    clickAnalytics: "false",
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requests: [{ indexName: "prod_item_state_v1", params: params.toString() }],
    }),
  });
  if (!response.ok) throw new Error(`Algolia returned ${response.status}`);
  const data = (await response.json()) as { results: [SearchResult] };
  return data.results[0];
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toSource(hit: MarketplaceHit): SourceRecord {
  const imageUrl =
    hit.images?.primary?.medium ?? hit.images?.primary?.small ?? hit.images?.primary?.thumbnail;
  return {
    id: `fanatics-${hit.listingUuid}`,
    title: hit.title,
    listed_value: hit.currentPrice,
    image_url: imageUrl,
    source_urls: [`https://www.fanaticscollect.com/buy-now/${hit.listingUuid}/${slug(hit.title)}`],
  };
}

const existing = (await readFile(sourceUrl, "utf8"))
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as SourceRecord);
const knownIds = new Set(existing.map((record) => record.id));
const imported: SourceRecord[] = [];
const counts: Record<string, number> = {};

for (const term of terms) {
  const first = await query(term, 0);
  const hits = [...first.hits];
  const pageCount = Math.min(first.nbPages, Math.ceil(maxHits / 1000));
  for (let page = 1; page < pageCount; page++) hits.push(...(await query(term, page)).hits);
  const records = hits
    .filter((hit) => graderPattern.test(hit.title))
    .map(toSource)
    .filter((record) => !knownIds.has(record.id));
  for (const record of records) {
    knownIds.add(record.id);
    imported.push(record);
  }
  counts[term] = records.length;
}

await writeFile(
  sourceUrl,
  [...existing, ...imported].map((record) => JSON.stringify(record)).join("\n") + "\n",
);
console.log(
  JSON.stringify(
    {
      imported: counts,
      source_records: existing.length + imported.length,
      output: fileURLToPath(sourceUrl),
    },
    null,
    2,
  ),
);
