'use client';

import { useState } from 'react';

import { CheckCircle2, Eye, EyeOff, XCircle } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
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

import { upsertPaymentGatewayAction } from '../lib/server/admin-server-actions';

interface GatewayData {
  keyId: string;
  isActive: boolean;
  hasSecret: boolean;
}

export function AdminPaymentGatewayCard(props: {
  associationId: string;
  existing: GatewayData | null;
}) {
  const [pending, setPending] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [keyId, setKeyId] = useState(props.existing?.keyId ?? '');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [isActive, setIsActive] = useState(props.existing?.isActive ?? true);

  const isEditing = !!props.existing;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyId.trim()) {
      toast.error('Key ID is required');
      return;
    }
    if (!isEditing && !keySecret.trim()) {
      toast.error('Key Secret is required');
      return;
    }

    setPending(true);
    try {
      const result = await upsertPaymentGatewayAction({
        associationId: props.associationId,
        keyId: keyId.trim(),
        keySecret: keySecret.trim() || '___unchanged___',
        webhookSecret: webhookSecret.trim() || undefined,
        isActive,
      });

      if (!result.success) {
        toast.error(result.error ?? 'Failed to save');
      } else {
        toast.success('Payment gateway saved successfully');
        setKeySecret('');
        setWebhookSecret('');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Payment Gateway</CardTitle>
            <CardDescription className="mt-0.5">
              Razorpay credentials for owner/tenant self-service payments.
            </CardDescription>
          </div>
          {props.existing ? (
            props.existing.isActive ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <XCircle className="h-3 w-3" />
                Inactive
              </Badge>
            )
          ) : (
            <Badge variant="outline">Not configured</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="rzp-key-id">Razorpay Key ID</Label>
            <Input
              id="rzp-key-id"
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="rzp_live_XXXXXXXXXXXX"
              className="font-mono text-sm"
              disabled={pending}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="rzp-key-secret">
              Key Secret
              {isEditing && (
                <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                  (leave blank to keep existing)
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="rzp-key-secret"
                type={showSecret ? 'text' : 'password'}
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
                placeholder={
                  isEditing ? '••••••••••••••••••••' : 'Enter secret key'
                }
                className="pr-10 font-mono text-sm"
                disabled={pending}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                tabIndex={-1}
              >
                {showSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="rzp-webhook-secret">
              Webhook Secret
              <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="rzp-webhook-secret"
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="From Razorpay Dashboard → Webhooks"
              className="font-mono text-sm"
              disabled={pending}
              autoComplete="new-password"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="rzp-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={pending}
            />
            <Label htmlFor="rzp-active" className="cursor-pointer">
              {isActive
                ? 'Active — owners/tenants can pay online'
                : 'Inactive — online payments disabled'}
            </Label>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={pending} size="sm">
              {pending
                ? 'Saving…'
                : isEditing
                  ? 'Update Gateway'
                  : 'Configure Gateway'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
