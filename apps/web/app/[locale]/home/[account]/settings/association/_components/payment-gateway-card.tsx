'use client';

import { useActionState, useState } from 'react';

import { Alert, AlertDescription } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { toast } from '@kit/ui/sonner';
import { Switch } from '@kit/ui/switch';

import {
  upsertPaymentGatewayAction,
  type UpsertGatewayState,
} from '../_actions/update-association';

interface GatewayConfig {
  key_id: string;
  is_active: boolean;
  has_secret: boolean;
  has_webhook_secret: boolean;
}

interface Props {
  associationId: string;
  gateway: GatewayConfig | null;
}

export function PaymentGatewayCard({ associationId, gateway }: Props) {
  // Use gateway state as the key so React remounts the inner form
  // when the server sends back updated data after a save.
  const configKey = gateway ? `${gateway.key_id}-${gateway.is_active}` : 'new';

  return (
    <Card data-test="payment-gateway-card">
      <CardHeader>
        <CardTitle>Online Payment Gateway</CardTitle>
        <CardDescription>
          Configure Razorpay credentials to enable online payments for owners
          and tenants. Credentials are stored server-side and never sent to the
          browser.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <GatewayForm
          key={configKey}
          associationId={associationId}
          gateway={gateway}
        />
      </CardContent>
    </Card>
  );
}

function GatewayForm({
  associationId,
  gateway,
}: {
  associationId: string;
  gateway: GatewayConfig | null;
}) {
  const [isActive, setIsActive] = useState(gateway?.is_active ?? true);

  const action = upsertPaymentGatewayAction.bind(null, associationId);

  const [state, formAction, isPending] = useActionState<
    UpsertGatewayState,
    FormData
  >(async (_prev, formData) => {
    const result = await action(_prev, formData);
    if (result?.success) {
      toast.success('Payment gateway settings saved.');
    }
    return result;
  }, null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    // Switch doesn't submit as a form field — inject its value manually.
    formData.set('is_active', isActive ? 'true' : 'false');
    formAction(formData);
  }

  const isConfigured = !!gateway;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="key_id">Razorpay Key ID</Label>
        <Input
          id="key_id"
          name="key_id"
          placeholder="rzp_live_XXXXXXXXXXXX"
          defaultValue={gateway?.key_id ?? ''}
          required
          data-test="gateway-key-id"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="key_secret">
          Key Secret{' '}
          {isConfigured && (
            <span className="text-muted-foreground text-xs">
              (leave blank to keep existing)
            </span>
          )}
        </Label>
        <Input
          id="key_secret"
          name="key_secret"
          type="password"
          placeholder={
            isConfigured && gateway.has_secret
              ? '••••••••••••••••'
              : 'Enter your Razorpay key secret'
          }
          data-test="gateway-key-secret"
        />
        {isConfigured && !gateway.has_secret && (
          <p className="text-destructive text-xs">
            No secret stored — enter one to enable payments.
          </p>
        )}
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
          placeholder={
            isConfigured && gateway.has_webhook_secret
              ? '••••••••••••••••'
              : 'Enter your Razorpay webhook secret'
          }
          data-test="gateway-webhook-secret"
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Enable online payments</span>
          <span className="text-muted-foreground text-xs">
            Owners and tenants will see the Pay Online button on their bills.
          </span>
        </div>
        <Switch
          checked={isActive}
          onCheckedChange={setIsActive}
          data-test="gateway-active-toggle"
        />
      </div>

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
        {isPending ? 'Saving…' : 'Save Gateway Settings'}
      </Button>
    </form>
  );
}
