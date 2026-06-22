import { Badge } from '@kit/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

export interface UnitRow {
  id: string;
  unit_no: string;
  type: string;
  floor: number | null;
  area_sqft: number;
  owner_id: string | null;
  status: string;
}

export interface OwnerInfo {
  full_name: string | null;
  mobile_number: string | null;
}

const areaFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export function UnitsTable({
  units,
  owners,
}: {
  units: UnitRow[];
  owners: Record<string, OwnerInfo>;
}) {
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Unit</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Floor</TableHead>
            <TableHead className="text-right">Area (sq.ft)</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {units.map((unit) => {
            const owner = unit.owner_id ? owners[unit.owner_id] : undefined;
            const ownerLabel =
              owner?.full_name?.trim() || owner?.mobile_number || null;

            return (
              <TableRow key={unit.id}>
                <TableCell className="font-medium">{unit.unit_no}</TableCell>
                <TableCell>{unit.type}</TableCell>
                <TableCell>{unit.floor ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {areaFmt.format(unit.area_sqft)}
                </TableCell>
                <TableCell>
                  {ownerLabel ?? (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      unit.status === 'Occupied' ? 'secondary' : 'outline'
                    }
                  >
                    {unit.status}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
