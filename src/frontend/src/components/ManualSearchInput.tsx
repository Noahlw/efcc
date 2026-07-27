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
  wrapper: { marginTop: 16 },
  label: {
    display: "block",
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#334155",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    padding: "0.65rem 0.85rem",
    borderRadius: "0.6rem",
    border: "1px solid #cbd5e1",
    fontSize: "0.95rem",
    boxSizing: "border-box",
  },
  results: {
    marginTop: 8,
    border: "1px solid #e2e8f0",
    borderRadius: "0.6rem",
    overflow: "hidden",
  },
  resultItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.6rem 0.85rem",
    borderBottom: "1px solid #f1f5f9",
  },
  resultInfo: { flex: 1 },
  resultName: { margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "#0f172a" },
  resultMeta: { margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" },
  checkInBtn: {
    padding: "0.4rem 0.9rem",
    borderRadius: "0.5rem",
    border: "none",
    background: "#0f172a",
    color: "#fff",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  checkInBtnDisabled: { opacity: 0.5, cursor: "not-allowed" },
  hint: { marginTop: 4, fontSize: "0.78rem", color: "#94a3b8" },
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
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = window.setTimeout(() => {
      const seq = ++requestSeq.current;
      apiService
        .searchMembers(trimmed, grantedUserId, sessionToken)
        .then((members) => {
          if (seq !== requestSeq.current) return;
          setResults(members);
        })
        .catch(() => {
          if (seq !== requestSeq.current) return;
          setResults([]);
        })
        .finally(() => {
          if (seq !== requestSeq.current) return;
          setSearching(false);
        });
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
                  {member.phone ? ` \u00b7 ${member.phone}` : ""}
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
