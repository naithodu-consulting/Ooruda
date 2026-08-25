'use client';

import { useState } from 'react';

import Link from 'next/link';

import { format } from 'date-fns';
import {
  Edit2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kit/ui/alert-dialog';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card } from '@kit/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { Input } from '@kit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { cn } from '@kit/ui/utils';

import { formatINR } from '~/lib/format-inr';

import { AMC_CATEGORIES } from '../_lib/schemas/amc.schema';
import { deleteAmcContractAction } from '../_lib/server/amc-actions';
import { AddAmcContractDialog } from './add-amc-contract-dialog';
import { EditAmcContractDialog } from './edit-amc-contract-dialog';
import { RenewAmcDialog } from './renew-amc-dialog';
import type { AmcContractRow } from './amc-page-client';
import { AmcStatusBadge, getStatusRowClass } from './amc-status-badge';

const STATUS_DISPLAY: Record<string, string> = {
  '': 'All Statuses',
  active: 'Active',
  due_soon: 'Due Soon',
  urgent: 'Urgent',
  critical: 'Critical',
  expired: 'Expired',
  terminated: 'Terminated',
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function daysRemaining(
  endDate: string,
  terminatedAt: string | null,
): number | null {
  if (terminatedAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function DaysCell({ days }: { days: number | null }) {
  if (days === null) return <span className={'text-muted-foreground'}>—</span>;
  if (days < 0)
    return (
      <span className={'text-destructive font-medium'}>
        {Math.abs(days)} days overdue
      </span>
    );
  if (days === 0)
    return (
      <span className={'text-destructive font-medium'}>Expires today</span>
    );
  if (days <= 30)
    return (
      <span className={'text-warning-foreground font-medium'}>{days} days</span>
    );
  return <span>{days} days</span>;
}

interface Props {
  associationId: string;
  accountSlug: string;
  initialContracts: AmcContractRow[];
}

export function AmcList({
  associationId,
  accountSlug,
  initialContracts,
}: Props) {
  const [contracts, setContracts] =
    useState<AmcContractRow[]>(initialContracts);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState<'end_date' | 'contract_value'>(
    'end_date',
  );
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AmcContractRow | null>(null);
  const [renewTarget, setRenewTarget] = useState<AmcContractRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AmcContractRow | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { execute: executeDelete, isPending: isDeleting } = useAction(
    deleteAmcContractAction,
    {
      onSuccess: () => {
        if (pendingDeleteId) {
          setContracts((prev) => prev.filter((c) => c.id !== pendingDeleteId));
          toast.success('Contract deleted.');
        }
        setPendingDeleteId(null);
        setDeleteTarget(null);
      },
      onError: ({ error }) => {
        setPendingDeleteId(null);
        toast.error(
          error.serverError ??
            'Could not delete the contract. Please try again.',
        );
      },
    },
  );

  function handleContractAdded(contract: AmcContractRow) {
    setContracts((prev) => [...prev, contract]);
  }

  function handleContractUpdated(updated: AmcContractRow) {
    setContracts((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c)),
    );
  }

  const filtered = contracts
    .filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (categoryFilter && c.category !== categoryFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !c.name.toLowerCase().includes(s) &&
          !(c.vendor_name ?? '').toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'contract_value')
        return b.contract_value - a.contract_value;
      return a.end_date.localeCompare(b.end_date);
    });

  return (
    <div className={'flex flex-col gap-y-4'}>
      {/* Toolbar */}
      <div
        className={
          'flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'
        }
      >
        <div className={'flex flex-wrap gap-2'}>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v ?? '')}
          >
            <SelectTrigger
              className={'w-full sm:w-36'}
              data-test={'status-filter-select'}
            >
              <SelectValue>
                {STATUS_DISPLAY[statusFilter] ?? 'All Statuses'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={''}>All Statuses</SelectItem>
              <SelectItem value={'active'}>Active</SelectItem>
              <SelectItem value={'due_soon'}>Due Soon</SelectItem>
              <SelectItem value={'urgent'}>Urgent</SelectItem>
              <SelectItem value={'critical'}>Critical</SelectItem>
              <SelectItem value={'expired'}>Expired</SelectItem>
              <SelectItem value={'terminated'}>Terminated</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v ?? '')}
          >
            <SelectTrigger
              className={'w-full sm:w-44'}
              data-test={'category-filter-select'}
            >
              <SelectValue placeholder={'All Categories'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={''}>All Categories</SelectItem>
              {AMC_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={sortBy}
            onValueChange={(v) =>
              setSortBy(v as 'end_date' | 'contract_value')
            }
          >
            <SelectTrigger className={'w-full sm:w-40'} data-test={'sort-select'}>
              <SelectValue>
                {sortBy === 'end_date' ? 'Sort by Expiry' : 'Sort by Value'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={'end_date'}>Sort by Expiry</SelectItem>
              <SelectItem value={'contract_value'}>Sort by Value</SelectItem>
            </SelectContent>
          </Select>

          <div className={'relative w-full sm:w-52'}>
            <Search
              className={
                'text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2'
              }
            />
            <Input
              className={'w-full pl-8'}
              placeholder={'Search contracts…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-test={'amc-search-input'}
            />
          </div>
        </div>

        <Button
          size={'sm'}
          onClick={() => setAddOpen(true)}
          data-test={'add-amc-btn'}
        >
          <Plus className={'mr-1.5 h-3.5 w-3.5'} />
          Add Contract
        </Button>
      </div>

      {/* Table */}
      <Card className={'overflow-hidden'}>
        <div className={'overflow-x-auto'}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Days Left</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className={'text-right'}>Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className={'w-10'} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className={
                      'text-muted-foreground py-12 text-center text-sm'
                    }
                  >
                    No service contracts found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => {
                  const dl = daysRemaining(c.end_date, c.terminated_at);
                  return (
                    <TableRow
                      key={c.id}
                      className={cn(getStatusRowClass(c.status))}
                      data-test={'amc-row'}
                    >
                      <TableCell>
                        <Link
                          href={`/home/${accountSlug}/amc/${c.id}`}
                          className={'hover:text-primary text-sm font-medium'}
                          data-test={'amc-contract-link'}
                        >
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className={'text-muted-foreground text-xs'}>
                          {c.category}
                        </span>
                      </TableCell>
                      <TableCell className={'text-sm'}>
                        {c.vendor_name ?? (
                          <span className={'text-muted-foreground'}>—</span>
                        )}
                      </TableCell>
                      <TableCell className={'whitespace-nowrap text-sm'}>
                        {format(
                          new Date(c.end_date + 'T00:00:00'),
                          'd MMM yyyy',
                        )}
                      </TableCell>
                      <TableCell className={'text-sm tabular-nums'}>
                        <DaysCell days={dl} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={'outline'} className={'text-xs'}>
                          {PRIORITY_LABELS[c.priority] ?? c.priority}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={
                          'text-right text-sm font-medium tabular-nums'
                        }
                      >
                        {formatINR(c.contract_value)}
                      </TableCell>
                      <TableCell>
                        <AmcStatusBadge status={c.status} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant={'ghost'}
                                size={'icon'}
                                className={'h-7 w-7'}
                                data-test={'amc-row-actions'}
                              >
                                <MoreHorizontal className={'h-3.5 w-3.5'} />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align={'end'}>
                            <DropdownMenuItem
                              onClick={() => setEditTarget(c)}
                              data-test={'amc-edit-btn'}
                            >
                              <Edit2 className={'mr-2 h-3.5 w-3.5'} />
                              Edit
                            </DropdownMenuItem>
                            {!c.terminated_at && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => setRenewTarget(c)}
                                  data-test={'amc-renew-btn'}
                                >
                                  <RefreshCw className={'mr-2 h-3.5 w-3.5'} />
                                  Mark as Renewed
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  render={
                                    <Link
                                      href={`/home/${accountSlug}/amc/${c.id}`}
                                    />
                                  }
                                  data-test={'amc-terminate-link'}
                                >
                                  <XCircle className={'mr-2 h-3.5 w-3.5'} />
                                  End Contract
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className={'text-destructive focus:text-destructive'}
                              onClick={() => setDeleteTarget(c)}
                              data-test={'amc-delete-btn'}
                            >
                              <Trash2 className={'mr-2 h-3.5 w-3.5'} />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add dialog */}
      <AddAmcContractDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        associationId={associationId}
        onSuccess={handleContractAdded}
      />

      {/* Edit dialog */}
      {editTarget && (
        <EditAmcContractDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          contract={editTarget}
          associationId={associationId}
          onSuccess={(updated) => {
            handleContractUpdated(updated);
            setEditTarget(null);
          }}
        />
      )}

      {/* Renew dialog */}
      {renewTarget && (
        <RenewAmcDialog
          open={!!renewTarget}
          onClose={() => setRenewTarget(null)}
          contract={renewTarget}
          associationId={associationId}
          onSuccess={(updated) => {
            handleContractUpdated(updated);
            setRenewTarget(null);
          }}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className={'bg-card'} data-test={'delete-amc-dialog'}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contract?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> will be permanently removed.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className={'flex flex-wrap justify-end gap-2 pt-2'}>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button
              variant={'destructive'}
              disabled={isDeleting}
              onClick={() => {
                if (!deleteTarget) return;
                setPendingDeleteId(deleteTarget.id);
                executeDelete({
                  id: deleteTarget.id,
                  associationId,
                  name: deleteTarget.name,
                });
              }}
              data-test={'confirm-delete-btn'}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
