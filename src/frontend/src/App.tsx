import { getSession } from "./services/session";

export default function App() {
  const session = getSession();
  const greeting = session
    ? `Welcome back, ${session.name} (${session.role})`
    : "Not signed in";
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>EFCC WebApp Scaffolding</h1>
      <p data-testid="session-state">{greeting}</p>
    </main>
  );
}
