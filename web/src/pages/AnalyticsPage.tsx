import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Brain,
  Cpu,
  Database,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  AnalyticsResponse,
  AnalyticsDailyEntry,
  AnalyticsModelEntry,
  AnalyticsSkillEntry,
  MempalaceAnalyticsResponse,
  MempalaceToolEntry,
  MempalaceDailyEntry,
  MempalaceSessionEntry,
} from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { Button } from "@nous-research/ui/ui/components/button";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Stats } from "@nous-research/ui/ui/components/stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { usePageHeader } from "@/contexts/usePageHeader";
import { useI18n } from "@/i18n";
import { PluginSlot } from "@/plugins";

const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

const CHART_HEIGHT_PX = 160;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(day: string): string {
  try {
    const d = new Date(day + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return day;
  }
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function useTableSort<T>(
  data: T[],
  defaultKey: keyof T & string,
  defaultDir: "asc" | "desc" = "desc",
) {
  const [sortKey, setSortKey] = useState<string>(defaultKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultDir);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey as keyof T];
      const bVal = b[sortKey as keyof T];
      // Nulls always last regardless of direction
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (aVal === bVal) return 0;
      const cmp = aVal > bVal ? 1 : -1;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const toggle = useCallback(
    (key: string) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey],
  );

  return { sorted, sortKey, sortDir, toggle };
}

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  toggle,
  className,
}: {
  label: string;
  col: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  toggle: (key: string) => void;
  className?: string;
}) {
  const active = col === sortKey;
  return (
    <th
      onClick={() => toggle(col)}
      className={`cursor-pointer select-none ${className ?? ""}`}
    >
      <span className="inline-flex items-center gap-1.5 rounded px-1 -mx-1 py-0.5 hover:bg-muted/40 transition-colors">
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 text-foreground/80 shrink-0" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-foreground/80 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-text-tertiary shrink-0" />
        )}
      </span>
    </th>
  );
}



