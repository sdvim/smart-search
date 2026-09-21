import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { deduplicate, normalizeRecord } from "../scripts/normalize.ts";
import { card } from "./fixtures.ts";
import type { Collectible } from "../src/demo/collectibles.ts";

describe("seed data", () => {
  it("contains distinct graded Pokémon slabs with valid generated placeholders", async () => {
    const rows = (await readFile(new URL("../data/items.jsonl", import.meta.url), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Collectible);
    expect(rows.length).toBeGreaterThan(1000);
    expect(deduplicate(rows)).toHaveLength(rows.length);
    for (const row of rows) {
      expect(row.subject).toMatch(/^(?:Slaking|Pikachu|Alakazam)(?: ex| V| VMAX| VSTAR| GX)?$/);
      expect(row.title).not.toMatch(/seaking/i);
      expect(row.grade).toBeGreaterThanOrEqual(1);
      expect(row.grade).toBeLessThanOrEqual(10);
      expect(row.source_urls.length).toBeGreaterThan(0);
      if (row.image_url) {
        const metadata = await sharp(Buffer.from(row.lqip_base64!, "base64")).metadata();
        expect(metadata.format).toBe("webp");
        expect(Math.max(metadata.width!, metadata.height!)).toBeLessThanOrEqual(18);
      }
    }
  });
  it("keeps different certificates but merges repeated listings of one slab", () => {
    expect(
      deduplicate([
        card("a"),
        card("b", { grader_cert_id: "different" }),
        card("c", { listed_value: 20 }),
      ]),
    ).toHaveLength(2);
    expect(deduplicate([card("a"), card("c", { listed_value: 20 })])[0].listed_value).toBe(20);
  });
  it("prefers a certificate-backed listing when its image repeats without a certificate", () => {
    const rows = deduplicate([
      card("listing", {
        grader_cert_id: undefined,
        image_url: "https://images.example/card/medium/front.jpg",
        listed_value: 20,
      }),
      card("certified", {
        grader_cert_id: "12345678",
        image_url: "https://images.example/card/small/front.jpg",
        fair_market_value: 25,
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("certified");
    expect(rows[0].grader_cert_id).toBe("12345678");
    expect(rows[0].listed_value).toBe(20);
    expect(rows[0].fair_market_value).toBe(25);
  });
  it("does not merge different certificates that happen to share an image", () => {
    expect(
      deduplicate([
        card("a", { grader_cert_id: "123", image_url: "https://images.example/front.jpg" }),
        card("b", { grader_cert_id: "456", image_url: "https://images.example/front.jpg" }),
        card("listing", {
          grader_cert_id: undefined,
          image_url: "https://images.example/front.jpg",
        }),
      ]),
    ).toHaveLength(3);
  });
  it.each(["Slaking #6 ungraded", "2003 Pokemon Slaking CGC AUTH", "2003 Pokemon Seaking PSA 9"])(
    "excludes %s",
    (title) => {
      expect(normalizeRecord({ id: "excluded", title, source_urls: [] })).toBeNull();
    },
  );
  it("uses the card subject instead of a subject named by the set", () => {
    expect(
      normalizeRecord({
        id: "detective-slaking",
        title: "2019 Pokemon Sun & Moon Detective Pikachu Holo Slaking #18 PSA 9 MINT",
        source_urls: [],
      })?.subject,
    ).toBe("Slaking");
    expect(
      normalizeRecord({
        id: "detective-arcanine",
        title: "2019 Pokemon Sun & Moon Detective Pikachu Holo Arcanine #6 CGC 8.5 NM-MT+",
        source_urls: [],
      }),
    ).toBeNull();
  });
});
