import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { collectibleFields } from "../src/demo/collectibles.ts";
import type { Collectible } from "../src/demo/collectibles.ts";
import type { PortfolioSource } from "../src/demo/portfolio.ts";
import { buildIndex } from "../src/search/index-data.ts";
import type { SearchIndex } from "../src/search/index-data.ts";

async function readDataFile(name: string) {
  let lastError: unknown;
  const locations = [
    new URL(`../data/${name}`, import.meta.url),
    pathToFileURL(join(process.cwd(), "data", name)),
  ];
  for (const location of locations) {
    try {
      return await readFile(location, "utf8");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function loadIndex(): Promise<SearchIndex<Collectible>> {
  const file = await readDataFile("items.jsonl");
  return buildIndex(
    file
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Collectible),
    collectibleFields,
  );
}

export async function loadPortfolio(): Promise<PortfolioSource> {
  return JSON.parse(await readDataFile("portfolio.json"));
}
