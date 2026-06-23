'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { useAction } from 'next-safe-action/hooks';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import { If } from '@kit/ui/if';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';

import {
  removeUserRoleAction,
  setUserRoleAction,
} from '../lib/server/admin-server-actions';
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
} from '../lib/server/schema/create-user.schema';

type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export interface AssociationOption {
  id: string;
  name: string;
}

export interface UserMembership {
  associationId: string;
  associationName: string;
  role: string;
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;
}

export function AdminManageRolesDialog(props: {
  userId: string;
  userName: string;
  associations: AssociationOption[];
  memberships: UserMembership[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  const [associationId, setAssociationId] = useState(
    props.associations[0]?.id ?? '',
  );
  const [role, setRole] = useState<string>('');

  const setRoleAction = useAction(setUserRoleAction, {
    onSuccess: () => {
      toast.success('Role saved');
      setRole('');
      router.refresh();
    },
  });

  const removeAction = useAction(removeUserRoleAction, {
    onSuccess: () => {
      toast.success('Role removed');
      router.refresh();
    },
  });

  const isPending = setRoleAction.isExecuting || removeAction.isExecuting;
  const error =
    setRoleAction.result.serverError ?? removeAction.result.serverError;

  const onSave = () => {
    if (!associationId || !role) {
      toast.error('Pick an association and a role first.');
      return;
    }

    setRoleAction.execute({
      userId: props.userId,
      associationId,
      role: role as AssignableRole,
    });
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage roles — {props.userName}</DialogTitle>
          <DialogDescription>
            Assign this user to an association with a role, or remove an
            existing assignment.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <If condition={!!error}>
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </If>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Current roles</span>

            {props.memberships.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No association roles assigned yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {props.memberships.map((membership) => (
                  <li
                    key={membership.associationId}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">
                        {membership.associationName}
                      </span>{' '}
                      — {roleLabel(membership.role)}
                    </span>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() =>
                        removeAction.execute({
                          userId: props.userId,
                          associationId: membership.associationId,
                        })
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t pt-4">
            <span className="text-sm font-medium">Assign / change role</span>

            <div className="flex flex-col gap-2">
              <Select
                value={associationId}
                onValueChange={(value) => setAssociationId(value ?? '')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an association">
                    {(value: string) =>
                      props.associations.find((a) => a.id === value)?.name ??
                      'Select an association'
                    }
                  </SelectValue>
                </SelectTrigger>

                <SelectContent>
                  {props.associations.map((association) => (
                    <SelectItem key={association.id} value={association.id}>
                      {association.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={role}
                onValueChange={(value) => setRole(value ?? '')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a role">
                    {(value: string) =>
                      value ? roleLabel(value) : 'Select a role'
                    }
                  </SelectValue>
                </SelectTrigger>

                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="self-start"
              size="sm"
              disabled={isPending}
              onClick={onSave}
            >
              {setRoleAction.isExecuting && (
                <Spinner className="mr-2 h-4 w-4" />
              )}
              Save role
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
