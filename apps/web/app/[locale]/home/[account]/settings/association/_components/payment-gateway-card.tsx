'use client';

import { useActionState, useState, useTransition } from 'react';

import { AlertTriangle, CheckCircle2, Shield, Trash2 } from 'lucide-react';

import { Alert, AlertDescription } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { toast } from '@kit/ui/sonner';
import { Switch } from '@kit/ui/switch';

import {
  createPaymentGatewayAction,
  deletePaymentGatewayAction,
  toggleGatewayActiveAction,
  type GatewayActionState,
} from '../_actions/update-association';

export interface GatewayConfig {
  key_id: string;
  is_active: boolean;
  has_secret: boolean;
  has_webhook_secret: boolean;
  created_at: string;
}

interface Props {
  associationId: string;
  gateway: GatewayConfig | null;
}

// Mask key_id: show first 12 chars + last 4, rest as bullets.
// e.g. "rzp_live_XXXX••••••••ABCD"
function maskKeyId(keyId: string): string {
  if (keyId.length <= 16) return keyId;
  const prefix = keyId.slice(0, 12);
  const suffix = keyId.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

export function PaymentGatewayCard({ associationId, gateway }: Props) {
  return (
    <Card data-test="payment-gateway-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Online Payment Gateway</CardTitle>
            <CardDescription className="mt-1">
              Connect Razorpay to enable online payments. Once saved,
              credentials cannot be changed. Please delete and add new ones if
              you need to update them.
            </CardDescription>
          </div>
          <Shield className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
        </div>
      </CardHeader>

      <CardContent>
        {gateway ? (
          <ConfiguredView associationId={associationId} gateway={gateway} />
        ) : (
          <CreateForm associationId={associationId} />
        )}
      </CardContent>
    </Card>
  );
}

// ── Configured view ───────────────────────────────────────────────────────────

function ConfiguredView({
  associationId,
  gateway,
}: {
  associationId: string;
  gateway: GatewayConfig;
}) {
  const [isActive, setIsActive] = useState(gateway.is_active);
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  function handleToggle(value: boolean) {
    setIsActive(value);
    startTransition(async () => {
      const result = await toggleGatewayActiveAction(associationId, value);
      if (result?.error) {
        setIsActive(!value);
        toast.error(result.error);
      } else {
        toast.success(
          value ? 'Online payments enabled.' : 'Online payments paused.',
        );
      }
    });
  }

  function handleDelete() {
    startDelete(async () => {
      const result = await deletePaymentGatewayAction(associationId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success('Payment gateway removed.');
        setDeleteOpen(false);
      }
    });
  }

  const createdDate = new Date(gateway.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Status row */}
      <div className="bg-muted/40 flex items-center justify-between rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="text-success h-4 w-4" />
          <span className="text-sm font-medium">Razorpay configured</span>
          <Badge
            variant="outline"
            className={
              isActive
                ? 'text-success border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-500/10'
                : 'text-warning border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-500/10'
            }
          >
            {isActive ? 'Active' : 'Paused'}
          </Badge>
        </div>
        <span className="text-muted-foreground text-xs">
          Added {createdDate}
        </span>
      </div>

      {/* Credential rows - read-only */}
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <CredentialRow label="Key ID" value={maskKeyId(gateway.key_id)} />
        <CredentialRow
          label="Key Secret"
          value={gateway.has_secret ? '••••••••••••••••' : 'Not set'}
          missing={!gateway.has_secret}
        />
        <CredentialRow
          label="Webhook Secret"
          value={
            gateway.has_webhook_secret ? '••••••••••••••••' : 'Not configured'
          }
        />
      </div>

      {/* Enable/disable toggle */}
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Enable online payments</span>
          <span className="text-muted-foreground text-xs">
            Owners and tenants see the Pay Online button on their bills.
          </span>
        </div>
        <Switch
          checked={isActive}
          onCheckedChange={handleToggle}
          disabled={isPending}
          data-test="gateway-active-toggle"
        />
      </div>

      {/* Delete */}
      <div className="border-destructive/20 flex items-start justify-between rounded-lg border bg-red-50/40 p-3 dark:bg-red-500/5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Remove gateway</span>
          <span className="text-muted-foreground text-xs">
            Disables online payments immediately. You can add new credentials
            after deleting.
          </span>
        </div>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger>
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0"
              data-test="gateway-delete-button"
              type="button"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="text-destructive h-5 w-5" />
                Delete Payment Gateway?
              </DialogTitle>
              <DialogDescription>
                This will immediately disable online payments for all owners and
                tenants. Existing payment records are not affected. You can
                re-configure with new credentials afterwards.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
                data-test="gateway-delete-confirm"
              >
                {isDeleting ? 'Deleting…' : 'Yes, delete gateway'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function CredentialRow({
  label,
  value,
  missing,
}: {
  label: string;
  value: string;
  missing?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-muted-foreground w-32 shrink-0 text-xs font-medium">
        {label}
      </span>
      <span
        className={`font-mono text-xs ${missing ? 'text-destructive' : 'text-foreground'}`}
      >
        {value}
      </span>
    </div>
  );
}

// ── Create form (shown only when no gateway exists) ───────────────────────────

function CreateForm({ associationId }: { associationId: string }) {
  const action = createPaymentGatewayAction.bind(null, associationId);

  const [state, formAction, isPending] = useActionState<
    GatewayActionState,
    FormData
  >(async (_prev, formData) => {
    const result = await action(_prev, formData);
    if (result?.success) {
      toast.success('Payment gateway configured.');
    }
    return result;
  }, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="key_id">Razorpay Key ID</Label>
        <Input
          id="key_id"
          name="key_id"
          placeholder="rzp_live_XXXXXXXXXXXX"
          required
          data-test="gateway-key-id"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="key_secret">Key Secret</Label>
        <Input
          id="key_secret"
          name="key_secret"
          type="password"
          placeholder="Enter your Razorpay key secret"
          required
          data-test="gateway-key-secret"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="webhook_secret">
          Webhook Secret{' '}
          <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="webhook_secret"
          name="webhook_secret"
          type="password"
          placeholder="Enter your Razorpay webhook secret"
          data-test="gateway-webhook-secret"
        />
      </div>

      <Alert
        variant="default"
        className="text-warning border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-500/10"
      >
        <Shield className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Credentials are stored encrypted server-side and{' '}
          <strong>cannot be viewed or edited</strong> after saving. To rotate
          keys, delete and re-configure.
        </AlertDescription>
      </Alert>

      {state?.error && (
        <Alert variant="destructive" data-test="gateway-error">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        disabled={isPending}
        className="self-start"
        data-test="gateway-save-button"
      >
        {isPending ? 'Saving…' : 'Save Gateway'}
      </Button>
    </form>
  );
}
