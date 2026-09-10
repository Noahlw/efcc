"use client";
/* oxlint-disable jsx-a11y/no-noninteractive-element-to-interactive-role, jsx-a11y/prefer-tag-over-role, jsx-a11y/control-has-associated-label -- preserve the accessible combobox/listbox contract */

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { searchMemberOptions } from "@/lib/programs/program-api";
import type { MemberOption } from "@/lib/programs/program-api";
import {
  ScreenCard,
  ScreenField,
  ScreenRow,
  ScreenRowList,
  ScreenRowMain,
  ScreenRowMeta,
  ScreenRowTitle,
} from "@/lib/screen-foundations";

export const MemberPicker = ({
  programId,
  name,
  label,
  placeholder,
  searchOptions,
  excludeEnrolled,
}: {
  programId: string;
  name: string;
  label: string;
  placeholder: string;
  searchOptions?: (query: string) => Promise<{ members: MemberOption[] }>;
  excludeEnrolled?: boolean;
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
          : searchMemberOptions(programId, value, { excludeEnrolled }));
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
  }, [programId, query, retryToken, searchOptions, selected, excludeEnrolled]);

  const inputId = `${name}-input`;
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;
  const helperText = loading
    ? COPY.programs.memberSearchLoading
    : query.trim().length > 0 && query.trim().length < 2
      ? COPY.programs.memberSearchHint
      : options.length === 0 && query.trim().length >= 2
        ? COPY.programs.memberSearchEmpty
        : COPY.programs.memberSearchHint;

  return (
    <div className="grid min-w-0 gap-3">
      <ScreenField
        className="min-w-0"
        error={
          searchError ? (
            <span id={errorId}>{COPY.programs.memberSearchError}</span>
          ) : undefined
        }
        help={<span id={hintId}>{helperText}</span>}
        htmlFor={inputId}
        label={label}
      >
        <Input
          autoComplete="off"
          className="min-w-0 border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base text-[var(--screen-ink)] placeholder:text-[var(--screen-muted)]"
          id={inputId}
          placeholder={placeholder}
          role="combobox"
          type="search"
          value={query}
          aria-describedby={searchError ? `${hintId} ${errorId}` : hintId}
          aria-controls={`${name}-options`}
          aria-expanded={options.length > 0}
          onKeyDown={handleKeyDown}
          aria-activedescendant={
            activeIndex >= 0 ? `${name}-option-${activeIndex}` : undefined
          }
          onChange={handleChange}
        />
      </ScreenField>
      <input type="hidden" name={name} value={selected?.user_id ?? ""} />
      {searchError && (
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-11 w-fit whitespace-normal border-[var(--screen-danger)] bg-transparent text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)] hover:text-[var(--screen-danger)]"
          onClick={() => setRetryToken((value) => value + 1)}
        >
          {COPY.programs.memberSearchRetry}
        </Button>
      )}
      {selected !== null && (
        <ScreenCard className="flex min-w-0 flex-wrap items-center justify-between gap-3 [overflow-wrap:anywhere]">
          <span className="min-w-0 wrap-anywhere">{`${selected.name} (${selected.username})`}</span>
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-11 w-fit whitespace-normal border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
            onClick={() => {
              setSelected(null);
              setQuery("");
            }}
          >
            {COPY.programs.clearMember}
          </Button>
        </ScreenCard>
      )}
      {options.length > 0 && (
        <ScreenRowList className="min-w-0">
          <ul
            id={`${name}-options`}
            className="m-0 min-w-0 list-none p-0"
            aria-label={label}
            role="listbox"
          >
            {options.map((member, index) => (
              <li
                key={member.user_id}
                id={`${name}-option-${index}`}
                className="min-w-0"
                role="option"
                aria-selected={activeIndex === index}
              >
                <ScreenRow
                  asChild
                  selected={activeIndex === index}
                  className="rounded-none"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto min-h-[var(--screen-row-min-height)] w-full justify-between gap-2 px-3 py-[var(--screen-row-padding-block)] text-left text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
                    onClick={() => {
                      pick(member);
                    }}
                  >
                    <ScreenRowMain>
                      <ScreenRowTitle>{member.name}</ScreenRowTitle>
                      <ScreenRowMeta>{member.username}</ScreenRowMeta>
                    </ScreenRowMain>
                  </Button>
                </ScreenRow>
              </li>
            ))}
          </ul>
        </ScreenRowList>
      )}
    </div>
  );
};
