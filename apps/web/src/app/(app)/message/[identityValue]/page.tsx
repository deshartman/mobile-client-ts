"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { MessageThread } from "@/components/message-thread";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/hooks/use-session";
import { mainListApi } from "@/lib/client/api-client";

interface Props {
  params: Promise<{ identityValue: string }>;
}

export default function MessagePage({ params }: Readonly<Props>) {
  const { identityValue } = use(params);
  const { session } = useSession();
  const router = useRouter();
  const remoteAddress = decodeURIComponent(identityValue);
  const [displayName, setDisplayName] = useState(remoteAddress);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const rows = await mainListApi.get(session.userGuid);
      if (cancelled) return;
      const match = rows.find(
        (r) => r.kind === "contact" && r.identities.some((i) => i.value === remoteAddress),
      );
      if (match?.kind !== "contact") return;
      const name =
        [match.firstName, match.lastName].filter(Boolean).join(" ") || match.company;
      if (name) setDisplayName(name);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session, remoteAddress]);

  if (!session) return null;

  function closeSearch() {
    setSearchOpen(false);
    setSearch("");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          onClick={() => router.back()}
        >
          ←
        </Button>
        {searchOpen ? (
          <>
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="h-9 flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close search"
              onClick={closeSearch}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <span className="flex-1 truncate text-sm font-medium">{displayName}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search messages"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
            </Button>
          </>
        )}
      </header>
      <MessageThread userGuid={session.userGuid} remoteAddress={remoteAddress} search={search} />
    </main>
  );
}
