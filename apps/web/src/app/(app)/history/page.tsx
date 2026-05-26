"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Contact } from "@mobileclient/shared-types";
import { ActivityList } from "@/components/activity-list";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { contactsApi } from "@/lib/client/api-client";

export default function HistoryPage() {
  const { session } = useSession();
  const searchParams = useSearchParams();
  const contactGuid = searchParams.get("contactGuid");
  const identityValue = searchParams.get("identityValue");
  const [contact, setContact] = useState<Contact | null>(null);

  useEffect(() => {
    if (!session || !contactGuid) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await contactsApi.get(session.userGuid, contactGuid);
        if (!cancelled) setContact(data);
      } catch {
        // Unknown contact path: contactGuid may not resolve; header falls back
        // to the identityValue display.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, contactGuid]);

  if (!session) return null;

  let filter: { contactGuid: string } | { identityValue: string } | undefined;
  if (contactGuid) filter = { contactGuid };
  else if (identityValue) filter = { identityValue };

  const hasContext = !!(contactGuid || identityValue);
  const displayName =
    [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") ||
    contact?.company ||
    identityValue ||
    "";
  const meta =
    contact?.company && identityValue
      ? `${contact.company} · ${identityValue}`
      : contact?.company || identityValue || "";
  const initials =
    (contact?.firstName?.[0] ?? "") + (contact?.lastName?.[0] ?? "") ||
    identityValue?.slice(0, 1) ||
    "?";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex items-center gap-3 border-b px-3 py-2">
        <Button variant="ghost" size="icon" asChild aria-label="Back">
          <Link href="/">←</Link>
        </Button>
        {hasContext ? (
          <>
            {contact?.photoData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contact.photoData}
                alt=""
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {initials.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{displayName}</div>
              {meta && (
                <div className="truncate text-xs text-muted-foreground">{meta}</div>
              )}
            </div>
            {contactGuid && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/contact/${contactGuid}`}>Edit</Link>
              </Button>
            )}
          </>
        ) : (
          <h1 className="flex-1 text-sm font-semibold">Activity</h1>
        )}
      </header>
      <ActivityList userGuid={session.userGuid} filter={filter} />
    </main>
  );
}
