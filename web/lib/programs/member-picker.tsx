"use client";
/* oxlint-disable jsx-a11y/no-noninteractive-element-to-interactive-role, jsx-a11y/prefer-tag-over-role, jsx-a11y/control-has-associated-label -- preserve the accessible combobox/listbox contract */

import { useEffect, useState } from "react";

import { COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { searchMemberOptions } from "@/lib/programs/program-api";
import type { MemberOption } from "@/lib/programs/program-api";

import styles from "@/app/programs/programs.module.css";

export const MemberPicker = ({
  programId,
  name,
  label,
  placeholder,
  searchOptions,
}: {
  programId: string;
  name: string;
  label: string;
  placeholder: string;
  searchOptions?: (query: string) => Promise<{ members: MemberOption[] }>;
}) => {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MemberOption | null>(null);
  const [options, setOptions] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);

  const pick = (member: MemberOption) => {
    setSelected(member);
    setQuery(`${member.name} (${member.username})`);
    setOptions([]);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (options.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((value) => Math.min(value + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((value) => Math.max(value - 1, -1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      pick(options[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOptions([]);
      setActiveIndex(-1);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelected(null);
    setActiveIndex(-1);
    setQuery(event.target.value);
  };

  useEffect(() => {
    const value = query.trim();
    if (selected || value.length < 2) {
      setOptions([]);
      setSearchError(false);
      return;
    }
    let current = true;
    setLoading(true);
    setSearchError(false);
    void (async () => {
      try {
        const result = await (searchOptions
          ? searchOptions(value)
          : searchMemberOptions(programId, value));
        if (current) {
          setOptions(result.members);
          announce(
            result.members.length === 0
              ? COPY.programs.memberSearchEmpty
              : COPY.programs.memberSearchResults.replace(
                  "{count}",
                  String(result.members.length)
                )
          );
        }
      } catch {
        if (current) {
          setOptions([]);
          setSearchError(true);
          announce(COPY.programs.memberSearchError);
        }
      } finally {
        if (current) {
          setLoading(false);
        }
      }
    })();
    return () => {
      current = false;
    };
  }, [programId, query, retryToken, searchOptions, selected]);

  return (
    <div className={styles.picker}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{label}</span>
        <input
          className={styles.input}
          type="search"
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-describedby={`${name}-hint`}
          aria-controls={`${name}-options`}
          aria-expanded={options.length > 0}
          onKeyDown={handleKeyDown}
          aria-activedescendant={
            activeIndex >= 0 ? `${name}-option-${activeIndex}` : undefined
          }
          onChange={handleChange}
        />
      </label>
      <input type="hidden" name={name} value={selected?.user_id ?? ""} />
      <p id={`${name}-hint`} className={styles.fieldHint}>
        {loading
          ? COPY.programs.memberSearchLoading
          : searchError
            ? COPY.programs.memberSearchError
            : query.trim().length > 0 && query.trim().length < 2
              ? COPY.programs.memberSearchHint
              : options.length === 0 && query.trim().length >= 2
                ? COPY.programs.memberSearchEmpty
                : COPY.programs.memberSearchHint}
      </p>
      {searchError && (
        <button
          type="button"
          className={styles.retry}
          onClick={() => setRetryToken((value) => value + 1)}
        >
          {COPY.programs.memberSearchRetry}
        </button>
      )}
      {selected !== null && (
        <div className={styles.selectedMember}>
          <span>{`${selected.name} (${selected.username})`}</span>
          <button
            type="button"
            className={styles.clearSelection}
            onClick={() => {
              setSelected(null);
              setQuery("");
            }}
          >
            {COPY.programs.clearMember}
          </button>
        </div>
      )}
      {options.length > 0 && (
        <ul
          id={`${name}-options`}
          className={styles.memberOptions}
          aria-label={label}
          role="listbox"
        >
          {options.map((member, index) => (
            <li
              key={member.user_id}
              id={`${name}-option-${index}`}
              role="option"
              aria-selected={activeIndex === index}
            >
              <button
                type="button"
                className={styles.memberOption}
                onClick={() => {
                  pick(member);
                }}
              >
                <strong>{member.name}</strong>
                <span>{member.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
