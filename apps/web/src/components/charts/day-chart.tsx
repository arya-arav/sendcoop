"use client";

import { useState } from "react";

// Counts per day: one column per day, a tooltip per column, and the same
// numbers as a table. The revenue chart's shape, for any count.

export type Day = { day: string; value: number };

function niceCeiling(max: number) {
  if (max <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * power >= max)!;
  return step * power;
}

const dayLabel = (day: string, style: "short" | "long" = "short") =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    weekday: style === "long" ? "short" : undefined,
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));

const compact = (n: number) =>
  n >= 10_000
    ? new Intl.NumberFormat("en", { notation: "compact" }).format(n)
    : n.toLocaleString("en");

export function DayChart({
  series,
  label,
  unit,
  color = "var(--viz-series-1)",
}: {
  series: Day[];
  /** Names the chart for screen readers, e.g. "Emails sent per day". */
  label: string;
  /** What's counted, e.g. "emails". */
  unit: string;
  color?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const top = niceCeiling(Math.max(...series.map((d) => d.value)));
  const ticks = [top, top / 2, 0];
  const shown = active === null ? null : series[active];

  return (
    <figure className="grid gap-3">
      <div className="relative h-48 pl-12" onPointerLeave={() => setActive(null)}>
        {ticks.map((tick) => (
          <div
            key={tick}
            aria-hidden
            className="absolute right-0 left-12 border-t border-border/70"
            style={{ top: `${(1 - tick / top) * 100}%` }}
          >
            <span className="absolute -top-2 -left-12 w-10 text-right text-[11px] text-muted-foreground tabular-nums">
              {compact(tick)}
            </span>
          </div>
        ))}
        <div
          role="list"
          aria-label={label}
          className="absolute inset-y-0 right-0 left-12 grid items-end"
          style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}
        >
          {series.map((d, i) => (
            <div
              key={d.day}
              role="listitem"
              tabIndex={0}
              aria-label={`${dayLabel(d.day, "long")}: ${d.value.toLocaleString("en")} ${unit}`}
              className="group flex h-full items-end justify-center px-px outline-none focus-visible:bg-muted/60"
              onPointerEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              {d.value > 0 && (
                <div
                  className="w-full max-w-6 rounded-t-[4px] transition-opacity group-hover:opacity-80"
                  style={{ height: `${Math.max((d.value / top) * 100, 1)}%`, background: color }}
                />
              )}
            </div>
          ))}
        </div>
        {shown && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 z-10 grid -translate-x-1/2 -translate-y-full gap-0.5 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `calc(3rem + (100% - 3rem) * ${(active + 0.5) / series.length})` }}
          >
            <span className="text-sm font-semibold tabular-nums">
              {shown.value.toLocaleString("en")} {unit}
            </span>
            <span className="text-muted-foreground">{dayLabel(shown.day, "long")}</span>
          </div>
        )}
      </div>
      <div
        aria-hidden
        className="ml-12 grid text-[11px] text-muted-foreground"
        style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}
      >
        {series.map((d, i) => (
          <span
            key={d.day}
            className={
              i === series.length - 1
                ? "flex justify-end whitespace-nowrap"
                : "overflow-visible text-center whitespace-nowrap"
            }
          >
            {(series.length - 1 - i) % 7 === 0 ? dayLabel(d.day) : ""}
          </span>
        ))}
      </div>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
          Show as a table
        </summary>
        <table className="mt-2 w-full max-w-sm text-left text-sm tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Day</th>
              <th className="py-1 text-right font-normal capitalize">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((d) => (
              <tr key={d.day} className="border-t">
                <td className="py-1">{dayLabel(d.day, "long")}</td>
                <td className="py-1 text-right">{d.value.toLocaleString("en")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
