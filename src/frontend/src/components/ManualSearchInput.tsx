import { useState, useCallback } from "react";

interface SearchMember {
  userId: string;
  name: string;
  phone?: string;
}

interface Props {
  onCheckIn: (memberId: string, memberName: string) => void;
  disabled?: boolean;
}

// Mock members for development mode — in production this calls a server RPC.
const MOCK_MEMBERS: SearchMember[] = [
  { userId: "GC-MOCK-0001", name: "Alice Chen", phone: "0912-345-678" },
  { userId: "GC-MOCK-0002", name: "Bob Wang", phone: "0987-654-321" },
  { userId: "GC-MOCK-0003", name: "Carol Liu", phone: "0955-123-456" },
  { userId: "GC-MOCK-0004", name: "David Lin", phone: "0933-789-012" },
  { userId: "GC-MOCK-0005", name: "Eva Huang", phone: "0977-456-789" },
];

function filterMembers(query: string): SearchMember[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return MOCK_MEMBERS.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      m.userId.toLowerCase().includes(q) ||
      (m.phone ?? "").includes(q)
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { marginTop: 16 },
  label: {
    display: "block",
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#475569",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: "1rem",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    outline: "none",
    boxSizing: "border-box",
  },
  results: {
    marginTop: 4,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    maxHeight: 240,
    overflowY: "auto",
    background: "#fff",
  },
  resultItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    borderBottom: "1px solid #f1f5f9",
  },
  resultInfo: { flex: 1 },
  resultName: {
    margin: 0,
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "#0f172a",
  },
  resultMeta: { margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" },
  checkInBtn: {
    padding: "6px 14px",
    fontSize: "0.8rem",
    fontWeight: 600,
    border: "none",
    borderRadius: 6,
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  checkInBtnDisabled: { opacity: 0.5, cursor: "not-allowed" },
  hint: { marginTop: 4, fontSize: "0.78rem", color: "#94a3b8" },
};

export function ManualSearchInput({ onCheckIn, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMember[]>([]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setResults(filterMembers(val));
  }, []);

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
      {query && results.length === 0 && (
        <p style={styles.hint}>No matching members found.</p>
      )}
    </div>
  );
}

export default ManualSearchInput;
