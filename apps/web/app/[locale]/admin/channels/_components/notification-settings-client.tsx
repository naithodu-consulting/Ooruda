'use client';

import { useState, useTransition } from 'react';

import { Bell, Mail, MessageSquare } from 'lucide-react';

import { Alert, AlertDescription } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
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

export function NotificationSettingsClient({
  initialSettings,
}: {
  initialSettings: NotificationChannelStatus[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleToggle(channel: string, newValue: boolean) {
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

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {settings.map((setting) => {
          const meta = CHANNEL_META[setting.channel];
          return (
            <Card key={setting.channel} className="bg-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-muted-foreground flex items-center gap-2">
                    {meta?.icon ?? <Bell className="h-5 w-5" />}
                    <CardTitle className="text-base leading-none">
                      {meta?.label ?? setting.channel}
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
                          handleToggle(setting.channel, checked)
                        }
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {meta?.description ??
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
    </div>
  );
}
