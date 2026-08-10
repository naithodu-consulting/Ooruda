'use client';

import { useState, useTransition } from 'react';

import { Bell, Mail, MessageSquare } from 'lucide-react';

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
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import { Label } from '@kit/ui/label';
import { Switch } from '@kit/ui/switch';

import { toggleNotificationChannelAction } from '../_lib/notification-settings-actions';
import type { NotificationChannelStatus } from '../_lib/notification-settings-actions';

const CHANNEL_META: Record<
  string,
  { label: string; description: string; icon: React.ReactNode }
> = {
  SMS: {
    label: 'SMS',
    description:
      'Send bill-generated, payment-confirmed, overdue, and reminder SMS to owners and tenants via your configured SMS provider.',
    icon: <MessageSquare className="h-5 w-5" />,
  },
  Email: {
    label: 'Email',
    description:
      'Send automated bill and payment emails via Resend to registered email addresses of owners and tenants.',
    icon: <Mail className="h-5 w-5" />,
  },
  WhatsApp: {
    label: 'WhatsApp',
    description:
      'Send notifications via WhatsApp Business API (requires Kaleyra WhatsApp channel configuration).',
    icon: <MessageSquare className="h-5 w-5" />,
  },
};

type PendingToggle = { channel: string; newValue: boolean };

export function NotificationSettingsClient({
  initialSettings,
}: {
  initialSettings: NotificationChannelStatus[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(
    null,
  );

  function requestToggle(channel: string, newValue: boolean) {
    if (pending) return;
    setPendingToggle({ channel, newValue });
  }

  function cancelToggle() {
    setPendingToggle(null);
  }

  function confirmToggle() {
    if (!pendingToggle) return;
    const { channel, newValue } = pendingToggle;
    setPendingToggle(null);
    setError(null);
    startTransition(async () => {
      const result = await toggleNotificationChannelAction(channel, newValue);
      if (!result.success) {
        setError(result.error ?? 'Failed to update setting');
        return;
      }
      setSettings((prev) =>
        prev.map((s) =>
          s.channel === channel ? { ...s, isActive: newValue } : s,
        ),
      );
    });
  }

  const meta = pendingToggle ? CHANNEL_META[pendingToggle.channel] : null;
  const action = pendingToggle?.newValue ? 'enable' : 'disable';
  const channelLabel = meta?.label ?? pendingToggle?.channel ?? '';

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {settings.map((setting) => {
          const channelMeta = CHANNEL_META[setting.channel];
          return (
            <Card key={setting.channel} className="bg-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-muted-foreground flex items-center gap-2">
                    {channelMeta?.icon ?? <Bell className="h-5 w-5" />}
                    <CardTitle className="text-base leading-none">
                      {channelMeta?.label ?? setting.channel}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={setting.isActive ? 'default' : 'secondary'}>
                      {setting.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`toggle-${setting.channel}`}
                        className="sr-only"
                      >
                        Toggle {setting.channel}
                      </Label>
                      <Switch
                        id={`toggle-${setting.channel}`}
                        checked={setting.isActive}
                        disabled={pending}
                        data-test={`toggle-${setting.channel.toLowerCase()}-notifications`}
                        onCheckedChange={(checked) =>
                          requestToggle(setting.channel, checked)
                        }
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {channelMeta?.description ??
                    `Configure ${setting.channel} notifications.`}
                </CardDescription>
                <p className="text-muted-foreground mt-2 text-xs">
                  Provider:{' '}
                  <span className="font-medium">{setting.providerKey}</span>
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-card border-dashed">
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-sm">
            <strong>Note:</strong> These toggles control platform-wide channel
            defaults. Disabling a channel stops all automated alerts (bill
            generated, payment confirmed, reminders) for that channel across all
            associations. In-app bell alerts are always delivered regardless of
            these settings.
          </p>
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <Dialog
        open={!!pendingToggle}
        onOpenChange={(open) => {
          if (!open) cancelToggle();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action === 'enable' ? 'Enable' : 'Disable'} {channelLabel}{' '}
              Notifications?
            </DialogTitle>
            <DialogDescription className="pt-1">
              {action === 'enable' ? (
                <>
                  This will <strong>start sending {channelLabel} alerts</strong>{' '}
                  (bill generated, payment confirmed, reminders) to all owners
                  and tenants across every association. Make sure your{' '}
                  {channelLabel} provider is correctly configured before
                  enabling.
                </>
              ) : (
                <>
                  This will <strong>stop all {channelLabel} alerts</strong> for
                  every association immediately. Owners and tenants will no
                  longer receive automated {channelLabel} notifications until
                  this is re-enabled.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={cancelToggle}
              data-test="confirm-channel-cancel"
            >
              Cancel
            </Button>
            <Button
              variant={action === 'enable' ? 'default' : 'destructive'}
              onClick={confirmToggle}
              disabled={pending}
              data-test="confirm-channel-confirm"
            >
              {action === 'enable'
                ? `Enable ${channelLabel}`
                : `Disable ${channelLabel}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
