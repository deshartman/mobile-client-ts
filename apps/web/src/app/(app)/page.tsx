"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { MainList } from "@/components/main-list";
import { MyNumberBar } from "@/components/my-number-bar";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

export default function HomePage() {
  const { session } = useSession();
  const [query, setQuery] = useState("");
  if (!session) return null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      {/* Top bar: sticky + safe-area-inset-top padding so the iPhone notch
          doesn't punch into the search input when installed as a PWA. */}
      <header
        className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/90 px-4 py-2 backdrop-blur"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search name, company, or number"
          ariaLabel="Search contacts"
        />
        <Button
          size="icon"
          asChild
          aria-label="New contact"
          className="h-9 w-9 shrink-0 rounded-full"
        >
          <Link href="/contact/new">
            <Plus className="h-5 w-5" />
          </Link>
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto">
        <MainList userGuid={session.userGuid} query={query} />
      </div>
      <MyNumberBar userGuid={session.userGuid} />
    </main>
  );
}
