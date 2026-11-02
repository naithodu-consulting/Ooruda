'use client';

import React, { useTransition } from 'react';

import { useAction } from 'next-safe-action/hooks';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Checkbox } from '@kit/ui/checkbox';
import { toast } from '@kit/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { setAssocAdminPermissionsAction } from '../lib/server/admin-server-actions';

export interface AssocPermissionRow {
  targetRole: 'prop_owner' | 'tenant' | 'billing_operator';
  canInvite: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const ROLE_LABELS: Record<AssocPermissionRow['targetRole'], string> = {
  prop_owner: 'Unit Owner',
  billing_operator: 'Billing Operator',
  tenant: 'Tenant',
};

const TARGET_ROLES: AssocPermissionRow['targetRole'][] = [
  'prop_owner',
  'billing_operator',
  'tenant',
];

export function AdminAssocPermissions(props: {
  associationId: string;
  initialPermissions: AssocPermissionRow[];
}) {
  const [permissions, setPermissions] = usePermissionState(
    props.initialPermissions,
  );
  const [, startTransition] = useTransition();

  const { execute, result, isExecuting } = useAction(
    setAssocAdminPermissionsAction,
    {
      onSuccess: () => toast.success('Permissions saved'),
    },
  );

  const toggle = (
    role: AssocPermissionRow['targetRole'],
    field: 'canInvite' | 'canEdit' | 'canDelete',
  ) => {
    setPermissions((prev) =>
      prev.map((p) =>
        p.targetRole === role ? { ...p, [field]: !p[field] } : p,
      ),
    );
  };

  const onSave = () => {
    startTransition(() => {
      execute({ associationId: props.associationId, permissions });
    });
  };

  const error = result.serverError;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Association Admin Permissions</p>
          <p className="text-muted-foreground text-xs">
            Control which member roles the assoc_admin can invite, edit, or
            delete within this association.
          </p>
        </div>

        <Badge variant="outline" className="text-xs">
          All off by default
        </Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/2">Role</TableHead>
            <TableHead className="text-center">Can Invite</TableHead>
            <TableHead className="text-center">Can Edit</TableHead>
            <TableHead className="text-center">Can Delete</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {TARGET_ROLES.map((role) => {
            const row = permissions.find((p) => p.targetRole === role) ?? {
              targetRole: role,
              canInvite: false,
              canEdit: false,
              canDelete: false,
            };

            return (
              <TableRow key={role}>
                <TableCell className="font-medium">
                  {ROLE_LABELS[role]}
                </TableCell>

                {(['canInvite', 'canEdit', 'canDelete'] as const).map(
                  (field) => (
                    <TableCell key={field}>
                      <div className="flex justify-center">
                        <Checkbox
                          checked={row[field]}
                          onCheckedChange={() => toggle(role, field)}
                        />
                      </div>
                    </TableCell>
                  ),
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex justify-end">
        <Button size="sm" onClick={onSave} disabled={isExecuting}>
          {isExecuting ? 'Saving...' : 'Save Permissions'}
        </Button>
      </div>
    </div>
  );
}

function usePermissionState(initial: AssocPermissionRow[]) {
  const [permissions, setPermissions] = React.useState<AssocPermissionRow[]>(
    () =>
      TARGET_ROLES.map(
        (role) =>
          initial.find((p) => p.targetRole === role) ?? {
            targetRole: role,
            canInvite: false,
            canEdit: false,
            canDelete: false,
          },
      ),
  );

  return [permissions, setPermissions] as const;
}
