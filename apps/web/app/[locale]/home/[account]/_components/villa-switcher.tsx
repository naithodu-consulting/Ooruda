'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';

/**
 * Picks which villa a page shows, for accounts with more than one. Keeps the
 * page's other filters (period, tab…) and puts the choice in the URL, so a
 * refresh or a shared link lands on the same villa. Renders nothing for a
 * single villa.
 */
export function VillaSwitcher(props: {
  properties: { id: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (props.properties.length < 2) return null;

  return (
    <Select
      value={props.current}
      onValueChange={(id) => {
        if (!id) return;
        const q = new URLSearchParams(searchParams.toString());
        q.set('property', id);
        router.push(`${pathname}?${q.toString()}`);
      }}
    >
      <SelectTrigger
        className="w-full sm:w-64 print:hidden"
        aria-label="Villa"
        data-test={'villa-switcher'}
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
            data-test={`villa-switcher-${p.id}`}
          >
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
