'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Trash2 } from 'lucide-react';

import { formatPhoneNumber } from '@kit/shared/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kit/ui/alert-dialog';
import { Badge } from '@kit/ui/badge';
import { badgeExtras } from '@kit/ui/badge-extras';
import { Button } from '@kit/ui/button';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { cn } from '@kit/ui/utils';

import { deleteUnitAction } from '../_lib/units-actions';
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
  if (info?.full_name?.trim()) return info.full_name.trim();

  return info?.mobile_number ? formatPhoneNumber(info.mobile_number) : null;
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
              {canManage ? (
                <TableHead className="text-right">Actions</TableHead>
              ) : null}
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
                      <div className="flex items-center justify-end gap-1.5">
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
                        <DeleteUnitButton
                          unit={unit}
                          associationId={associationId}
                        />
                      </div>
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

function DeleteUnitButton({
  unit,
  associationId,
}: {
  unit: UnitRow;
  associationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onDelete = () => {
    startTransition(async () => {
      const result = await deleteUnitAction(unit.id, associationId);

      if (!result.success) {
        toast.error(result.error ?? 'Could not delete the unit.');
        return;
      }

      toast.success(`Unit ${unit.unit_no} deleted.`);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8"
            data-test="delete-unit-trigger"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        }
      />

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete unit {unit.unit_no}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the unit along with its tenancy history and any billing
            overrides. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              onDelete();
            }}
          >
            {isPending && <Spinner className="mr-2 h-4 w-4" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
