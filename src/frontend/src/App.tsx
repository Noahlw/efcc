// Top-level App: routes between Login, Registration, and Profile views based on session state.
// Per ADR-0005: PIN login flow is the canonical path; Gmail SSO is deferred.
import { useEffect, useState } from "react";
import { getSession } from "./services/session";
import { LoginView } from "./views/LoginView";
import { MemberRegistrationView } from "./views/MemberRegistrationView";
import { MyProfileView } from "./views/MyProfileView";

type Route = "login" | "register" | "profile";

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%)",
  fontFamily: "system-ui, sans-serif",
};

export default function App() {
  const [route, setRoute] = useState<Route>(() =>
    getSession() ? "profile" : "login"
  );

  // React to logouts/login changes from other tabs or programmatic clears.
  useEffect(() => {
    const handleStorage = () => {
      const session = getSession();
      setRoute(session ? "profile" : "login");
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return (
    <main style={pageStyle} data-testid="app-root" data-route={route}>
      {route === "login" && (
        <LoginView
          onNavigateRegister={() => setRoute("register")}
          onLoggedIn={() => setRoute("profile")}
        />
      )}
      {route === "register" && (
        <MemberRegistrationView
          onCancel={() => setRoute("login")}
          onRegistered={() => setRoute("login")}
        />
      )}
      {route === "profile" && (
        <MyProfileView onLogout={() => setRoute("login")} />
      )}
    </main>
  );
}