function TokenBarChart({ daily }: { daily: AnalyticsDailyEntry[] }) {
  const { t } = useI18n();
  if (daily.length === 0) return null;

  const maxTokens = Math.max(
    ...daily.map((d) => d.input_tokens + d.output_tokens),
    1,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">
            {t.analytics.dailyTokenUsage}
          </CardTitle>
        </div>
        <div className="flex items-center gap-4 font-mondwest normal-case text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 bg-[#ffe6cb]" />
            {t.analytics.input}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 bg-emerald-500" />
            {t.analytics.output}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="flex items-end gap-[2px]"
          style={{ height: CHART_HEIGHT_PX }}
        >
          {daily.map((d) => {
            const total = d.input_tokens + d.output_tokens;
            const inputH = Math.round(
              (d.input_tokens / maxTokens) * CHART_HEIGHT_PX,
            );
            const outputH = Math.round(
              (d.output_tokens / maxTokens) * CHART_HEIGHT_PX,
            );
            return (
              <div
                key={d.day}
                className="flex-1 min-w-0 group relative flex flex-col justify-end"
                style={{ height: CHART_HEIGHT_PX }}
              >
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 pointer-events-none">
                  <div className="font-mondwest normal-case bg-card border border-border px-2.5 py-1.5 text-xs text-foreground shadow-lg whitespace-nowrap">
                    <div className="font-medium">{formatDate(d.day)}</div>
                    <div>
                      {t.analytics.input}: {formatTokens(d.input_tokens)}
                    </div>
                    <div>
                      {t.analytics.output}: {formatTokens(d.output_tokens)}
                    </div>
                    <div>
                      {t.analytics.total}: {formatTokens(total)}
                    </div>
                  </div>
                </div>

                <div
                  className="w-full bg-[#ffe6cb]/70"
                  style={{ height: Math.max(inputH, total > 0 ? 1 : 0) }}
                />

                <div
                  className="w-full bg-emerald-500/70"
                  style={{
                    height: Math.max(outputH, d.output_tokens > 0 ? 1 : 0),
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="flex justify-between mt-2 font-mondwest normal-case text-xs text-text-tertiary">
          <span>{daily.length > 0 ? formatDate(daily[0].day) : ""}</span>
          {daily.length > 2 && (
            <span>{formatDate(daily[Math.floor(daily.length / 2)].day)}</span>
          )}
          <span>
            {daily.length > 1 ? formatDate(daily[daily.length - 1].day) : ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function DailyTable({ daily }: { daily: AnalyticsDailyEntry[] }) {
  const { t } = useI18n();
  const { sorted, sortKey, sortDir, toggle } = useTableSort(daily, "day", "desc");

  if (daily.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">
            {t.analytics.dailyBreakdown}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full font-mondwest normal-case text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs">
                <SortHeader label={t.analytics.date} col="day" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-left py-2 pr-4 font-medium" />
                <SortHeader label={t.sessions.title} col="sessions" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-4 font-medium" />
                <SortHeader label={t.analytics.input} col="input_tokens" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-4 font-medium" />
                <SortHeader label={t.analytics.output} col="output_tokens" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 pl-4 font-medium" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => (
                <tr
                    key={d.day}
                    className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                  >
                  <td className="py-2 pr-4 font-medium">
                      {formatDate(d.day)}
                    </td>
                  <td className="text-right py-2 px-4 text-muted-foreground">
                      {d.sessions}
                    </td>
                  <td className="text-right py-2 px-4">
                    <span className="text-[#ffe6cb]">
                        {formatTokens(d.input_tokens)}
                      </span>
                  </td>
                  <td className="text-right py-2 pl-4">
                    <span className="text-emerald-400">
                        {formatTokens(d.output_tokens)}
                      </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ModelTable({ models }: { models: AnalyticsModelEntry[] }) {
  const { t } = useI18n();
  const { sorted, sortKey, sortDir, toggle } = useTableSort(models, "input_tokens", "desc");

  if (models.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">
            {t.analytics.perModelBreakdown}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full font-mondwest normal-case text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs">
                <SortHeader label={t.analytics.model} col="model" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-left py-2 pr-4 font-medium" />
                <SortHeader label={t.sessions.title} col="sessions" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-4 font-medium" />
                <SortHeader label={t.analytics.tokens} col="input_tokens" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 pl-4 font-medium" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr
                  key={m.model}
                  className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                >
                  <td className="py-2 pr-4">
                    <span className="font-mono-ui text-xs">{m.model}</span>
                  </td>
                  <td className="text-right py-2 px-4 text-muted-foreground">
                    {m.sessions}
                  </td>
                  <td className="text-right py-2 pl-4">
                    <span className="text-[#ffe6cb]">
                      {formatTokens(m.input_tokens)}
                    </span>
                    {" / "}
                    <span className="text-emerald-400">
                      {formatTokens(m.output_tokens)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SkillTable({ skills }: { skills: AnalyticsSkillEntry[] }) {
  const { t } = useI18n();
  const { sorted, sortKey, sortDir, toggle } = useTableSort(skills, "total_count", "desc");

  if (skills.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">{t.analytics.topSkills}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full font-mondwest normal-case text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs">
                <SortHeader label={t.analytics.skill} col="skill" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-left py-2 pr-4 font-medium" />
                <SortHeader label={t.analytics.loads} col="view_count" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-4 font-medium" />
                <SortHeader label={t.analytics.edits} col="manage_count" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-4 font-medium" />
                <SortHeader label={t.analytics.total} col="total_count" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-4 font-medium" />
                <SortHeader label={t.analytics.lastUsed} col="last_used_at" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 pl-4 font-medium" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((skill) => (
                <tr
                  key={skill.skill}
                  className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                >
                  <td className="py-2 pr-4">
                    <span className="font-mono-ui text-xs">{skill.skill}</span>
                  </td>
                  <td className="text-right py-2 px-4 text-muted-foreground">
                    {skill.view_count}
                  </td>
                  <td className="text-right py-2 px-4 text-muted-foreground">
                    {skill.manage_count}
                  </td>
                  <td className="text-right py-2 px-4">{skill.total_count}</td>
                  <td className="text-right py-2 pl-4 text-muted-foreground">
                    {skill.last_used_at ? timeAgo(skill.last_used_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// MemPalace Memory Overhead Panel
// ---------------------------------------------------------------------------

const MEM_CHART_HEIGHT_PX = 80;

/** Bar chart showing MemPalace token % of total daily context (the meaningful metric). */
function MempalacePctHistogram({ daily }: { daily: MempalaceDailyEntry[] }) {
  const entries = daily.filter((d) => d.total_context_tokens > 0);
  if (entries.length === 0) return null;
  const maxPct = Math.max(...entries.map((d) => d.mem_pct), 1);
  return (
    <div
      className="flex items-end gap-[2px]"
      style={{ height: MEM_CHART_HEIGHT_PX }}
    >
      {entries.map((d) => {
        const h = Math.round((d.mem_pct / maxPct) * MEM_CHART_HEIGHT_PX);
        const tone =
          d.mem_pct >= 20
            ? "bg-destructive/70"
            : d.mem_pct >= 10
            ? "bg-yellow-500/60"
            : "bg-violet-500/60";
        return (
          <div
            key={d.day}
            className="flex-1 min-w-0 group relative flex flex-col justify-end"
            style={{ height: MEM_CHART_HEIGHT_PX }}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 pointer-events-none">
              <div className="font-mondwest normal-case bg-card border border-border px-2.5 py-1.5 text-xs text-foreground shadow-lg whitespace-nowrap">
                <div className="font-medium">{d.day}</div>
                <div>{d.turns} prefetch turns</div>
                <div>{formatTokens(d.prefetch_tokens)} mem tokens</div>
                <div>{formatTokens(d.total_context_tokens)} total ctx</div>
                <div className="font-semibold">{d.mem_pct}% of daily tokens</div>
              </div>
            </div>
            <div
              className={`w-full ${tone}`}
              style={{ height: Math.max(h, d.mem_pct > 0 ? 1 : 0) }}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Raw absolute sparkline — shows how many mem tokens were fetched per day. */
function MempalaceSparkline({ daily }: { daily: MempalaceDailyEntry[] }) {
  if (daily.length === 0) return null;
  const maxTokens = Math.max(...daily.map((d) => d.prefetch_tokens), 1);
  return (
    <div
      className="flex items-end gap-[2px]"
      style={{ height: MEM_CHART_HEIGHT_PX }}
    >
      {daily.map((d) => {
        const h = Math.round((d.prefetch_tokens / maxTokens) * MEM_CHART_HEIGHT_PX);
        return (
          <div
            key={d.day}
            className="flex-1 min-w-0 group relative flex flex-col justify-end"
            style={{ height: MEM_CHART_HEIGHT_PX }}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 pointer-events-none">
              <div className="font-mondwest normal-case bg-card border border-border px-2.5 py-1.5 text-xs text-foreground shadow-lg whitespace-nowrap">
                <div className="font-medium">{d.day}</div>
                <div>{d.turns} turns</div>
                <div>{formatTokens(d.prefetch_tokens)} mem tokens</div>
              </div>
            </div>
            <div
              className="w-full bg-violet-500/40"
              style={{ height: Math.max(h, d.prefetch_tokens > 0 ? 1 : 0) }}
            />
          </div>
        );
      })}
    </div>
  );
}

function MempalaceToolTable({ tools }: { tools: MempalaceToolEntry[] }) {
  const { sorted, sortKey, sortDir, toggle } = useTableSort(tools, "total_tokens", "desc");
  if (tools.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full font-mondwest normal-case text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-xs">
            <SortHeader label="Tool" col="tool" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-left py-2 pr-4 font-medium" />
            <SortHeader label="Calls" col="calls" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-4 font-medium" />
            <SortHeader label="Avg tokens" col="avg_tokens" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-4 font-medium" />
            <SortHeader label="Total tokens" col="total_tokens" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 pl-4 font-medium" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.tool} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
              <td className="py-2 pr-4">
                <span className="font-mono-ui text-xs">{t.tool}</span>
              </td>
              <td className="text-right py-2 px-4 text-muted-foreground">{t.calls}</td>
              <td className="text-right py-2 px-4">
                <span className="text-violet-400">{formatTokens(t.avg_tokens)}</span>
              </td>
              <td className="text-right py-2 pl-4">
                <span className="text-violet-400">{formatTokens(t.total_tokens)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insight cards — cache efficiency, tool density, output ratio
// ---------------------------------------------------------------------------

interface InsightCardProps {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad" | "neutral";
  detail: string;
  advice?: string;
}

function InsightCard({ label, value, tone, detail, advice }: InsightCardProps) {
  const toneClass =
    tone === "good"
      ? "text-emerald-400 border-emerald-500/30 bg-emerald-950/20"
      : tone === "warn"
      ? "text-yellow-400 border-yellow-500/30 bg-yellow-950/20"
      : tone === "bad"
      ? "text-destructive border-destructive/30 bg-destructive/10"
      : "text-muted-foreground border-border/50 bg-muted/20";
  const valueToneClass =
    tone === "good"
      ? "text-emerald-400"
      : tone === "warn"
      ? "text-yellow-400"
      : tone === "bad"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className={`rounded border px-3 py-3 flex flex-col gap-1 ${toneClass}`}>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mondwest">{label}</span>
      <span className={`text-xl font-bold font-mondwest ${valueToneClass}`}>{value}</span>
      <span className="text-xs text-muted-foreground leading-snug">{detail}</span>
      {advice && (
        <span className={`text-xs font-medium leading-snug mt-0.5 ${valueToneClass}`}>{advice}</span>
      )}
    </div>
  );
}

function InsightCards({ data }: { data: MempalaceAnalyticsResponse }) {
  const { cache, efficiency } = data;

  // Cache health
  const cacheHitTone =
    cache.hit_pct >= 85 ? "good" : cache.hit_pct >= 60 ? "warn" : "bad";
  const cacheHitAdvice =
    cache.hit_pct < 60
      ? "Low cache hits — short sessions or frequent model/system-prompt changes may be busting the cache."
      : cache.hit_pct < 85
      ? "Moderate cache usage — longer sessions or reducing system-prompt churn will improve this."
      : undefined;

  const cacheReuseTone =
    cache.reuse_ratio >= 10 ? "good" : cache.reuse_ratio >= 3 ? "warn" : "bad";
  const cacheReuseAdvice =
    cache.reuse_ratio < 3
      ? "Each cached block is barely re-read — cache writes are barely paying off. Longer or more repetitive sessions would help."
      : cache.reuse_ratio < 10
      ? "Cache re-use is moderate. Steady improvement as sessions grow longer."
      : undefined;

  // Tool density
  const toolPctTone =
    efficiency.tool_call_pct <= 85 ? "good" : efficiency.tool_call_pct <= 95 ? "warn" : "bad";
  const toolPctAdvice =
    efficiency.tool_call_pct > 95
      ? "Almost every LLM call is a tool call — the model spends very little time giving final answers. This is normal for complex coding tasks but watch for unnecessary tool loops."
      : efficiency.tool_call_pct > 85
      ? "High tool-call density — typical for agentic work, but review if sessions feel sluggish."
      : undefined;

  const avgToolsTone =
    efficiency.avg_tools_per_api_call <= 8 ? "good" : efficiency.avg_tools_per_api_call <= 20 ? "warn" : "bad";
  const avgToolsAdvice =
    efficiency.avg_tools_per_api_call > 20
      ? "Very high tool calls per round-trip — consider whether some tools could be batched or are being called redundantly."
      : undefined;

  // Output ratio
  const outputTone =
    efficiency.output_ratio_pct >= 0.5 ? "good" : efficiency.output_ratio_pct >= 0.1 ? "warn" : "bad";
  const outputAdvice =
    efficiency.output_ratio_pct < 0.1
      ? "Extremely low output ratio — the model spends almost all tokens reading context and calling tools, generating very little text. May indicate over-verbose system prompts or excessive tool round-trips."
      : efficiency.output_ratio_pct < 0.5
      ? "Low output ratio — typical for heavy coding/tool workflows."
      : undefined;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground font-mondwest normal-case">System health insights</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InsightCard
          label="Cache hit rate"
          value={`${cache.hit_pct}%`}
          tone={cacheHitTone}
          detail={`${formatTokens(cache.total_read_tokens)} tokens served from cache out of ${formatTokens(cache.total_read_tokens + cache.total_write_tokens)} total context.`}
          advice={cacheHitAdvice}
        />
        <InsightCard
          label="Cache reuse"
          value={`${cache.reuse_ratio}×`}
          tone={cacheReuseTone}
          detail={`Each cached block was re-read ~${cache.reuse_ratio} times on average. Higher is better — it means the cache investment pays off across more turns.`}
          advice={cacheReuseAdvice}
        />
        <InsightCard
          label="Tool-call density"
          value={`${efficiency.tool_call_pct}%`}
          tone={toolPctTone}
          detail={`${efficiency.tool_call_pct}% of API calls ended in tool invocations (not final replies). ${efficiency.stop_api_calls} calls were final-reply stops.`}
          advice={toolPctAdvice}
        />
        <InsightCard
          label="Avg tools / call"
          value={String(efficiency.avg_tools_per_api_call)}
          tone={avgToolsTone}
          detail={`${efficiency.total_tool_call_events.toLocaleString()} total tool events across ${efficiency.total_api_calls} API calls.`}
          advice={avgToolsAdvice}
        />
        <InsightCard
          label="Output ratio"
          value={`${efficiency.output_ratio_pct}%`}
          tone={outputTone}
          detail={`${formatTokens(efficiency.total_output_tokens)} output tokens vs ${formatTokens(data.totals.total_context_tokens)} total context. Avg ${formatTokens(efficiency.avg_output_per_call)} tokens per API call.`}
          advice={outputAdvice}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top sessions table
// ---------------------------------------------------------------------------

function TopSessionsTable({ sessions }: { sessions: MempalaceSessionEntry[] }) {
  const { sorted, sortKey, sortDir, toggle } = useTableSort(sessions, "total_context_tokens", "desc");
  if (sessions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground font-mondwest normal-case">
        Heaviest sessions (top 10 by context tokens)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full font-mondwest normal-case text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs">
              <SortHeader label="Session" col="session_id" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-left py-2 pr-4 font-medium" />
              <SortHeader label="Date" col="date" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-left py-2 pr-4 font-medium" />
              <SortHeader label="Context" col="total_context_tokens" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-3 font-medium" />
              <SortHeader label="Cache %" col="cache_hit_pct" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-3 font-medium" />
              <SortHeader label="API calls" col="api_calls" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-3 font-medium" />
              <SortHeader label="Tools" col="tool_calls" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 pl-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.session_id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                <td className="py-2 pr-4">
                  <span className="font-mono-ui text-xs text-muted-foreground">{s.session_id.slice(-8)}</span>
                </td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">{s.date}</td>
                <td className="text-right py-2 px-3">
                  <span className="text-amber-400">{formatTokens(s.total_context_tokens)}</span>
                </td>
                <td className="text-right py-2 px-3">
                  <span className={s.cache_hit_pct >= 85 ? "text-emerald-400" : s.cache_hit_pct >= 60 ? "text-yellow-400" : "text-destructive"}>
                    {s.cache_hit_pct}%
                  </span>
                </td>
                <td className="text-right py-2 px-3 text-muted-foreground">{s.api_calls}</td>
                <td className="text-right py-2 pl-3 text-muted-foreground">{s.tool_calls.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function overheadTone(pct: number): string {
  if (pct >= 20) return "text-destructive";
  if (pct >= 10) return "text-yellow-400";
  return "text-emerald-400";
}

function MempalacePanel({ days }: { days: number }) {
  const [data, setData] = useState<MempalaceAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getMempalaceAnalytics(days)
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [days]);

  const noData = !data || data.totals.total_turns === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">MemPalace Memory Overhead</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Token cost of memory context injected per turn. Source: <span className="font-mono">mempalace_events.jsonl</span> + <span className="font-mono">token_usage.jsonl</span>
        </p>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Spinner className="text-primary" />
          </div>
        )}
        {!loading && error && (
          <p className="text-sm text-destructive text-center py-4">{error}</p>
        )}
        {!loading && noData && (
          <div className="flex flex-col items-center text-muted-foreground py-8 gap-2">
            <Database className="h-7 w-7 opacity-30" />
            <p className="text-sm">No memory events recorded yet.</p>
            <p className="text-xs text-text-tertiary">
              Metrics accumulate in <span className="font-mono">/data/metrics/</span> as the agent runs.
            </p>
          </div>
        )}
        {!loading && !error && data && !noData && (
          <div className="flex flex-col gap-6">
            {/* Summary stats row */}
            <Stats
              items={[
                {
                  label: "Mem overhead",
                  value: (
                    <span className={overheadTone(data.totals.mem_overhead_pct)}>
                      {data.totals.mem_overhead_pct}%
                    </span>
                  ) as unknown as string,
                },
                {
                  label: "Avg prefetch",
                  value: `${formatTokens(data.totals.avg_prefetch_tokens)} tok`,
                },
                {
                  label: "Max prefetch",
                  value: `${formatTokens(data.totals.max_prefetch_tokens)} tok`,
                },
                {
                  label: "Turns tracked",
                  value: String(data.totals.total_turns),
                },
                {
                  label: "Empty prefetch",
                  value: `${data.totals.turns_empty_pct}%`,
                },
              ]}
            />

            {/* Overhead explanation */}
            <div className="flex items-start gap-2 rounded border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <span className="shrink-0 mt-0.5">ℹ</span>
              <span>
                <strong className={overheadTone(data.totals.mem_overhead_pct)}>
                  {data.totals.mem_overhead_pct}%
                </strong>{" "}
                of total context tokens were MemPalace memory ({formatTokens(data.totals.total_mem_ctx_tokens)} mem / {formatTokens(data.totals.total_context_tokens)} ctx).
                {" "}Overhead is measured against the full context window (prompt + cache hits), not just the uncached delta.
                {data.totals.mem_overhead_pct >= 20 && (
                  <span className="ml-1 text-destructive font-medium">
                    High overhead — consider lowering MEMPALACE_PREFETCH_MAX_CHARS or MEMPALACE_PREFETCH_RESULTS.
                  </span>
                )}
                {data.totals.mem_overhead_pct >= 10 && data.totals.mem_overhead_pct < 20 && (
                  <span className="ml-1 text-yellow-400 font-medium">
                    Moderate overhead — monitor trends below.
                  </span>
                )}
                {data.totals.turns_empty_pct >= 60 && (
                  <span className="ml-1 text-yellow-400 font-medium">
                    {data.totals.turns_empty_pct}% of prefetch turns returned nothing — auto-prefetch may not be pulling its weight.
                  </span>
                )}
              </span>
            </div>

            {/* System health insight cards */}
            {data.cache && data.efficiency && (
              <InsightCards data={data} />
            )}

            {/* % of daily tokens histogram — primary chart */}
            {data.daily.filter((d) => d.total_context_tokens > 0).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-mondwest normal-case">
                  Daily MemPalace % of total context tokens
                  <span className="ml-2 text-text-tertiary">(hover for details)</span>
                </p>
                <MempalacePctHistogram daily={data.daily} />
                <div className="flex justify-between mt-1 font-mondwest normal-case text-xs text-text-tertiary">
                  <span>{data.daily.length > 0 ? data.daily[0].day : ""}</span>
                  <span>{data.daily.length > 1 ? data.daily[data.daily.length - 1].day : ""}</span>
                </div>
              </div>
            )}

            {/* Raw daily prefetch volume sparkline — secondary chart */}
            {data.daily.length > 1 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-mondwest normal-case">Daily prefetch tokens (absolute)</p>
                <MempalaceSparkline daily={data.daily} />
                <div className="flex justify-between mt-1 font-mondwest normal-case text-xs text-text-tertiary">
                  <span>{data.daily.length > 0 ? data.daily[0].day : ""}</span>
                  <span>{data.daily.length > 1 ? data.daily[data.daily.length - 1].day : ""}</span>
                </div>
              </div>
            )}

            {/* Tool breakdown */}
            {data.tools.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-mondwest normal-case">Tool call token cost</p>
                <MempalaceToolTable tools={data.tools} />
              </div>
            )}

            {/* Top sessions table */}
            {data.top_sessions && data.top_sessions.length > 0 && (
              <TopSessionsTable sessions={data.top_sessions} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Gated on `dashboard.show_token_analytics` (default off).  When off the
  // page renders an explanation card instead of fetching analytics — the
  // local token counts exclude auxiliary calls and provider retries, so
  // they diverge from provider billing in ways that mislead users.
  const [showTokens, setShowTokens] = useState<boolean | null>(null);
  const { t } = useI18n();
  const { setAfterTitle, setEnd } = usePageHeader();

  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => {
        const dash = (cfg?.dashboard ?? {}) as { show_token_analytics?: unknown };
        setShowTokens(dash.show_token_analytics === true);
      })
      .catch(() => setShowTokens(false));
  }, []);

  const load = useCallback(() => {
    if (!showTokens) return;
    setLoading(true);
    setError(null);
    api
      .getAnalytics(days)
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [days, showTokens]);

  useLayoutEffect(() => {
    const periodLabel =
      PERIODS.find((p) => p.days === days)?.label ?? `${days}d`;
    setAfterTitle(
      <span className="flex items-center gap-1.5">
        <Badge tone="secondary" className="text-xs">
          {periodLabel}
        </Badge>
        {showTokens !== false && (
          <Button
            type="button"
            ghost
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={load}
            disabled={loading}
            aria-label={t.common.refresh}
          >
            {loading ? <Spinner /> : <RefreshCw />}
          </Button>
        )}
      </span>,
    );
    setEnd(
      showTokens === false ? null : (
        <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:justify-end sm:gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {PERIODS.map((p) => (
              <Button
                key={p.label}
                type="button"
                size="sm"
                outlined={days !== p.days}
                onClick={() => setDays(p.days)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      ),
    );
    return () => {
      setAfterTitle(null);
      setEnd(null);
    };
  }, [days, loading, load, setAfterTitle, setEnd, t.common.refresh, showTokens]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PluginSlot name="analytics:top" />

      {showTokens === false && (
        <Card>
          <CardContent className="py-12">
            <div className="mx-auto flex max-w-2xl flex-col gap-3 text-sm text-muted-foreground">
              <h2 className="font-mondwest text-display text-base tracking-wider text-foreground">
                Token analytics hidden
              </h2>
              <p>
                The token, cost, and per-day analytics on this page are a
                local debug estimate. They only count successful main-agent
                responses with a usable <span className="font-mono">usage</span>{" "}
                block, and silently exclude auxiliary calls (context
                compression, title generation, vision, session search, web
                extract, smart approvals, MCP routing, plugin LLM access)
                plus provider-side retries and fallback attempts. Cache
                writes are missing entirely.
              </p>
              <p>
                On models with heavy auxiliary traffic (Kimi K2.6, MiniMax
                M2.7) the local total can be 10x–100x lower than what your
                provider bills. Hiding these numbers is safer than letting
                them look authoritative.
              </p>
              <p>
                Check your provider dashboard (OpenRouter, Anthropic, etc.)
                for actual usage and billing. To re-enable the local debug
                estimate anyway, set{" "}
                <span className="font-mono">
                  dashboard.show_token_analytics: true
                </span>{" "}
                in <a href="/config" className="underline">Config</a>.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {showTokens && loading && !data && (
        <div className="flex items-center justify-center py-24">
          <Spinner className="text-2xl text-primary" />
        </div>
      )}

      {showTokens && error && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-destructive text-center">{error}</p>
          </CardContent>
        </Card>
      )}

      {showTokens && data && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardContent className="py-6">
                <Stats
                  items={[
                    {
                      label: t.analytics.totalTokens,
                      value: formatTokens(
                        data.totals.total_input + data.totals.total_output,
                      ),
                    },
                    {
                      label: t.analytics.input,
                      value: formatTokens(data.totals.total_input),
                    },
                    {
                      label: t.analytics.output,
                      value: formatTokens(data.totals.total_output),
                    },
                    {
                      label: t.analytics.totalSessions,
                      value: `${data.totals.total_sessions} (~${(data.totals.total_sessions / days).toFixed(1)}${t.analytics.perDayAvg})`,
                    },
                    {
                      label: t.analytics.apiCalls,
                      value: String(
                        data.totals.total_api_calls ??
                          data.daily.reduce((sum, d) => sum + d.sessions, 0),
                      ),
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <TokenBarChart daily={data.daily} />
          </div>

          <DailyTable daily={data.daily} />
          <ModelTable models={data.by_model} />
          <SkillTable skills={data.skills.top_skills} />
        </>
      )}

      {data &&
        data.daily.length === 0 &&
        data.by_model.length === 0 &&
        data.skills.top_skills.length === 0 && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center text-muted-foreground">
                <BarChart3 className="h-8 w-8 mb-3 opacity-40" />
                <p className="text-sm font-medium">{t.analytics.noUsageData}</p>
                <p className="text-xs mt-1 text-text-tertiary">
                  {t.analytics.startSession}
                </p>
              </div>
            </CardContent>
          </Card>
        )}\n      <MempalacePanel days={days} />\n      <PluginSlot name="analytics:bottom" />
    </div>
  );
}
