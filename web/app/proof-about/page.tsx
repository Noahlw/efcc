"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function ProofAboutPage() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <main>
      <h1 ref={heading} tabIndex={-1}>
        About Next proof
      </h1>
      <Link href="/proof-query">Home</Link>
    </main>
  );
}
