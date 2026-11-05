"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";

export default function Home() {
  const tools = useQuery(api.tools.listPublic);

  return (
    <main>
      <div className="row">
        <h1>LendLoop</h1>

        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>

      <p className="muted">Borrow what you need. Lend what you don’t.</p>

      <SignedOut>
        <SignInButton mode="modal">
          <button className="primary">Sign in to lend or borrow</button>
        </SignInButton>
      </SignedOut>

      <SignedIn>
        <Link href="/dashboard">
          <button className="primary">Open dashboard</button>
        </Link>
      </SignedIn>

      <h2>Available tools</h2>
      {tools === undefined && <p className="muted">Loading…</p>}
      {tools?.length === 0 && <p className="muted">No tools listed yet.</p>}
      {tools?.map((t) => (
        <div className="card row" key={t._id}>
          <span>{t.name}</span>
          <span className="muted">
            {t.category} · {t.status === "available" ? "available" : "on loan"}
          </span>
        </div>
      ))}
    </main>
  );
}
