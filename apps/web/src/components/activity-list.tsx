"use client";

import { Video } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Activity } from "@mobileclient/shared-types";
import { useSse } from "@/hooks/use-sse";
import { ApiError, activitiesApi } from "@/lib/client/api-client";

function relative(datetime: string): string {
  return new Date(datetime).toLocaleString();
}

function iconFor(type: Activity["type"]): React.ReactNode {
  switch (type) {
    case "Phone":
      return "📞";
    case "Message":
      return "💬";
    case "WhatsApp":
      return "🟢";
    case "Contact":
      return "👤";
    case "Video":
      return <Video className="h-5 w-5" />;
  }
}

interface Props {
  userGuid: string;
  filter?: { contactGuid: string } | { identityValue: string };
}

export function ActivityList({ userGuid, filter }: Readonly<Props>) {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      let data: Activity[];
      if (filter && "contactGuid" in filter) {
        data = await activitiesApi.byContact(userGuid, filter.contactGuid);
      } else if (filter && "identityValue" in filter) {
        data = await activitiesApi.byIdentity(userGuid, filter.identityValue);
      } else {
        data = await activitiesApi.list(userGuid);
      }
      setActivities(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [userGuid, filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useSse(userGuid, {
    "activity.added": () => void refresh(),
  });

  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (activities === null) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (activities.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ul className="divide-y">
      {activities.map((a) => {
        const href = hrefFor(a);
        const content = (
          <>
            <span aria-hidden className="text-lg">
              {iconFor(a.type)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{a.type}</span>
                {a.duration > 0 && (
                  <span className="text-xs text-muted-foreground">{a.duration} min</span>
                )}
              </div>
              {a.identityValue && (
                <span className="block truncate text-xs text-muted-foreground">{a.identityValue}</span>
              )}
              <span className="block text-xs text-muted-foreground">{relative(a.datetime)}</span>
            </div>
          </>
        );
        return (
          <li key={a.id}>
            {href ? (
              <Link href={href} className="flex items-start gap-3 p-4 hover:bg-accent">
                {content}
              </Link>
            ) : (
              <div className="flex items-start gap-3 p-4">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function hrefFor(a: Activity): string | null {
  switch (a.type) {
    case "Phone":
    case "Video":
      return a.callSid ? `/calldetail/${a.id}` : null;
    case "Message":
      return a.identityValue ? `/message/${encodeURIComponent(a.identityValue)}` : null;
    case "WhatsApp":
    case "Contact":
      return null;
  }
}
