"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const STATUSES = [
  ["subscribed", "Subscribed"],
  ["pending", "Pending"],
  ["unsubscribed", "Unsubscribed"],
  ["bounced", "Bounced"],
  ["complained", "Complained"],
] as const;

/**
 * Search box and filters. State lives in the URL (?q, status, list), so views
 * can be bookmarked and the server renders the right page. Changing any filter
 * returns to the first page.
 */
export function SubscriberFilters({
  lists,
  tags,
  segments,
}: {
  lists: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  segments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("after");
    next.delete("before");
    const search = next.toString();
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname));
  }

  function onQueryChange(value: string) {
    setQuery(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => update({ q: value.trim() || null }), 300);
  }

  useEffect(() => () => clearTimeout(debounce.current), []);

  const filtered = Boolean(
    params.get("q") ||
    params.get("status") ||
    params.get("list") ||
    params.get("tag") ||
    params.get("segment"),
  );

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="search"
      aria-busy={pending}
      data-pending={pending || undefined}
    >
      <div className="relative min-w-56 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search email or name"
          aria-label="Search subscribers"
          maxLength={100}
          className="pl-8"
        />
      </div>
      <NativeSelect
        aria-label="Filter by status"
        value={params.get("status") ?? ""}
        onChange={(e) => update({ status: e.target.value || null })}
      >
        <NativeSelectOption value="">All statuses</NativeSelectOption>
        {STATUSES.map(([value, label]) => (
          <NativeSelectOption key={value} value={value}>
            {label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {lists.length > 0 && (
        <NativeSelect
          aria-label="Filter by list"
          value={params.get("list") ?? ""}
          onChange={(e) => update({ list: e.target.value || null })}
        >
          <NativeSelectOption value="">All lists</NativeSelectOption>
          {lists.map((list) => (
            <NativeSelectOption key={list.id} value={list.id}>
              {list.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      {tags.length > 0 && (
        <NativeSelect
          aria-label="Filter by tag"
          value={params.get("tag") ?? ""}
          onChange={(e) => update({ tag: e.target.value || null })}
        >
          <NativeSelectOption value="">All tags</NativeSelectOption>
          {tags.map((tag) => (
            <NativeSelectOption key={tag.id} value={tag.id}>
              {tag.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      {segments.length > 0 && (
        <NativeSelect
          aria-label="Filter by segment"
          value={params.get("segment") ?? ""}
          onChange={(e) => update({ segment: e.target.value || null })}
        >
          <NativeSelectOption value="">All segments</NativeSelectOption>
          {segments.map((segment) => (
            <NativeSelectOption key={segment.id} value={segment.id}>
              {segment.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      {filtered && (
        <Button
          variant="ghost"
          onClick={() => {
            setQuery("");
            clearTimeout(debounce.current);
            update({ q: null, status: null, list: null, tag: null, segment: null });
          }}
        >
          <X />
          Clear
        </Button>
      )}
    </div>
  );
}
