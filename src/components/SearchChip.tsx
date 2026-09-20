import { X } from "lucide-react";
import type { QueryToken } from "../search/types.ts";

type Props = {
  token: QueryToken;
  layout?: { compact: boolean; width: number };
  onEdit: () => void;
  onRemove: () => void;
};

export function SearchChip({ token, layout, onEdit, onRemove }: Props) {
  return (
    <span
      className="search-chip"
      data-chip={token.id}
      data-compact={layout?.compact ?? false}
      style={layout ? { width: layout.width } : undefined}
    >
      <button
        type="button"
        className="chip-edit"
        aria-label={`Edit ${token.label}`}
        title={token.label}
        onClick={onEdit}
      >
        {layout?.compact ? token.compactLabel : token.label}
      </button>
      <button
        type="button"
        className="chip-remove"
        aria-label={`Remove ${token.label}`}
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </button>
    </span>
  );
}
