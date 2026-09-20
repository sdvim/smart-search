import type { Collectible } from "../src/demo/collectibles.ts";
import { collectibleFields } from "../src/demo/collectibles.ts";
import { buildIndex } from "../src/search/index-data.ts";

export function card(id: string, overrides: Partial<Collectible> = {}): Collectible {
  return {
    id,
    title: "2005 Pokémon Deoxys Slaking #006 PSA 9 MINT",
    category: "Pokémon",
    subject: "Slaking",
    set_number: "006",
    set_name: "Deoxys",
    language: "en",
    year: 2005,
    grader: "PSA",
    grade: 9,
    grader_label: "MINT",
    grader_cert_id: "6018503138",
    properties: ["reverse holo"],
    fair_market_value: 80,
    source_urls: ["https://example.com/card/" + id],
    ...overrides,
  };
}

export const records = [
  card("a", { listed_value: 60 }),
  card("b", {
    year: 2010,
    grade: 9.5,
    set_number: "12",
    grader_cert_id: "89733218",
    properties: ["holo", "first edition"],
    fair_market_value: 100,
  }),
  card("c", {
    year: 2000,
    grade: 10,
    set_number: "292",
    grader_cert_id: "0001234567",
    properties: ["holo"],
    listed_value: 120,
    fair_market_value: 30,
  }),
  card("d", {
    year: 2024,
    subject: "Slaking ex",
    title: "2024 Pokémon Surging Sparks Slaking ex #227 CGC 10",
    grade: 10,
    set_name: "Surging Sparks",
    set_number: "227/191",
    grader: "CGC",
    grader_cert_id: "88888888",
    properties: ["ultra rare", "holo"],
    listed_value: 25,
  }),
  card("e", {
    category: "basketball",
    subject: "Michael Jordan",
    title: "1996 Basketball Michael Jordan PSA 8",
    year: 1996,
    grade: 8,
    set_name: "Finest",
    set_number: "23",
    grader_cert_id: "99999999",
    properties: [],
    fair_market_value: 1000,
  }),
];
export const index = buildIndex(records, collectibleFields);
