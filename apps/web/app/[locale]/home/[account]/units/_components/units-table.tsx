'use client';

import { useState } from 'react';

import { Badge } from '@kit/ui/badge';
import { badgeExtras } from '@kit/ui/badge-extras';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { cn } from '@kit/ui/utils';

import { EditUnitDialog } from './edit-unit-dialog';

type UnitFilter = 'all' | 'occupied' | 'vacant' | 'ground' | 'overdue';

const FILTERS: { id: UnitFilter; label: string }[] = [
  { id: 'all', label: 'All units' },
  { id: 'occupied', label: 'Occupied' },
  { id: 'vacant', label: 'Vacant' },
  { id: 'ground', label: 'Ground floor' },
  { id: 'overdue', label: 'Overdue' },
];

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

export interface MemberOption {
  id: string;
  label: string;
}

export interface TenancyInfo {
  id: string;
  unit_id: string;
  tenant_id: string;
  start_date: string;
}

const areaFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

function personLabel(info: OwnerInfo | undefined): string | null {
  return info?.full_name?.trim() || info?.mobile_number || null;
}

export function UnitsTable({
  units,
  people,
  tenancyByUnit,
  canManage,
  associationId,
  eligibleOwners,
  eligibleTenants,
  overdueUnitIds,
}: {
  units: UnitRow[];
  people: Record<string, OwnerInfo>;
  tenancyByUnit: Record<string, TenancyInfo>;
  canManage: boolean;
  associationId: string;
  eligibleOwners: MemberOption[];
  eligibleTenants: MemberOption[];
  overdueUnitIds: string[];
}) {
  const [filter, setFilter] = useState<UnitFilter>('all');
  const overdueSet = new Set(overdueUnitIds);

  const filteredUnits = units.filter((unit) => {
    switch (filter) {
      case 'occupied':
        return unit.status === 'Occupied';
      case 'vacant':
        return unit.status !== 'Occupied';
      case 'ground':
        return unit.floor === 0;
      case 'overdue':
        return overdueSet.has(unit.id);
      default:
        return true;
    }
  });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
              filter === f.id
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/30 hover:bg-primary/5',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Floor</TableHead>
              <TableHead className="text-right">Area (sq.ft)</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredUnits.map((unit) => {
              const ownerLabel = unit.owner_id
                ? personLabel(people[unit.owner_id])
                : null;

              const tenancy = tenancyByUnit[unit.id];
              const tenantLabel = tenancy
                ? personLabel(people[tenancy.tenant_id])
                : null;

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
                    {tenantLabel ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        unit.status === 'Occupied'
                          ? badgeExtras.success
                          : undefined
                      }
                    >
                      {unit.status}
                    </Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <EditUnitDialog
                        unit={unit}
                        associationId={associationId}
                        ownerLabel={ownerLabel}
                        tenancy={
                          tenancy
                            ? {
                                ...tenancy,
                                label: tenantLabel ?? tenancy.tenant_id,
                              }
                            : null
                        }
                        eligibleOwners={eligibleOwners}
                        eligibleTenants={eligibleTenants}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
