"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type { Contact } from "@mobileclient/shared-types";
import { ContactForm } from "@/components/contact-form";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { ApiError, contactsApi } from "@/lib/client/api-client";

interface Props {
  params: Promise<{ guid: string }>;
}

export default function ContactPage({ params }: Readonly<Props>) {
  const { guid } = use(params);
  const { session } = useSession();
  const [contact, setContact] = useState<Contact | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await contactsApi.get(session.userGuid, guid);
        if (!cancelled) setContact(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setContact(null);
        else setError(err instanceof ApiError ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, guid]);

  if (!session) return null;
  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (contact === undefined) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (contact === null) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">Contact not found.</p>
        <Button variant="ghost" asChild>
          <Link href="/">Back</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex items-center justify-between border-b bg-primary px-4 py-3 text-primary-foreground">
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          aria-label="Back"
        >
          <Link href="/">←</Link>
        </Button>
        <h1 className="text-sm font-semibold">Contact Details</h1>
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          aria-label="Close"
        >
          <Link href="/">×</Link>
        </Button>
      </header>
      <div className="p-4">
        <ContactForm initial={contact} />
      </div>
    </main>
  );
}
