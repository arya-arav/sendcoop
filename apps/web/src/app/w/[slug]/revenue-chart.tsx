"use client";

import type { DashboardDay } from "@sendcoop/db";
import { useState } from "react";
import { formatMoney } from "@/lib/money";

/** A round number at or above `max`, so the top gridline reads well (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ). */
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

/** Revenue per day: one column per day, a tooltip per column, and the same numbers as a table. */
export function RevenueChart({ series, currency }: { series: DashboardDay[]; currency: string }) {
  const [active, setActive] = useState<number | null>(null);
  const top = niceCeiling(Math.max(...series.map((d) => d.revenue)));
  const ticks = [top, top / 2, 0];
  const money = (n: number) => formatMoney(n, currency);
  const shown = active === null ? null : series[active];

  return (
    <figure className="grid gap-3">
      <div className="relative h-56 pl-14" onPointerLeave={() => setActive(null)}>
        {/* Gridlines and their values: recessive */}
        {ticks.map((tick) => (
          <div
            key={tick}
            aria-hidden
            className="absolute right-0 left-14 border-t border-border/70"
            style={{ top: `${(1 - tick / top) * 100}%` }}
          >
            <span className="absolute -top-2 -left-14 w-12 text-right text-[11px] text-muted-foreground tabular-nums">
              {money(tick).replace(/\.00$/, "")}
            </span>
          </div>
        ))}
        <div
          role="list"
          aria-label="Revenue per day"
          className="absolute inset-y-0 right-0 left-14 grid items-end"
          style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}
        >
          {series.map((d, i) => (
            <div
              key={d.day}
              role="listitem"
              tabIndex={0}
              aria-label={`${dayLabel(d.day, "long")}: ${money(d.revenue)}, ${d.conversions} conversions`}
              className="group flex h-full items-end justify-center px-px outline-none focus-visible:bg-muted/60"
              onPointerEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              {d.revenue > 0 && (
                <div
                  className="w-full max-w-6 rounded-t-[4px] transition-opacity group-hover:opacity-80"
                  style={{
                    height: `${Math.max((d.revenue / top) * 100, 1)}%`,
                    background: "var(--viz-series-1)",
                  }}
                />
              )}
            </div>
          ))}
        </div>
        {shown && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 z-10 grid -translate-x-1/2 -translate-y-full gap-0.5 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm"
            style={{
              left: `calc(3.5rem + (100% - 3.5rem) * ${(active + 0.5) / series.length})`,
            }}
          >
            <span className="text-sm font-semibold tabular-nums">{money(shown.revenue)}</span>
            <span className="text-muted-foreground">
              {dayLabel(shown.day, "long")} · {shown.conversions} conversions
            </span>
          </div>
        )}
      </div>
      {/* Dates: every week, and today */}
      <div
        aria-hidden
        className="ml-14 grid text-[11px] text-muted-foreground"
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
        <table className="mt-2 w-full max-w-md text-left text-sm tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Day</th>
              <th className="py-1 text-right font-normal">Conversions</th>
              <th className="py-1 text-right font-normal">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {series.map((d) => (
              <tr key={d.day} className="border-t">
                <td className="py-1">{dayLabel(d.day, "long")}</td>
                <td className="py-1 text-right">{d.conversions}</td>
                <td className="py-1 text-right">{money(d.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
