'use client';

import { useEffect, useRef, useState } from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { CircleAlert, Lock } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';

import type { SiteState } from '../_lib/types';
import { AddonsSection, type AddonRow } from './addons-section';
import { ContactsSection, type ContactRow } from './contacts-section';
import { PoliciesForm } from './policies-form';
import { RatesForm } from './rates-form';
import { SeasonalRates } from './seasonal-rates';

const TABS = ['rates', 'seasonal', 'addons', 'contacts', 'policies'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  rates: 'Rates & guests',
  seasonal: 'Seasonal rates',
  addons: 'Add-ons',
  contacts: 'Emergency contacts',
  policies: 'Policies',
};

export interface PropertySummary {
  id: string;
  name: string;
  otaBufferNights: number;
  whatsappNumber: string | null;
  legalName: string | null;
  gstin: string | null;
  retentionDays: number;
}

export function VillaSettingsClient(props: {
  account: string;
  accountId: string;
  canEdit: boolean;
  initialTab?: string;
  properties: { id: string; name: string }[];
  property: PropertySummary | null;
  site: SiteState;
  addons: AddonRow[];
  contacts: ContactRow[];
  managersCanCancel: boolean;
  preArrivalEmail: boolean;
  thankYouEmail: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>(
    TABS.includes(props.initialTab as Tab)
      ? (props.initialTab as Tab)
      : 'rates',
  );

  // On a phone the tab strip scrolls sideways: keep the active tab in view
  // (e.g. opening ?tab=policies directly). 'nearest' never scrolls the page.
  const tabStrip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tabStrip.current
      ?.querySelector(`[data-test="villa-settings-tab-${tab}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

  // Keep the tab (and property) in the URL so a refresh or a shared link
  // lands on it.
  function setQuery(key: string, value: string) {
    const query = new URLSearchParams(searchParams.toString());
    query.set(key, value);
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  }

  function changeTab(next: string) {
    setTab(next as Tab);
    setQuery('tab', next);
  }

  if (!props.property) {
    return (
      <Alert data-test={'villa-settings-no-property'}>
        <CircleAlert className="h-4 w-4" />
        <AlertTitle>No villa connected yet</AlertTitle>
        <AlertDescription>
          Settings become available once Ooruda support connects your villa to
          its booking site.
        </AlertDescription>
      </Alert>
    );
  }

  const ids = { accountId: props.accountId, propertyId: props.property.id };

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {!props.canEdit ? (
        <Alert data-test={'villa-settings-read-only'}>
          <Lock className="h-4 w-4" />
          <AlertTitle>View only</AlertTitle>
          <AlertDescription>
            Only the villa owner can change these settings.
          </AlertDescription>
        </Alert>
      ) : null}

      {props.properties.length > 1 ? (
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <span className="text-muted-foreground text-xs font-medium">
            Villa
          </span>
          <Select
            value={props.property.id}
            onValueChange={(id) => {
              if (id) setQuery('property', id);
            }}
          >
            <SelectTrigger
              className="w-full"
              data-test={'villa-settings-property'}
            >
              <SelectValue>
                {(id: string) =>
                  props.properties.find((p) => p.id === id)?.name ??
                  'Select a villa'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {props.properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={changeTab} className="w-full">
        <div
          ref={tabStrip}
          className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          <TabsList className="mb-4 w-max min-w-max">
            {TABS.map((value) => (
              <TabsTrigger
                key={value}
                value={value}
                data-test={`villa-settings-tab-${value}`}
              >
                {TAB_LABELS[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="rates" className="mt-0">
          <SiteGate site={props.site}>
            {props.site.status === 'ok' ? (
              <RatesForm
                {...ids}
                canEdit={props.canEdit}
                rates={props.site.rates}
              />
            ) : null}
          </SiteGate>
        </TabsContent>

        <TabsContent value="seasonal" className="mt-0">
          <SiteGate site={props.site}>
            {props.site.status === 'ok' ? (
              <SeasonalRates
                {...ids}
                canEdit={props.canEdit}
                rules={props.site.rules}
              />
            ) : null}
          </SiteGate>
        </TabsContent>

        <TabsContent value="addons" className="mt-0">
          <AddonsSection
            {...ids}
            canEdit={props.canEdit}
            addons={props.addons}
          />
        </TabsContent>

        <TabsContent value="contacts" className="mt-0">
          <ContactsSection
            {...ids}
            canEdit={props.canEdit}
            contacts={props.contacts}
          />
        </TabsContent>

        <TabsContent value="policies" className="mt-0">
          <PoliciesForm
            {...ids}
            canEdit={props.canEdit}
            managersCanCancel={props.managersCanCancel}
            preArrivalEmail={props.preArrivalEmail}
            thankYouEmail={props.thankYouEmail}
            otaBufferNights={props.property.otaBufferNights}
            whatsappNumber={props.property.whatsappNumber}
            legalName={props.property.legalName}
            gstin={props.property.gstin}
            retentionDays={props.property.retentionDays}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const SITE_MESSAGES: Record<Exclude<SiteState['status'], 'ok'>, string> = {
  not_configured:
    'This villa is not connected to its booking site yet, so rates cannot be shown. Ooruda support will connect it.',
  inactive:
    'This villa property is switched off, so its rates cannot be edited.',
  unreachable:
    'The booking site could not be reached. Rates are kept on the booking site, so they cannot be shown right now. Try again shortly.',
  error: 'The booking site returned an error. Please contact Ooruda support.',
};

function SiteGate(props: React.PropsWithChildren<{ site: SiteState }>) {
  if (props.site.status === 'ok') return <>{props.children}</>;

  return (
    <Alert variant="destructive" data-test={'villa-settings-site-unavailable'}>
      <CircleAlert className="h-4 w-4" />
      <AlertTitle>Booking site unavailable</AlertTitle>
      <AlertDescription>{SITE_MESSAGES[props.site.status]}</AlertDescription>
    </Alert>
  );
}
