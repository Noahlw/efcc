"use client";

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type Home = {
  content: { version: number; status: string; title: string } | null;
};

export default function ProofQueryPage() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <ProofHome />
    </QueryClientProvider>
  );
}

function ProofHome() {
  const client = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  const [epoch, setEpoch] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const home = useQuery<Home>({
    queryKey: ["home", epoch],
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
      void client.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (error) => {
      setMessage(error.message);
    },
  });
  async function login() {
    const response = await fetch("/api/login", { method: "POST" });
    setMessage(response.ok ? "Signed in" : "Sign in failed");
    if (response.ok) setEpoch((value) => value + 1);
  }
  async function logout() {
    const response = await fetch("/api/logout", { method: "POST" });
    if (response.ok) {
      client.clear();
      setEpoch((value) => value + 1);
      setMessage("Signed out; cached Home cleared");
    }
  }
  return (
    <main>
      <h1 ref={heading} tabIndex={-1}>
        Next Query proof
      </h1>
      <nav>
        <Link href="/proof-about">About</Link>
      </nav>
      <p role="status">{message}</p>
      <Button onClick={login}>Sign in</Button>{" "}
      <Button onClick={logout}>Sign out</Button>
      <p data-testid="home-state">
        {home.isPending
          ? "Loading"
          : home.isError
            ? home.error.message
            : `${home.data?.content?.title}: ${home.data?.content?.status}`}
      </p>
      {home.data?.content?.status === "Draft" && (
        <Button
          disabled={publish.isPending}
          onClick={() => publish.mutate(home.data!.content!.version)}
        >
          Publish
        </Button>
      )}
    </main>
  );
}
