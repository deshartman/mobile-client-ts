"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { History, MessageCircle, Phone, Users, Video } from "lucide-react";
import { toast } from "sonner";
import type { MainListRow } from "@mobileclient/shared-types";
import { useCallOverlay } from "@/hooks/use-call-overlay";
import { useSession } from "@/hooks/use-session";
import { useSse } from "@/hooks/use-sse";
import { useVideoOverlay } from "@/hooks/use-video-overlay";
import { ApiError, mainListApi, videoApi } from "@/lib/client/api-client";
import { cn } from "@/lib/utils";

function displayName(row: Extract<MainListRow, { kind: "contact" }>): string {
  const parts = [row.firstName, row.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : row.company ?? "(no name)";
}

function initials(row: Extract<MainListRow, { kind: "contact" }>): string {
  const first = row.firstName?.[0];
  const last = row.lastName?.[0];
  if (first || last) return `${first ?? ""}${last ?? ""}`.toUpperCase();
  return row.company?.slice(0, 2).toUpperCase() ?? "·";
}

function rowKey(row: MainListRow): string {
  return row.kind === "contact" ? `c:${row.guid}` : `u:${row.identityValue}`;
}

function rowMatchesQuery(row: MainListRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (row.kind === "contact") {
    const haystack = [row.firstName, row.lastName, row.company, ...row.identities.map((i) => i.value)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  }
  return row.identityValue.toLowerCase().includes(needle);
}

function formatDateTime(datetime: string | undefined): string {
  if (!datetime) return "";
  return new Date(datetime).toLocaleString("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: true,
    month: "short",
    day: "numeric",
  });
}

/**
 * Resolve the phone number to use for a given action on a row. Contacts
 * prefer a type-matching identity (e.g. WhatsApp for the WhatsApp action)
 * and fall back to the first identity. Unknown rows use their
 * identityValue directly.
 */
function resolveIdentityValue(row: MainListRow, action: "Phone" | "Message" | "WhatsApp"): string {
  if (row.kind === "unknown") return row.identityValue;
  const match = row.identities.find((i) => i.type === action);
  return match?.value ?? row.identities[0]?.value ?? "";
}

function buildHistoryHref(row: MainListRow): string {
  if (row.kind === "contact") {
    return `/history?contactGuid=${encodeURIComponent(row.guid)}`;
  }
  return `/history?identityValue=${encodeURIComponent(row.identityValue)}`;
}

function buildBody(
  filteredRows: MainListRow[] | null,
  rows: MainListRow[] | null,
  query: string,
  error: string | null,
  expandedKey: string | null,
  onToggle: (key: string) => void,
) {
  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (filteredRows === null) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  if (rows && rows.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No contacts yet. Inbound messages will appear here.
      </p>
    );
  }
  if (filteredRows.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No matches for &ldquo;{query}&rdquo;.
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {filteredRows.map((row) => {
        const key = rowKey(row);
        return (
          <ListRow
            key={key}
            row={row}
            expanded={expandedKey === key}
            onToggle={() => onToggle(key)}
          />
        );
      })}
    </ul>
  );
}

interface MainListProps {
  userGuid: string;
  /** Search query owned by the parent so the top-bar input can drive it. */
  query?: string;
}

