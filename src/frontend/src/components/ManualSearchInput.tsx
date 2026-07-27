import { useEffect, useRef, useState } from "react";

import { apiService } from "../services/api";

interface SearchMember {
  userId: string;
  name: string;
  phone?: string;
}

interface Props {
  grantedUserId: string;
  sessionToken: string;
  onCheckIn: (memberId: string, memberName: string) => void;
  disabled?: boolean;
}

const SEARCH_DEBOUNCE_MS = 250;

const styles: Record<string, React.CSSProperties> = {
  checkInBtn: {
    background: "#2563eb",
    border: "none",
    borderRadius: "0.375rem",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: 600,
    padding: "0.5rem 1rem",
  },
  checkInBtnDisabled: { cursor: "not-allowed", opacity: 0.5 },
  hint: { color: "#94a3b8", fontSize: "0.78rem", marginTop: 4 },
  input: {
    border: "1px solid #cbd5e1",
    borderRadius: "0.5rem",
    boxSizing: "border-box",
    fontSize: "0.95rem",
    padding: "0.75rem 1rem",
    width: "100%",
  },
  label: {
    color: "#475569",
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 600,
    marginBottom: 6,
  },
  resultInfo: { flex: 1 },
  resultItem: {
    alignItems: "center",
    borderBottom: "1px solid #f1f5f9",
    display: "flex",
    justifyContent: "space-between",
    padding: "0.75rem 0",
  },
  resultMeta: { color: "#64748b", fontSize: "0.78rem", margin: "2px 0 0" },
  resultName: {
    color: "#0f172a",
    fontSize: "0.95rem",
    fontWeight: 600,
    margin: 0,
  },
  results: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "0.5rem",
    marginTop: 8,
    maxHeight: 240,
    overflowY: "auto",
    padding: "0 1rem",
  },
  wrapper: { marginTop: 16 },
};

export function ManualSearchInput({
  grantedUserId,
  sessionToken,
  onCheckIn,
  disabled,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMember[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    clearTimeout(debounceRef.current ?? undefined);
    const trimmed = query.trim();
    if (!trimmed) {
      requestSeq.current += 1;
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      requestSeq.current += 1;
      const seq = requestSeq.current;
      try {
        const members = await apiService.searchMembers(
          trimmed,
          grantedUserId,
          sessionToken
        );
        if (seq === requestSeq.current) {
          setResults(members);
        }
      } catch {
        if (seq === requestSeq.current) {
          setResults([]);
        }
      } finally {
        if (seq === requestSeq.current) {
          setSearching(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(debounceRef.current ?? undefined);
    };
  }, [query, grantedUserId, sessionToken]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleSelect = (member: SearchMember) => {
    onCheckIn(member.userId, member.name);
    setQuery("");
    setResults([]);
  };

  return (
    <div style={styles.wrapper}>
      <label style={styles.label} htmlFor="manual-search-input">
        Search Member (Manual Check-In)
      </label>
      <input
        id="manual-search-input"
        type="text"
        placeholder="Type name, ID, or phone..."
        value={query}
        onChange={handleChange}
        style={styles.input}
        disabled={disabled}
        autoComplete="off"
      />
      {results.length > 0 && (
        <div style={styles.results}>
          {results.slice(0, 10).map((member) => (
            <div key={member.userId} style={styles.resultItem}>
              <div style={styles.resultInfo}>
                <p style={styles.resultName}>{member.name}</p>
                <p style={styles.resultMeta}>
                  {member.userId}
                  {member.phone ? ` \u00B7 ${member.phone}` : ""}
                </p>
              </div>
              <button
                type="button"
                style={{
                  ...styles.checkInBtn,
                  ...(disabled ? styles.checkInBtnDisabled : {}),
                }}
                onClick={() => handleSelect(member)}
                disabled={disabled}
              >
                Check In
              </button>
            </div>
          ))}
        </div>
      )}
      {!searching && query.trim() && results.length === 0 && (
        <p style={styles.hint}>No matching members found.</p>
      )}
    </div>
  );
}

export default ManualSearchInput;
