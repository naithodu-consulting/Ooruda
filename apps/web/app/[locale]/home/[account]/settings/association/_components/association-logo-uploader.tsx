'use client';

import { useCallback } from 'react';

import type { SupabaseClient } from '@supabase/supabase-js';

import { useSupabase } from '@kit/supabase/hooks/use-supabase';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { ImageUploader } from '@kit/ui/image-uploader';
import { toast } from '@kit/ui/sonner';

const BUCKET = 'account_image';

/**
 * Association logo uploader.
 *
 * The association logo is the MakerKit team account image: stored in the
 * `account_image` bucket keyed by account id, with the URL persisted to
 * `accounts.picture_url`. This mirrors `UpdateTeamAccountImage` from
 * @kit/team-accounts (which isn't exported), reusing the same bucket + RLS so
 * no new storage migration is needed. The logo flows to the workspace switcher,
 * sidebar, and (Week 4) branded PDF bills.
 */
export function AssociationLogoUploader({
  account,
}: {
  account: { id: string; pictureUrl: string | null };
}) {
  const client = useSupabase();

  const onValueChange = useCallback(
    (file: File | null) => {
      const removeExisting = () =>
        account.pictureUrl
          ? (deleteLogo(client, account.pictureUrl) ?? Promise.resolve())
          : Promise.resolve();

      const promise = () =>
        removeExisting().then(() => {
          if (file) {
            return uploadLogo(client, file, account.id).then((pictureUrl) =>
              client
                .from('accounts')
                .update({ picture_url: pictureUrl })
                .eq('id', account.id)
                .throwOnError(),
            );
          }

          return client
            .from('accounts')
            .update({ picture_url: null })
            .eq('id', account.id)
            .throwOnError();
        });

      toast.promise(promise, {
        loading: 'Updating logo…',
        success: 'Logo updated.',
        error: 'Sorry, we could not update the logo.',
      });
    },
    [client, account.id, account.pictureUrl],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo</CardTitle>
        <CardDescription>
          Shown on member portals and (once enabled) on branded PDF bills.
          Square PNG or SVG works best.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ImageUploader value={account.pictureUrl} onValueChange={onValueChange}>
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium">Association logo</span>
            <span className="text-muted-foreground text-xs">
              Upload or replace your association&apos;s logo.
            </span>
          </div>
        </ImageUploader>
      </CardContent>
    </Card>
  );
}

function deleteLogo(client: SupabaseClient, url: string) {
  const fileName = url.split('/').pop()?.split('?')[0];
  if (!fileName) return;
  return client.storage.from(BUCKET).remove([fileName]);
}

async function uploadLogo(client: SupabaseClient, file: File, accountId: string) {
  const bytes = await file.arrayBuffer();
  const bucket = client.storage.from(BUCKET);

  const result = await bucket.upload(accountId, bytes, {
    contentType: file.type,
    upsert: true,
  });

  if (result.error) {
    throw result.error;
  }

  // cache-bust so the new image is fetched immediately after upsert
  const cacheBuster = crypto.randomUUID();
  const url = bucket.getPublicUrl(accountId).data.publicUrl;
  return `${url}?v=${cacheBuster}`;
}
