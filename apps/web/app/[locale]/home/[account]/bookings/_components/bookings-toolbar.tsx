'use client';

import { useEffect, useState, useTransition } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Loader2, Search } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { cn } from '@kit/ui/utils';

import pathsConfig from '~/config/paths.config';
import type { BookingView } from '~/lib/villa-db/bookings';

export type AllView = BookingView | 'blocked';

const VIEW_LABELS: Record<AllView, string> = {
  upcoming: 'Upcoming',
  in_house: 'In house',
  past: 'Past',
  cancelled: 'Cancelled',
  blocked: 'Blocked',
};

export function BookingsToolbar(props: {
  account: string;
  view: AllView;
  q: string;
  propertyId: string;
  properties: { id: string; name: string }[];
  action?: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingView, setPendingView] = useState<AllView | null>(null);

  useEffect(() => {
    setPendingView(null);
  }, [props.view]);

  const activeView = pendingView ?? props.view;

  const base = pathsConfig.app.accountVillaBookings.replace(
    '[account]',
    props.account,
  );

  const href = (view: AllView, propertyId = props.propertyId) => {
    const query = new URLSearchParams({ view });
    if (props.properties.length > 1) query.set('property', propertyId);
    return `${base}?${query.toString()}`;
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <nav
          aria-label="Booking views"
          className="bg-muted inline-flex w-max min-w-max rounded-lg p-1"
        >
          {(Object.keys(VIEW_LABELS) as AllView[]).map((view) => {
            const isSelected = activeView === view;
            const isLoadingThis = isPending && pendingView === view;

            return (
              <Link
                key={view}
                href={href(view)}
                scroll={false}
                prefetch={true}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || isSelected) return;
                  e.preventDefault();
                  setPendingView(view);
                  startTransition(() => {
                    router.push(href(view), { scroll: false });
                  });
                }}
                aria-current={isSelected ? 'page' : undefined}
                data-test={`villa-bookings-view-${view}`}
                className={cn(
                  'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                  isSelected
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                  isPending &&
                    !isLoadingThis &&
                    'pointer-events-none opacity-80',
                )}
              >
                {isLoadingThis ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                {VIEW_LABELS[view]}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {props.view !== 'blocked' ? (
          <>
            {props.properties.length > 1 ? (
              <Select
                value={props.propertyId}
                onValueChange={(id) => {
                  if (id) router.push(href(props.view, id));
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-48"
                  aria-label="Villa"
                  data-test={'villa-bookings-property'}
                >
                  <SelectValue>
                    {(id: string) =>
                      props.properties.find((p) => p.id === id)?.name ?? 'Villa'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {props.properties.map((p) => (
                    <SelectItem
                      key={p.id}
                      value={p.id}
                      data-test={`villa-bookings-property-${p.id}`}
                    >
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {/* Plain GET form: works before hydration and keeps the URL shareable. */}
            <form
              action={base}
              method="get"
              className="flex gap-2"
              role="search"
            >
              <input type="hidden" name="view" value={props.view} />
              {props.properties.length > 1 ? (
                <input type="hidden" name="property" value={props.propertyId} />
              ) : null}
              <Input
                name="q"
                defaultValue={props.q}
                placeholder="Booking code, name or phone"
                aria-label="Search bookings"
                className="w-full sm:w-64"
                data-test={'villa-bookings-search'}
              />
              <Button
                type="submit"
                variant="outline"
                size="icon"
                aria-label="Search"
                data-test={'villa-bookings-search-submit'}
              >
                <Search className="h-4 w-4" />
              </Button>
            </form>
          </>
        ) : null}

        {props.action}
      </div>
    </div>
  );
}
