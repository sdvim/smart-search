import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalizeRecord, deduplicate } from "./normalize.ts";
import type { SourceRecord } from "./normalize.ts";
import { createLqip } from "./lqip.ts";

const sourceUrl = new URL("../data/source.jsonl", import.meta.url);
const outputUrl = new URL("../data/items.jsonl", import.meta.url);
const source = (await readFile(sourceUrl, "utf8"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as SourceRecord);
const records = deduplicate(source.map(normalizeRecord).filter((record) => record !== null));
let failures = 0;
for (let offset = 0; offset < records.length; offset += 6) {
  await Promise.all(
    records.slice(offset, offset + 6).map(async (record) => {
      if (!record.image_url) return;
      try {
        record.lqip_base64 = await createLqip(record.image_url);
      } catch (error) {
        failures++;
        console.warn(`LQIP omitted for ${record.id}: ${String(error)}`);
      }
    }),
  );
}
await writeFile(outputUrl, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
console.log(
  JSON.stringify(
    {
      source_records: source.length,
      graded_unique_records: records.length,
      lqips: records.filter((record) => record.lqip_base64).length,
      image_failures: failures,
      output: fileURLToPath(outputUrl),
    },
    null,
    2,
  ),
);
