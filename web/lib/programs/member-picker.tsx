"use client";

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
}: {
  programId: string;
  name: string;
  label: string;
  placeholder: string;
}) => {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MemberOption | null>(null);
  const [options, setOptions] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

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
        const result = await searchMemberOptions(programId, value);
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
  }, [programId, query, retryToken, selected]);

  return (
    <div className={styles.picker}>
      <label className={styles.fieldLabel}>
        {label}
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
          onChange={(event) => {
            setSelected(null);
            setQuery(event.target.value);
          }}
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
        >
          {options.map((member) => (
            <li key={member.user_id}>
              <button
                type="button"
                className={styles.memberOption}
                onClick={() => {
                  setSelected(member);
                  setQuery(`${member.name} (${member.username})`);
                  setOptions([]);
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
