'use client';

import { type ReactNode } from 'react';

import { Card, CardContent } from '@kit/ui/card';

interface KpiTileProps {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  highlight?: 'green' | 'amber' | 'red' | 'blue';
}

const highlightClass: Record<string, string> = {
  green: 'text-[var(--color-success)]',
  amber: 'text-[var(--color-warning)]',
  red: 'text-[var(--color-danger)]',
  blue: 'text-[var(--color-info)]',
};

export function KpiTile({ label, value, sub, icon, highlight }: KpiTileProps) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-muted-foreground truncate text-xs font-medium tracking-wide uppercase">
              {label}
            </p>
            <p
              className={`text-2xl leading-none font-bold tabular-nums ${highlight ? highlightClass[highlight] : ''}`}
            >
              {value}
            </p>
            {sub && (
              <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>
            )}
          </div>
          {icon && (
            <div className="text-muted-foreground/50 mt-0.5 shrink-0">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
