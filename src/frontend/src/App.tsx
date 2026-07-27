// Top-level App: routes between Login, Registration, and Profile views based on session state.
// Per ADR-0005: PIN login flow is the canonical path; Gmail SSO is deferred.
import { useEffect, useState } from "react";
import { getSession } from "./services/session";
import type { SessionPayload } from "./types";
import { LoginView } from "./views/LoginView";
import { MemberRegistrationView } from "./views/MemberRegistrationView";
import { MyProfileView } from "./views/MyProfileView";
import { ProgramCatalogView } from "./views/ProgramCatalogView";
import { ProgramEnrollmentView } from "./views/ProgramEnrollmentView";
import { EventManagementView } from "./views/EventManagementView";

type Route = "login" | "register" | "profile" | "programs" | "enrollment" | "events";

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%)",
  fontFamily: "system-ui, sans-serif",
};

export default function App() {
  const [route, setRoute] = useState<Route>(() =>
    getSession() ? "profile" : "login"
  );
  const [selectedProgramId, setSelectedProgramId] = useState<string | undefined>();
  const [activeSession, setActiveSession] = useState<SessionPayload | null>(() => getSession());

  // React to logouts/login changes from other tabs or programmatic clears.
  useEffect(() => {
    const handleStorage = () => {
      const nextSession = getSession();
      setActiveSession(nextSession);
      setRoute(nextSession ? "profile" : "login");
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return (
    <main style={pageStyle} data-testid="app-root" data-route={route}>
      {route === "login" && (
        <LoginView
          onNavigateRegister={() => setRoute("register")}
          onLoggedIn={() => {
            setActiveSession(getSession());
            setRoute("profile");
          }}
        />
      )}
      {route === "register" && (
        <MemberRegistrationView
          onCancel={() => setRoute("login")}
          onRegistered={() => setRoute("login")}
        />
      )}
      {route === "profile" && (
        <MyProfileView
          onLogout={() => {
            setActiveSession(null);
            setRoute("login");
          }}
          onOpenPrograms={() => setRoute("programs")}
          onOpenEvents={() => setRoute("events")}
        />
      )}
      {route === "programs" && activeSession && (
        <ProgramCatalogView
          onBack={() => setRoute("profile")}
          onViewEnrollment={(programId) => {
            setSelectedProgramId(programId);
            setRoute("enrollment");
          }}
        />
      )}
      {route === "enrollment" && activeSession && (
        <ProgramEnrollmentView
          currentUserId={activeSession.userId}
          initialProgramId={selectedProgramId}
          onBack={() => setRoute("programs")}
        />
      )}
      {route === "events" && activeSession && (
        <EventManagementView
          grantedUserId={activeSession.userId}
          sessionToken={activeSession.sessionToken}
          onBack={() => setRoute("profile")}
        />
      )}
    </main>
  );
}
