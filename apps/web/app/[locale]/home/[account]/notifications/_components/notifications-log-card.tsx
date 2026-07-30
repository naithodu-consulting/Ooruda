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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { formatTimestampDMY } from '~/lib/format-date';

export interface NotificationLogRow {
  id: string;
  type: string;
  recipient: string;
  channel: string;
  provider_key: string;
  status: string;
  sent_at: string;
}

function statusBadgeClassName(status: string): string | undefined {
  switch (status) {
    case 'Delivered':
    case 'Sent':
      return badgeExtras.success;
    case 'Failed':
      return badgeExtras.danger;
    case 'Pending':
      return badgeExtras.warning;
    default:
      return undefined;
  }
}

export function NotificationsLogCard(props: { rows: NotificationLogRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications log</CardTitle>
        <CardDescription>
          A history of reminders sent to owners and tenants. Sending reminders
          isn&apos;t built yet.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {props.rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No notifications sent yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Sent</TableHead>
                  <TableHead scope="col">Type</TableHead>
                  <TableHead scope="col">Recipient</TableHead>
                  <TableHead scope="col">Channel</TableHead>
                  <TableHead scope="col">Provider</TableHead>
                  <TableHead scope="col">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatTimestampDMY(row.sent_at)}</TableCell>
                    <TableCell>{row.type}</TableCell>
                    <TableCell>{row.recipient}</TableCell>
                    <TableCell>{row.channel}</TableCell>
                    <TableCell>{row.provider_key}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusBadgeClassName(row.status)}
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
