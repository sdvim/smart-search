import { useEffect, useId, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent, PointerEvent } from "react";
import { Search, X } from "lucide-react";
import { emptySearch, serializeQuery } from "../search/types.ts";
import type { SearchSuggestion, SearchValue } from "../search/types.ts";
import { SearchChip } from "./SearchChip.tsx";
import { useCompaction } from "./useCompaction.ts";
import "./smart-search.css";

export type SmartSearchBarProps = {
  value: SearchValue;
  onChange: (value: SearchValue, isComposing?: boolean) => void;
  suggestion: SearchSuggestion | null;
  onAcceptSuggestion: (suggestion: SearchSuggestion) => void;
  onSubmit: (draft?: string) => boolean | void;
  ariaLabel?: string;
  placeholder?: string;
};

export function SmartSearchBar({
  value,
  onChange,
  suggestion,
  onAcceptSuggestion,
  onSubmit,
  ariaLabel = "Search",
  placeholder = "Search...",
}: SmartSearchBarProps) {
  const input = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const measurements = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    x: number;
    y: number;
    scroll: number;
    mode: "accept" | "pan";
  } | null>(null);
  const suppressClick = useRef(false);
  const composing = useRef(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [atEnd, setAtEnd] = useState(true);
  const [allSelected, setAllSelected] = useState(false);
  const descriptionId = useId();
  const query = serializeQuery(value);
  const revision = `${query}:${value.editingId ?? ""}`;
  const visibleSuggestion = focused && atEnd && dismissed !== revision ? suggestion : null;
  const shownTokens = value.tokens.filter((token) => token.id !== value.editingId);
  const layout = useCompaction(
    shownTokens,
    scroller,
    measurements,
    revision + (visibleSuggestion?.suffix ?? ""),
  );
  const isEmpty = !value.tokens.length && !value.draft;

  function selectionOf(element: HTMLInputElement) {
    const length = element.value.length;
    const start = Math.max(0, Math.min(element.selectionStart ?? length, length));
    const end = Math.max(start, Math.min(element.selectionEnd ?? start, length));
    return { start, end, length };
  }

  useEffect(() => {
    if (focused) input.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [revision, layout, focused]);

  function focusInput(immediate = false, placeAtEnd = true) {
    const focus = () => {
      input.current?.focus({ preventScroll: true });
      if (placeAtEnd) {
        const length = input.current?.value.length ?? 0;
        input.current?.setSelectionRange(length, length);
      }
    };
    if (immediate) focus();
    else requestAnimationFrame(focus);
  }

  function accept() {
    if (!visibleSuggestion || composing.current) return;
    setAllSelected(false);
    onAcceptSuggestion(visibleSuggestion);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
      return;
    const selection = selectionOf(event.currentTarget);
    const atEnd = selection.start === selection.length && selection.end === selection.length;
    const isSpace = event.key === " " || event.key === "Spacebar" || event.code === "Space";
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && !event.altKey && key === "a") {
      event.preventDefault();
      setAllSelected(true);
      event.currentTarget.select();
      return;
    }
    if (allSelected && (event.key === "Backspace" || event.key === "Delete")) {
      event.preventDefault();
      setAllSelected(false);
      onChange(emptySearch);
      focusInput(true);
      return;
    }
    if (
      allSelected &&
      !((event.metaKey || event.ctrlKey) && !event.altKey && (key === "c" || key === "x"))
    )
      setAllSelected(false);
    if (isSpace && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && atEnd) {
      if (onSubmit(value.draft)) event.preventDefault();
      return;
    }
    if (
      event.key === "ArrowRight" &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      visibleSuggestion &&
      atEnd
    ) {
      event.preventDefault();
      accept();
      return;
    }
    if (event.key === "Tab" && !event.shiftKey && visibleSuggestion) {
      event.preventDefault();
      accept();
    }
    if (event.key === "Escape") {
      setDismissed(revision);
      if (value.editingId) onChange({ ...value, editingId: null, draft: "" });
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
    const atStart = selection.start === 0 && selection.end === 0;
    const wordModifier = event.altKey || event.ctrlKey || event.metaKey;
    if (event.key === "Backspace" && value.editingId && (!value.draft || (event.repeat && atEnd))) {
      event.preventDefault();
      onChange({
        ...value,
        tokens: value.tokens.filter((token) => token.id !== value.editingId),
        draft: "",
        editingId: null,
      });
      return;
    }
    if (
      event.key === "Backspace" &&
      !value.editingId &&
      value.tokens.length &&
      ((!value.draft && !wordModifier) || (atStart && wordModifier))
    ) {
      event.preventDefault();
      onChange(
        wordModifier || event.repeat
          ? { ...value, tokens: value.tokens.slice(0, -1) }
          : { ...value, editingId: value.tokens.at(-1)!.id, draft: value.tokens.at(-1)!.text },
      );
    }
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    setAllSelected(false);
    suppressClick.current = false;
    const target = event.target as Element;
    const editor = target.closest("[data-editor]");
    const chip = target.closest("[data-chip]");
    const touch = event.pointerType === "touch" || event.pointerType === "pen";
    if (editor && (!touch || !visibleSuggestion)) return;
    if (touch && visibleSuggestion && !chip) event.currentTarget.setPointerCapture(event.pointerId);
    else if (editor) return;
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      scroll: event.currentTarget.scrollLeft,
      mode: touch && visibleSuggestion && !chip ? "accept" : "pan",
    };
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) < 4 || Math.abs(dx) < Math.abs(event.clientY - start.y) * 1.15) return;
    suppressClick.current = true;
    if (start.mode === "pan") {
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.scrollLeft = start.scroll - dx;
    }
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (
      start?.mode === "accept" &&
      event.clientX - start.x > 32 &&
      event.clientX - start.x > Math.abs(event.clientY - start.y) * 1.15
    )
      accept();
  }

  function replaceSelectedText(text: string) {
    setAllSelected(false);
    onChange({ ...emptySearch, draft: text });
    focusInput();
  }

  function copySelected(event: ClipboardEvent<HTMLInputElement>, cut = false) {
    if (!allSelected) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", query);
    if (cut) replaceSelectedText("");
  }

  const editor = (
    <span className="search-editor" data-editor key="editor">
      <span className="input-wrap">
        <span className="input-sizer" aria-hidden="true">
          {value.draft || (isEmpty && !visibleSuggestion ? placeholder : "\u200b")}
        </span>
        <input
          ref={input}
          type="text"
          role="searchbox"
          name="q"
          aria-label={ariaLabel}
          aria-autocomplete="inline"
          aria-describedby={descriptionId}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          value={value.draft}
          placeholder={isEmpty && !visibleSuggestion ? placeholder : ""}
          onChange={(event) => {
            const selection = selectionOf(event.target);
            const nativeEvent = event.nativeEvent as InputEvent;
            const isComposing = composing.current || nativeEvent.isComposing;
            const atEnd =
              selection.start === selection.length && selection.end === selection.length;
            const draft = event.target.value;
            setAtEnd(!isComposing && atEnd);
            if (allSelected) {
              replaceSelectedText(draft);
              return;
            }
            if (
              !isComposing &&
              atEnd &&
              nativeEvent.inputType === "insertText" &&
              nativeEvent.data !== null &&
              /^\s$/.test(nativeEvent.data) &&
              draft.endsWith(nativeEvent.data) &&
              onSubmit(draft.slice(0, -nativeEvent.data.length))
            )
              return;
            onChange({ ...value, draft }, isComposing);
          }}
          onSelect={(event) => {
            const selection = selectionOf(event.currentTarget);
            if (allSelected && !(selection.start === 0 && selection.end === selection.length))
              setAllSelected(false);
            setAtEnd(
              !composing.current &&
                selection.start === selection.length &&
                selection.end === selection.length,
            );
          }}
          onKeyDown={onKeyDown}
          onCopy={(event) => copySelected(event)}
          onCut={(event) => copySelected(event, true)}
          onPaste={(event) => {
            if (!allSelected) return;
            event.preventDefault();
            replaceSelectedText(event.clipboardData.getData("text/plain"));
          }}
          onCompositionStart={() => {
            composing.current = true;
            setAtEnd(false);
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            const selection = selectionOf(event.currentTarget);
            setAtEnd(selection.start === selection.length && selection.end === selection.length);
            onChange({ ...value, draft: event.currentTarget.value });
          }}
        />
      </span>
      {visibleSuggestion ? (
        <button
          type="button"
          tabIndex={-1}
          className="search-suggestion"
          aria-label={`Accept suggestion ${visibleSuggestion.text}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={accept}
        >
          {visibleSuggestion.suffix}
        </button>
      ) : null}
    </span>
  );

  return (
    <div
      className="smart-search"
      onPointerDown={(event) => {
        const target = event.target as Element;
        const suggestionTarget = target.closest(".search-suggestion");
        if (
          suggestionTarget &&
          (event.pointerType === "touch" ||
            event.pointerType === "pen" ||
            navigator.maxTouchPoints > 0)
        ) {
          event.preventDefault();
          focusInput(true, false);
          return;
        }
        if (!target.closest("button")) {
          const isInput = target.closest("input");
          if (!isInput) event.preventDefault();
          focusInput(true, !isInput);
        }
      }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
          setAllSelected(false);
        }
      }}
    >
      <div
        className="search-scroll"
        ref={scroller}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          gesture.current = null;
        }}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <div className="search-track">
          <Search className="search-icon" aria-hidden="true" />
          {[
            ...value.tokens.map((token) =>
              token.id === value.editingId ? (
                editor
              ) : (
                <SearchChip
                  key={token.id}
                  token={token}
                  layout={layout[token.id]}
                  selected={allSelected}
                  onEdit={() => {
                    setAllSelected(false);
                    onChange({ ...value, editingId: token.id, draft: token.text });
                    focusInput();
                  }}
                  onRemove={() => {
                    setAllSelected(false);
                    onChange({
                      ...value,
                      tokens: value.tokens.filter((item) => item.id !== token.id),
                    });
                    focusInput();
                  }}
                />
              ),
            ),
            ...(!value.editingId ? [editor] : []),
          ]}
        </div>
      </div>
      {!isEmpty ? (
        <button
          className="search-clear"
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setAllSelected(false);
            onChange(emptySearch);
            focusInput();
          }}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
      <div ref={measurements} className="search-measurements" aria-hidden="true">
        {shownTokens.map((token) => (
          <span key={token.id}>
            <span className="chip-measure" data-full={token.id}>
              {token.label}
              <X />
            </span>
            <span className="chip-measure" data-short={token.id}>
              {token.compactLabel}
              <X />
            </span>
          </span>
        ))}
        <span data-editor-size>
          {value.draft}
          {visibleSuggestion?.suffix}
        </span>
      </div>
      <span id={descriptionId} className="visually-hidden">
        Enter or Space confirms the typed query. Tab, Right Arrow at the end, or swiping right
        accepts a suggestion. Escape dismisses it. Drag chips to scroll.
      </span>
      <output className="visually-hidden">
        {visibleSuggestion ? `Suggestion: ${visibleSuggestion.text}` : ""}
      </output>
    </div>
  );
}
