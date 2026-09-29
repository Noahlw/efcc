import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

const getHome = createServerFn({ method: "GET" }).handler(async () => {
  const { readHome } = await import("../server/home.server");
  return readHome();
});

export const Route = createFileRoute("/")({
  loader: () => getHome(),
  component: Home,
});

function Home() {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const result = Route.useLoaderData();
  const [message, setMessage] = useState("");
  const home =
    result.status === 200
      ? (result.data as {
          content: { title: string; status: string; version: number } | null;
        })
      : null;
  async function call(path: string, body?: unknown) {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      setMessage(
        response.ok
          ? `${path}: ${response.status}`
          : `${path}: ${response.status}; refresh before retry`
      );
      await router.invalidate();
    } catch {
      setMessage("Outcome unknown; refresh before retry");
    }
  }
  return (
    <main>
      <h1 ref={heading} tabIndex={-1}>
        Start Home proof
      </h1>
      <p role="status">{message}</p>
      <button onClick={() => void call("/api/login")}>Sign in</button>{" "}
      <button onClick={() => void call("/api/logout")}>Sign out</button>
      <p data-testid="home-state">
        {home?.content
          ? `${home.content.title}: ${home.content.status}`
          : "Sign in required"}
      </p>
      {home?.content?.status === "Draft" && (
        <button
          onClick={() =>
            void call("/api/publish", { version: home.content!.version })
          }
        >
          Publish
        </button>
      )}
    </main>
  );
}
