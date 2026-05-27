"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Message, MessageStatus } from "@mobileclient/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSse } from "@/hooks/use-sse";
import { ApiError, messagingApi } from "@/lib/client/api-client";

interface LocalMessage extends Omit<Message, "messageSid"> {
  messageSid: string;
  pending?: boolean;
  failed?: boolean;
}

function statusLabel(status: MessageStatus | undefined): string {
  if (!status) return "";
  switch (status) {
    case "queued":
    case "sent":
      return "Sending…";
    case "delivered":
      return "Delivered";
    case "failed":
    case "undelivered":
      return "Failed";
  }
}

function mergeUnique(existing: LocalMessage[], incoming: LocalMessage[]): LocalMessage[] {
  const seen = new Set(existing.map((m) => m.messageSid));
  const merged = [...existing];
  for (const m of incoming) {
    if (!seen.has(m.messageSid)) {
      merged.push(m);
      seen.add(m.messageSid);
    }
  }
  return merged.sort((a, b) => a.datetime.localeCompare(b.datetime));
}

interface Props {
  userGuid: string;
  remoteAddress: string;
  /** Optional case-insensitive substring filter on message body. */
  search?: string;
}

export function MessageThread({ userGuid, remoteAddress, search }: Readonly<Props>) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [threadId, setThreadId] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const threadIdRef = useRef<string | undefined>(undefined);
  threadIdRef.current = threadId;

  const markThreadRead = useCallback((tid: string | undefined) => {
    if (!tid) return;
    void Promise.resolve(
      fetch(
        `/api/messaging/thread/${encodeURIComponent(userGuid)}/${encodeURIComponent(tid)}/read`,
        { method: "POST" },
      ),
    ).catch(() => {});
  }, [userGuid]);

  const rehydrate = useCallback(async () => {
    try {
      const data = await messagingApi.getThread(userGuid, remoteAddress);
      setThreadId(data.threadId);
      setMessages((prev) => mergeUnique(prev, data.messages as LocalMessage[]));
      // Opening (or returning to) the thread clears unread state. The endpoint
      // is idempotent, so calling it on every hydrate is safe.
      markThreadRead(data.threadId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load thread");
    }
  }, [userGuid, remoteAddress, markThreadRead]);

  useEffect(() => {
    void rehydrate();
  }, [rehydrate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Rehydrate when the tab comes back into focus — SSE events delivered
  // while the tab was backgrounded may have been dropped on iOS Safari.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") void rehydrate();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [rehydrate]);

  // Mark-as-read on tab hide/close so other clients clear the unread dot.
  useEffect(() => {
    function markRead() {
      const tid = threadIdRef.current;
      if (!tid) return;
      const url = `/api/messaging/thread/${encodeURIComponent(userGuid)}/${encodeURIComponent(tid)}/read`;
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        navigator.sendBeacon(url);
      }
    }
    function onHide() {
      if (document.visibilityState === "hidden") markRead();
    }
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", markRead);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", markRead);
    };
  }, [userGuid]);

  useSse(userGuid, {
    "message.added": (msg) => {
      if (!threadIdRef.current || msg.threadId !== threadIdRef.current) return;
      setMessages((prev) => mergeUnique(prev, [msg as LocalMessage]));
      // Live inbound while the thread is open — user has seen it.
      if (msg.direction === "inbound") markThreadRead(threadIdRef.current);
    },
    "message.status": (evt) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.messageSid === evt.messageSid ? { ...m, status: evt.status } : m,
        ),
      );
    },
  });

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;

    const tempSid = `SM_pending_${Date.now()}`;
    const optimistic: LocalMessage = {
      messageSid: tempSid,
      threadId: threadId ?? "pending",
      direction: "outbound",
      body,
      datetime: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setSending(true);

    try {
      const result = await messagingApi.send({ userGuid, to: remoteAddress, body });
      setMessages((prev) =>
        prev.map((m) =>
          m.messageSid === tempSid
            ? {
                ...m,
                messageSid: result.messageSid,
                threadId: result.threadId,
                status: result.status,
                pending: false,
              }
            : m,
        ),
      );
      if (!threadId) setThreadId(result.threadId);
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.messageSid === tempSid ? { ...m, pending: false, failed: true } : m)),
      );
      toast.error(err instanceof ApiError ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const needle = search?.trim().toLowerCase() ?? "";
  const visible = needle
    ? messages.filter((m) => m.body?.toLowerCase().includes(needle) ?? false)
    : messages;
  let body: React.ReactNode;
  if (messages.length === 0) {
    body = <p className="p-6 text-center text-sm text-muted-foreground">No messages yet.</p>;
  } else if (visible.length === 0) {
    body = <p className="p-6 text-center text-sm text-muted-foreground">No matches.</p>;
  } else {
    body = (
      <ul className="space-y-2 p-4">
        {visible.map((m) => (
              <li
                key={m.messageSid}
                className={`flex flex-col ${m.direction === "outbound" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    m.direction === "outbound"
                      ? m.failed
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {m.body}
                </div>
                {m.direction === "outbound" && (
                  <span className="mt-0.5 text-xs text-muted-foreground">
                    {m.failed
                      ? "Failed"
                      : m.pending
                        ? "Sending…"
                        : statusLabel(m.status)}
                  </span>
                )}
              </li>
            ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {body}
      </div>
      <form onSubmit={handleSend} className="flex gap-2 border-t p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message"
          disabled={sending}
        />
        <Button type="submit" disabled={sending || !draft.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
