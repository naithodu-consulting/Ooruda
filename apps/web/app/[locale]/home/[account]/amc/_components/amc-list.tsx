'use client';

import { useState } from 'react';

import Link from 'next/link';

import { format } from 'date-fns';
import { Plus, Search } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card } from '@kit/ui/card';
import { Input } from '@kit/ui/input';
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
import { cn } from '@kit/ui/utils';

import { formatINR } from '~/lib/format-inr';

import { AMC_CATEGORIES } from '../_lib/schemas/amc.schema';
import { AddAmcContractDialog } from './add-amc-contract-dialog';
import type { AmcContractRow } from './amc-page-client';
import { AmcStatusBadge, getStatusRowClass } from './amc-status-badge';

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function daysLeft(endDate: string, terminatedAt: string | null): number | null {
  if (terminatedAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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

  function handleContractAdded(contract: AmcContractRow) {
    setContracts((prev) => [...prev, contract]);
  }

  const filtered = contracts
    .filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (categoryFilter && c.category !== categoryFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !c.name.toLowerCase().includes(s) &&
          !c.vendor_name.toLowerCase().includes(s)
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
              className={'w-36'}
              data-test={'status-filter-select'}
            >
              <SelectValue placeholder={'All Statuses'} />
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
              className={'w-44'}
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
            onValueChange={(v) => setSortBy(v as 'end_date' | 'contract_value')}
          >
            <SelectTrigger className={'w-40'} data-test={'sort-select'}>
              <SelectValue>
                {sortBy === 'end_date' ? 'Sort by Expiry' : 'Sort by Value'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={'end_date'}>Sort by Expiry</SelectItem>
              <SelectItem value={'contract_value'}>Sort by Value</SelectItem>
            </SelectContent>
          </Select>

          <div className={'relative'}>
            <Search
              className={
                'text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2'
              }
            />
            <Input
              className={'w-52 pl-8'}
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className={
                      'text-muted-foreground py-12 text-center text-sm'
                    }
                  >
                    No AMC contracts found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => {
                  const dl = daysLeft(c.end_date, c.terminated_at);
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
                        {c.vendor_name}
                      </TableCell>
                      <TableCell className={'text-sm whitespace-nowrap'}>
                        {format(
                          new Date(c.end_date + 'T00:00:00'),
                          'd MMM yyyy',
                        )}
                      </TableCell>
                      <TableCell className={'text-sm tabular-nums'}>
                        {dl === null ? (
                          '—'
                        ) : dl < 0 ? (
                          <span className={'text-destructive font-medium'}>
                            {Math.abs(dl)}d overdue
                          </span>
                        ) : dl <= 30 ? (
                          <span
                            className={
                              'font-medium text-amber-600 dark:text-amber-400'
                            }
                          >
                            {dl}d
                          </span>
                        ) : (
                          <span>{dl}d</span>
                        )}
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
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AddAmcContractDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        associationId={associationId}
        onSuccess={handleContractAdded}
      />
    </div>
  );
}
