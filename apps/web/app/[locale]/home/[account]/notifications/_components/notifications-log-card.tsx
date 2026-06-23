import { Badge } from '@kit/ui/badge';
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

export interface NotificationLogRow {
  id: string;
  type: string;
  recipient: string;
  channel: string;
  provider_key: string;
  status: string;
  sent_at: string;
}

function statusVariant(
  status: string,
): 'secondary' | 'outline' | 'destructive' | 'default' {
  switch (status) {
    case 'Delivered':
    case 'Sent':
      return 'secondary';
    case 'Failed':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function NotificationsLogCard(props: { rows: NotificationLogRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications log</CardTitle>
        <CardDescription>
          A history of reminders sent to owners and tenants. Sending reminders
          isn't built yet — this view will fill in once it is.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {props.rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No notifications sent yet.
          </p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {new Date(row.sent_at).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell>{row.type}</TableCell>
                    <TableCell>{row.recipient}</TableCell>
                    <TableCell>{row.channel}</TableCell>
                    <TableCell>{row.provider_key}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>
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
