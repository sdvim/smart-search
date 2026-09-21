import { splitDraft } from "./parse.ts";
import type { DraftCommitMode } from "./parse.ts";
import type { SearchDictionary, SearchValue } from "./types.ts";

function tokenId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

export function updateDraft(
  value: SearchValue,
  draft: string,
  dictionary: SearchDictionary,
  commit: DraftCommitMode = false,
): SearchValue {
  if (value.editingId && !commit) return { ...value, draft };
  const next = splitDraft(draft, dictionary, commit);
  const tokens = next.tokens.map((token) => ({ ...token, id: tokenId() }));
  if (value.editingId) {
    if (next.draft) return { ...value, draft };
    return {
      tokens: value.tokens.flatMap((token) => (token.id === value.editingId ? tokens : [token])),
      draft: "",
      editingId: null,
    };
  }
  return { tokens: [...value.tokens, ...tokens], draft: next.draft, editingId: null };
}
