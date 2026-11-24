"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import styles from "./ponyo-select.module.css";

export type PonyoSelectOption = {
  value: string;
  label: string;
  detail?: string;
  icon?: string;
  disabled?: boolean;
};

type PonyoSelectProps = {
  options: PonyoSelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  autoComplete?: string;
  placeholder?: string;
  label?: string;
  labelledBy?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  searchable?: boolean;
  compact?: boolean;
};

export function PonyoSelect({
  options,
  value,
  defaultValue = "",
  onChange,
  name,
  required = false,
  disabled = false,
  id,
  autoComplete,
  placeholder,
  label = "Choose an option",
  labelledBy,
  searchPlaceholder = "Search options",
  emptyMessage = "No matches found.",
  searchable = false,
  compact = false,
}: PonyoSelectProps) {
  const generatedId = useId().replaceAll(":", "");
  const listId = `ponyo-select-list-${generatedId}`;
  const searchId = `ponyo-select-search-${generatedId}`;
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = isControlled ? value : internalValue;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const keyboardOpening = useRef(false);
  const validationOpening = useRef(false);

  const selectedOption = options.find((option) => option.value === selectedValue);
  const isPositioned = Boolean(position);
  const filteredOptions = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search) return options;
    return options.filter((option) =>
      `${option.label} ${option.detail ?? ""} ${option.value}`.toLocaleLowerCase().includes(search),
    );
  }, [options, query]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const desiredHeight = Math.min(340, 68 + (searchable ? 60 : 0) + Math.min(filteredOptions.length, 6) * 44);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
    const availableSpace = openAbove ? spaceAbove : spaceBelow;
    const height = Math.min(desiredHeight, Math.max(140, availableSpace));
    setPosition({
      position: "fixed",
      left,
      top: openAbove ? rect.top - height - 8 : rect.bottom + 8,
      width,
      maxHeight: height,
      zIndex: 11000,
    });
  }, [filteredOptions.length, searchable]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !wrapperRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, searchable, updatePosition]);

  useEffect(() => {
    if (!open || !isPositioned) return;
    if (validationOpening.current) {
      validationOpening.current = false;
      triggerRef.current?.focus();
    } else if (keyboardOpening.current) {
      keyboardOpening.current = false;
      wrapperRef.current?.querySelector<HTMLButtonElement>(`.${styles.option}:not(:disabled)`)?.focus();
    } else if (searchable) {
      searchRef.current?.focus();
    }
  }, [isPositioned, open, searchable]);

  function chooseOption(option: PonyoSelectOption) {
    if (option.disabled) return;
    if (!isControlled) setInternalValue(option.value);
    onChange?.(option.value);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function moveOptionFocus(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const selectable = Array.from(
      popoverRef.current?.querySelectorAll<HTMLButtonElement>(`.${styles.option}:not(:disabled)`) ?? [],
    );
    if (!selectable.length) return;
    const currentIndex = selectable.indexOf(event.currentTarget);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? selectable.length - 1
        : (currentIndex + (event.key === "ArrowDown" ? 1 : selectable.length - 1)) % selectable.length;
    selectable[nextIndex]?.focus();
  }

  return (
    <div className={`${styles.root}${compact ? ` ${styles.compact}` : ""}`} ref={wrapperRef}>
      <select
        className={styles.nativeSelect}
        name={name}
        autoComplete={autoComplete}
        value={selectedValue}
        required={required}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          if (!isControlled) setInternalValue(event.currentTarget.value);
          onChange?.(event.currentTarget.value);
        }}
        onInvalid={(event) => {
          event.preventDefault();
          validationOpening.current = true;
          setOpen(true);
        }}
      >
        {placeholder !== undefined && <option value="" disabled={required}>{placeholder}</option>}
        {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
      </select>
      <button
        ref={triggerRef}
        id={id}
        className={styles.trigger}
        type="button"
        role="combobox"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              keyboardOpening.current = true;
              setOpen(true);
            } else {
              const selectable = popoverRef.current?.querySelectorAll<HTMLButtonElement>(`.${styles.option}:not(:disabled)`);
              const target = event.key === "ArrowDown" ? selectable?.[0] : selectable?.[selectable.length - 1];
              target?.focus();
            }
          }
        }}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
      >
        <span className={styles.badge} aria-hidden="true">{selectedOption?.icon ?? "✦"}</span>
        <span className={`${styles.copy}${selectedOption ? "" : ` ${styles.placeholder}`}`}>
          <b>{selectedOption?.label ?? placeholder ?? label}</b>
          {selectedOption?.detail && <small>{selectedOption.detail}</small>}
        </span>
        <svg className={`${styles.chevron}${open ? ` ${styles.chevronOpen}` : ""}`} viewBox="0 0 12 12" aria-hidden="true">
          <path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && position && createPortal(
        <section
          ref={popoverRef}
          className={styles.popover}
          style={position}
          role="dialog"
          aria-label={label}
        >
          <header className={styles.heading}>
            <span aria-hidden="true">✦</span>
            <strong>{label}</strong>
            <button type="button" aria-label="Close" onClick={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}>×</button>
          </header>
          {searchable && <label className={styles.search} htmlFor={searchId}>
            <span aria-hidden="true">⌕</span>
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  popoverRef.current?.querySelector<HTMLButtonElement>(`.${styles.option}:not(:disabled)`)?.focus();
                }
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </label>}
          <div className={styles.options} id={listId} role="listbox" aria-label={label}>
            {filteredOptions.map((option) => <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={selectedValue === option.value}
              className={styles.option}
              disabled={option.disabled}
              onKeyDown={moveOptionFocus}
              onClick={() => chooseOption(option)}
            >
              <span className={styles.badge} aria-hidden="true">{option.icon ?? "✦"}</span>
              <span className={styles.optionCopy}><b>{option.label}</b>{option.detail && <small>{option.detail}</small>}</span>
              {selectedValue === option.value && <span className={styles.check} aria-hidden="true">✓</span>}
            </button>)}
            {!filteredOptions.length && <p className={styles.empty}>{emptyMessage}</p>}
          </div>
        </section>,
        document.body,
      )}
    </div>
  );
}
