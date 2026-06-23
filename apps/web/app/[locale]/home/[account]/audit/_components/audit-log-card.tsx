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

export interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string;
  summary: string | null;
  actor: string;
  actorRoleLabel: string | null;
  created_at: string;
}

function roleBadgeClassName(roleLabel: string | null): string | undefined {
  switch (roleLabel) {
    case 'Association Admin':
      return badgeExtras.purple;
    case 'Billing Operator':
      return badgeExtras.teal;
    default:
      return undefined;
  }
}

export function AuditLogCard(props: { rows: AuditLogRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>
          A record of every unit, MESCOM, billing, and payment change made
          across your association, most recent first.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {props.rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing has happened here yet.
          </p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatTimestampDMY(row.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {row.actor}
                        {row.actorRoleLabel ? (
                          <Badge
                            variant="outline"
                            className={roleBadgeClassName(row.actorRoleLabel)}
                          >
                            {row.actorRoleLabel}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{row.action}</TableCell>
                    <TableCell>{row.entity_type}</TableCell>
                    <TableCell>{row.summary ?? '—'}</TableCell>
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
