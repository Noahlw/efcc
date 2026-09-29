import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

export const Route = createFileRoute("/about")({ component: About });

function About() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <main>
      <h1 ref={heading} tabIndex={-1}>
        About Start proof
      </h1>
    </main>
  );
}
