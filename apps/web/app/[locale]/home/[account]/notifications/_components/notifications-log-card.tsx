'use client';

import { useMemo, useState } from 'react';

import {
  FileText,
  CircleDollarSign,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Send,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { badgeExtras } from '@kit/ui/badge-extras';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

export interface NotificationLogRow {
  id: string;
  type: string;
  recipient: string;
  channel: string;
  provider_key: string;
  status: string;
  sent_at: string;
}

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; className: string }
> = {
  bill_generated: {
    label: 'Bill Generated',
    icon: <FileText className="h-3.5 w-3.5" />,
    className: badgeExtras.teal,
  },
  payment_confirmed: {
    label: 'Payment Confirmed',
    icon: <CircleDollarSign className="h-3.5 w-3.5" />,
    className: badgeExtras.purple,
  },
  reminder: {
    label: 'Reminder',
    icon: <Clock className="h-3.5 w-3.5" />,
    className: badgeExtras.warning,
  },
  overdue: {
    label: 'Overdue',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    className: badgeExtras.danger,
  },
};

const ALL = 'all';
const PAGE_SIZE = 25;

function formatSentAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleString('en-IN', {
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const month = date.toLocaleString('en-IN', {
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
  const year = date.toLocaleString('en-IN', {
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const time = date.toLocaleString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
  return `${day} ${month} ${year}, ${time}`;
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'Delivered':
      return badgeExtras.success;
    case 'Sent':
      return badgeExtras.teal;
    case 'Failed':
      return badgeExtras.danger;
    case 'Pending':
      return badgeExtras.warning;
    default:
      return '';
  }
}

function channelLabel(channel: string, providerKey: string): string {
  if (channel === 'sms') return 'SMS';
  if (channel === 'email') return 'Email';
  if (channel === 'in_app') return 'In-App';
  return toTitleCase(providerKey || channel);
}

export function NotificationsLogCard(props: { rows: NotificationLogRow[] }) {
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [channelFilter, setChannelFilter] = useState<string>(ALL);
  const [page, setPage] = useState(1);

  const uniqueTypes = useMemo(
    () => [...new Set(props.rows.map((r) => r.type))],
    [props.rows],
  );
  const uniqueChannels = useMemo(
    () => [...new Set(props.rows.map((r) => r.channel))].filter(Boolean),
    [props.rows],
  );

  const filtered = useMemo(() => {
    return props.rows.filter((r) => {
      if (typeFilter !== ALL && r.type !== typeFilter) return false;
      if (channelFilter !== ALL && r.channel !== channelFilter) return false;
      return true;
    });
  }, [props.rows, typeFilter, channelFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  // Reset to page 1 when filters change
  const handleTypeFilter = (v: string | null) => {
    setTypeFilter(v ?? ALL);
    setPage(1);
  };
  const handleChannelFilter = (v: string | null) => {
    setChannelFilter(v ?? ALL);
    setPage(1);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Outbound Notifications</CardTitle>
          <CardDescription>
            All SMS and email notifications sent to owners and tenants.
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {uniqueTypes.length > 1 && (
            <Select
              value={typeFilter}
              onValueChange={handleTypeFilter}
              data-test="notification-type-filter"
            >
              <SelectTrigger className="h-8 w-full text-xs sm:w-44">
                <SelectValue>
                  {(v: string) =>
                    v === ALL ? 'All types' : (TYPE_CONFIG[v]?.label ?? v)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {uniqueTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_CONFIG[t]?.label ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {uniqueChannels.length > 1 && (
            <Select
              value={channelFilter}
              onValueChange={handleChannelFilter}
              data-test="notification-channel-filter"
            >
              <SelectTrigger className="h-8 w-full text-xs sm:w-36">
                <SelectValue>
                  {(v: string) =>
                    v === ALL ? 'All channels' : channelLabel(v, v)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All channels</SelectItem>
                {uniqueChannels.map((c) => (
                  <SelectItem key={c} value={c}>
                    {channelLabel(c, c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {props.rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full">
              <Send className="text-muted-foreground h-5 w-5" />
            </div>
            <p className="text-muted-foreground text-sm">
              No notifications sent yet.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sent</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-muted-foreground py-8 text-center text-sm"
                      >
                        No notifications match the selected filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paged.map((row) => {
                      const typeConf = TYPE_CONFIG[row.type];
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {formatSentAt(row.sent_at)}
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className={typeConf?.className}
                            >
                              {typeConf?.icon}
                              <span className="ml-1">
                                {typeConf?.label ?? row.type}
                              </span>
                            </Badge>
                          </TableCell>

                          <TableCell className="font-medium">
                            {toTitleCase(row.recipient)}
                          </TableCell>

                          <TableCell className="text-muted-foreground text-sm">
                            {channelLabel(row.channel, row.provider_key)}
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className={statusBadgeClass(row.status)}
                            >
                              {row.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Footer: count + pagination */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {filtered.length === props.rows.length
                  ? `${props.rows.length} notification${props.rows.length !== 1 ? 's' : ''}`
                  : `${filtered.length} of ${props.rows.length} notifications`}
              </span>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={safePage === 1}
                    onClick={() => setPage((p) => p - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-muted-foreground tabular-nums">
                    {safePage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={safePage === totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
