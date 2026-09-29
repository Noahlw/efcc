import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useRouterState,
} from "@tanstack/react-router";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type Home = {
  userId: string;
  content: { version: number; status: string; title: string } | null;
};
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
const rootRoute = createRootRoute({ component: Shell });
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});
const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: () => <h1 tabIndex={-1}>About proof</h1>,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, aboutRoute]),
});

function Shell() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      content.current?.querySelector("h1")?.focus()
    );
    return () => cancelAnimationFrame(frame);
  }, [path]);
  return (
    <>
      <nav>
        <Link to="/">Home</Link> <Link to="/about">About</Link>
      </nav>
      <main ref={content}>
        <Outlet />
      </main>
    </>
  );
}

function HomePage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const home = useQuery<Home>({
    queryKey: ["home", sessionEpoch],
    queryFn: async () => {
      const response = await fetch("/api/home");
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "Sign in required"
            : `Home ${response.status}`
        );
      return response.json();
    },
  });
  const publish = useMutation({
    mutationFn: async (version: number) => {
      let response: Response;
      try {
        response = await fetch("/api/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version }),
        });
      } catch {
        throw new Error("Outcome unknown; refresh Home before retrying");
      }
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? "Version changed; refresh Home"
            : "Outcome unknown; refresh Home before retrying"
        );
      return response.json();
    },
    onSuccess: () => {
      setMessage("Published");
      void queryClient.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (error) => {
      setMessage(error.message);
    },
  });
  async function login() {
    const response = await fetch("/api/login", { method: "POST" });
    setMessage(response.ok ? "Signed in" : "Sign in failed");
    if (response.ok) setSessionEpoch((value) => value + 1);
  }
  async function logout() {
    const response = await fetch("/api/logout", { method: "POST" });
    if (response.ok) {
      queryClient.clear();
      setSessionEpoch((value) => value + 1);
      setMessage("Signed out; cached Home cleared");
    }
  }
  return (
    <>
      <h1 tabIndex={-1}>Home proof</h1>
      <p role="status">{message}</p>
      <button onClick={login}>Sign in</button>{" "}
      <button onClick={logout}>Sign out</button>
      <p data-testid="home-state">
        {home.isPending
          ? "Loading"
          : home.isError
            ? home.error.message
            : `${home.data?.content?.title}: ${home.data?.content?.status}`}
      </p>
      {home.data?.content?.status === "Draft" && (
        <button
          disabled={publish.isPending}
          onClick={() => publish.mutate(home.data!.content!.version)}
        >
          Publish
        </button>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
