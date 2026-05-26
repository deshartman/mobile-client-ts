"use client";

import Link from "next/link";
import { ContactForm } from "@/components/contact-form";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

export default function NewContactPage() {
  const { session } = useSession();
  if (!session) return null;

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
        <ContactForm />
      </div>
    </main>
  );
}
