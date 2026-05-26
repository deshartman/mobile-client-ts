"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function SearchInput({ value, onChange, placeholder, ariaLabel }: Readonly<Props>) {
  return (
    <div className="relative flex-1">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search"}
        aria-label={ariaLabel ?? placeholder ?? "Search"}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-transparent py-1 pl-9 pr-3",
          "text-sm shadow-xs outline-none transition-[color,box-shadow]",
          "placeholder:text-muted-foreground",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
      />
    </div>
  );
}
