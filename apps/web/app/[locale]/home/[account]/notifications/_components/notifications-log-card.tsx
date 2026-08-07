'use client';

import { useState } from 'react';

import {
  FileText,
  CircleDollarSign,
  Clock,
  AlertTriangle,
  Send,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { badgeExtras } from '@kit/ui/badge-extras';
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

const ALL_TYPES = 'all';

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

export function NotificationsLogCard(props: { rows: NotificationLogRow[] }) {
  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES);

  const uniqueTypes = [...new Set(props.rows.map((r) => r.type))];
  const filtered =
    typeFilter === ALL_TYPES
      ? props.rows
      : props.rows.filter((r) => r.type === typeFilter);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Outbound Notifications</CardTitle>
          <CardDescription>
            All SMS and email notifications sent to owners and tenants.
          </CardDescription>
        </div>

        {uniqueTypes.length > 1 && (
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v ?? ALL_TYPES)}
            data-test="notification-type-filter"
          >
            <SelectTrigger className="h-8 w-full text-xs sm:w-44">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TYPES}>All types</SelectItem>
              {uniqueTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_CONFIG[t]?.label ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-muted-foreground py-8 text-center text-sm"
                    >
                      No {TYPE_CONFIG[typeFilter]?.label ?? typeFilter}{' '}
                      notifications found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => {
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
        )}
      </CardContent>
    </Card>
  );
}