export function MainList({ userGuid, query = "" }: Readonly<MainListProps>) {
  const [rows, setRows] = useState<MainListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await mainListApi.get(userGuid);
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [userGuid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useSse(userGuid, {
    "activity.added": () => void refresh(),
    "message.added": () => void refresh(),
    "thread.read": () => void refresh(),
  });

  const filteredRows = useMemo(() => {
    if (!rows) return null;
    if (!query.trim()) return rows;
    return rows.filter((r) => rowMatchesQuery(r, query.trim()));
  }, [rows, query]);

  const handleToggle = useCallback((key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

  return buildBody(filteredRows, rows, query, error, expandedKey, handleToggle);
}

interface ListRowProps {
  row: MainListRow;
  expanded: boolean;
  onToggle: () => void;
}

function ListRow({ row, expanded, onToggle }: Readonly<ListRowProps>) {
  const router = useRouter();
  const { session } = useSession();
  const { openOutgoing } = useCallOverlay();
  const { open: openVideo } = useVideoOverlay();
  const hasPhone =
    row.kind === "unknown" ||
    row.identities.some((i) => i.type === "Phone" || i.type === "Message");

  function navigate(path: string) {
    router.push(path);
  }

  function handleCall() {
    // Open the full-screen call overlay in place of navigating to
    // /call/:guid. Contacts dial their Phone identity; unknown rows dial
    // the row's identityValue directly.
    if (row.kind === "contact") {
      const to = resolveIdentityValue(row, "Phone");
      if (!to) return;
      const displayName =
        [row.firstName, row.lastName].filter(Boolean).join(" ") ||
        row.company ||
        to;
      openOutgoing({ to, contactGuid: row.guid, displayName });
    } else {
      openOutgoing({ to: row.identityValue, displayName: row.identityValue });
    }
  }
  function handleMessage() {
    const to = resolveIdentityValue(row, "Message");
    if (!to) return;
    navigate(`/message/${encodeURIComponent(to)}`);
  }
  function handleHistory() {
    navigate(buildHistoryHref(row));
  }
  async function handleVideo() {
    if (!session) return;
    const to = resolveIdentityValue(row, "Phone");
    if (!to) return;
    const contactGuid = row.kind === "contact" ? row.guid : undefined;
    const displayName =
      row.kind === "contact"
        ? [row.firstName, row.lastName].filter(Boolean).join(" ") || row.company || to
        : to;
    try {
      const result = await videoApi.start({
        userGuid: session.userGuid,
        contactGuid,
        remoteAddress: to,
      });
      openVideo({ ...result, contactGuid, remoteAddress: to, displayName });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to start video");
    }
  }

  return (
    <li>
      <div className="flex w-full items-center gap-3 p-4 hover:bg-accent">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Avatar row={row} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {row.kind === "contact" ? displayName(row) : row.identityValue}
              </span>
            </div>
            {row.kind === "contact" && row.company && (
              <span className="block truncate text-xs text-muted-foreground">{row.company}</span>
            )}
            {row.lastInteractedAt && (
              <span className="block text-xs text-muted-foreground">
                {formatDateTime(row.lastInteractedAt)}
              </span>
            )}
          </div>
        </button>
        <button
          type="button"
          onClick={handleHistory}
          aria-label="Activity history"
          title="Activity"
          className="flex shrink-0 items-center justify-center rounded-md p-2 text-primary hover:bg-accent"
        >
          <History className="h-5 w-5" />
        </button>
      </div>
      <div
        className={cn(
          "grid overflow-hidden bg-muted/40 transition-[grid-template-rows] duration-200 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="grid grid-cols-5 divide-x border-t text-xs">
            <ActionButton
              icon={<Phone className="h-5 w-5" />}
              label="Call"
              disabled={!hasPhone}
              onClick={handleCall}
            />
            <ActionButton
              icon={<MessageCircle className="h-5 w-5" aria-hidden />}
              label="Message"
              disabled={!hasPhone}
              onClick={handleMessage}
              unread={row.unreadCount > 0}
            />
            <ActionButton
              icon={<MessageCircle className="h-5 w-5" />}
              label="WhatsApp"
              disabled
              placeholder
              onClick={() => {}}
            />
            <ActionButton
              icon={<Video className="h-5 w-5" />}
              label="Video"
              disabled={!hasPhone}
              onClick={() => void handleVideo()}
            />
            <ActionButton
              icon={<Users className="h-5 w-5" />}
              label="Group"
              disabled
              placeholder
              onClick={() => {}}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  unread?: boolean;
  /**
   * When true, renders the button as a greyed "coming soon" placeholder
   * (still disabled but visually distinct from a data-less disabled).
   */
  placeholder?: boolean;
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  unread,
  placeholder,
}: Readonly<ActionButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={placeholder ? "Coming soon" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-1 p-3",
        "text-primary transition-colors hover:bg-accent",
        "disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent",
        placeholder && "opacity-50",
      )}
    >
      <span className="relative">
        {icon}
        {unread && (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-destructive"
          />
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}

function Avatar({ row }: Readonly<{ row: MainListRow }>) {
  const unread = row.unreadCount > 0;
  const inner = (() => {
    if (row.kind === "unknown") {
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
          ?
        </div>
      );
    }
    if (row.photoData) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.photoData} alt="" className="h-10 w-10 rounded-full object-cover" />
      );
    }
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
        {initials(row)}
      </div>
    );
  })();

  return (
    <div className="relative shrink-0">
      {inner}
      {unread && (
        <span
          aria-label={`${row.unreadCount} unread`}
          className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-background bg-destructive"
        />
      )}
    </div>
  );
}
