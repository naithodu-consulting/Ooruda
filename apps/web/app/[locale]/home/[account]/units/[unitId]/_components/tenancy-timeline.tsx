'use client';

import { cn } from '@kit/ui/utils';

import { formatDateDMY } from '~/lib/format-date';

export interface TenancyEntry {
  id: string;
  tenant_id: string;
  tenantLabel: string;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'ended';
}

interface VacancyGap {
  type: 'gap';
  days: number;
  from: string;
  to: string;
}

type TimelineItem = TenancyEntry | VacancyGap;

function daysBetween(from: string, to: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(
    0,
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay),
  );
}

function durationLabel(start: string, end: string | null): string {
  if (!end) return 'Ongoing';
  const totalDays = daysBetween(start, end);
  if (totalDays === 0) return 'Less than 1 day';
  const years = Math.floor(totalDays / 365);
  const months = Math.floor((totalDays % 365) / 30);
  const days = totalDays % 30;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr${years > 1 ? 's' : ''}`);
  if (months > 0) parts.push(`${months} mo`);
  if (days > 0 && years === 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  return parts.join(' ') || `${totalDays} day${totalDays > 1 ? 's' : ''}`;
}

function buildTimeline(tenancies: TenancyEntry[]): TimelineItem[] {
  if (tenancies.length === 0) return [];
  const items: TimelineItem[] = [];
  for (let i = 0; i < tenancies.length; i++) {
    items.push(tenancies[i]!);
    const next = tenancies[i + 1];
    if (next?.end_date) {
      const gapDays = daysBetween(next.end_date, tenancies[i]!.start_date);
      if (gapDays > 0) {
        items.push({
          type: 'gap',
          days: gapDays,
          from: next.end_date,
          to: tenancies[i]!.start_date,
        });
      }
    }
  }
  return items;
}

function isGap(item: TimelineItem): item is VacancyGap {
  return 'type' in item && item.type === 'gap';
}

export function TenancyTimeline({ tenancies }: { tenancies: TenancyEntry[] }) {
  if (tenancies.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-xl text-xl">
          🏢
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">No tenancy history yet</p>
          <p className="text-muted-foreground text-xs">
            Assign a tenant from the Units page to start tracking.
          </p>
        </div>
      </div>
    );
  }

  const timeline = buildTimeline(tenancies);

  return (
    <div className="flex flex-col">
      {timeline.map((item, idx) => {
        if (isGap(item)) {
          return (
            <div key={`gap-${idx}`} className="flex items-stretch gap-3">
              {/* Vacancy connector - stretches fully to connect with adjacent items */}
              <div className="flex w-7 flex-col items-center">
                <div className="border-border flex-1 border-l-2 border-dashed" />
                <div className="border-border bg-background my-2 h-2 w-2 flex-none rounded-full border-2 border-dashed" />
                <div className="border-border flex-1 border-l-2 border-dashed" />
              </div>
              <div className="flex items-center py-4 pl-3">
                <p className="text-muted-foreground text-xs italic">
                  Vacant ·{' '}
                  <span className="font-medium">
                    {item.days} day{item.days !== 1 ? 's' : ''}
                  </span>{' '}
                  <span className="opacity-70">
                    ({formatDateDMY(item.from)} → {formatDateDMY(item.to)})
                  </span>
                </p>
              </div>
            </div>
          );
        }

        const isActive = item.status === 'active';
        const isFirst = idx === 0;
        const isLast = idx === timeline.length - 1;

        return (
          <div key={item.id} className="flex gap-3">
            {/* Timeline spine + dot */}
            <div className="flex w-7 flex-col items-center">
              {/* Top connector - hidden for first item */}
              <div
                className={cn(
                  'bg-border w-px',
                  isFirst ? 'invisible' : 'h-5 flex-none',
                )}
              />
              {/* Dot */}
              <div
                className={cn(
                  'z-10 h-3 w-3 flex-none rounded-full border-2',
                  isActive
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground/40 bg-muted',
                )}
              />
              {/* Bottom connector - hidden for last item */}
              <div
                className={cn(
                  'bg-border w-px flex-1',
                  isLast ? 'invisible' : '',
                )}
              />
            </div>

            {/* Content card */}
            <div
              className={cn(
                'mb-1 flex-1 rounded-lg border p-4 shadow-sm',
                isActive
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-muted/20',
              )}
            >
              {/* Header: name + badge */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  {item.tenantLabel}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                    isActive
                      ? 'bg-primary/20 text-foreground ring-primary/40 ring-1'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {isActive ? 'Active' : 'Ended'}
                </span>
              </div>

              {/* Date range */}
              <p className="text-muted-foreground mt-1.5 text-xs">
                {formatDateDMY(item.start_date)}
                {' → '}
                {item.end_date ? formatDateDMY(item.end_date) : 'Present'}
              </p>

              {/* Duration */}
              <p className="text-muted-foreground mt-0.5 text-xs">
                Duration:{' '}
                <span className="text-foreground font-medium">
                  {durationLabel(item.start_date, item.end_date)}
                </span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
