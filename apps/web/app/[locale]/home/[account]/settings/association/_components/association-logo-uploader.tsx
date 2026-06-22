'use client';

import { useCallback, useState } from 'react';

import { useRouter } from 'next/navigation';

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
import { cn } from '@kit/ui/utils';

const BUCKET = 'account_image';

/**
 * Association logo uploader — the single, canonical place to set the
 * association's image.
 *
 * The association logo is the MakerKit team account image: stored in the
 * `account_image` bucket keyed by account id, with the URL persisted to
 * `accounts.picture_url`. It reuses that bucket + RLS so no new storage
 * migration is needed. Deliberately the only uploader for this field — the
 * generic team-account settings page (`@kit/team-accounts`'s
 * `UpdateTeamAccountImage`) is not rendered anywhere in this app to avoid a
 * second control writing to the same column. The logo flows to the workspace
 * switcher, sidebar and branded PDF bills.
 */
export function AssociationLogoUploader({
  account,
}: {
  account: { id: string; pictureUrl: string | null };
}) {
  const client = useSupabase();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const onValueChange = useCallback(
    (file: File | null) => {
      setIsSaving(true);

      // Uploads always overwrite the same storage key (`account.id`) with
      // `upsert: true`, so there's no need to delete the old file first when
      // replacing — that would just be a third, redundant network round-trip
      // that widens the window where a quick tab-switch can outrun the save.
      // Deleting is only needed when clearing (no replacement file).
      const result = file
        ? uploadLogo(client, file, account.id).then((pictureUrl) =>
            persistPictureUrl(client, account.id, pictureUrl),
          )
        : Promise.resolve(
            account.pictureUrl
              ? deleteLogo(client, account.pictureUrl)
              : undefined,
          ).then(() => persistPictureUrl(client, account.id, null));

      // Computed once and shared between the toast and the revalidation below
      // — calling this twice would upload/delete the file twice.
      toast.promise(() => result, {
        loading: 'Updating logo…',
        success: 'Logo updated.',
        error: 'Sorry, we could not update the logo.',
      });

      // Revalidate server-rendered consumers of accounts.picture_url (sidebar
      // avatar, workspace switcher) immediately, rather than relying on the
      // next incidental refetch (e.g. a tab switch) to pick up the change.
      result
        .then(
          () => router.refresh(),
          () => {
            /* toast.promise already surfaced the error */
          },
        )
        .finally(() => setIsSaving(false));

      // Returned so ImageUploader can revert its optimistic preview if the
      // save rejects (network/permission error).
      return result;
    },
    [client, router, account.id, account.pictureUrl],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Association Logo</CardTitle>
        <CardDescription>
          Shown in the sidebar now, and on your bills and member portal once
          those are ready. A square PNG or SVG looks best.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ImageUploader value={account.pictureUrl} onValueChange={onValueChange}>
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium">Upload logo</span>
            <span
              className={cn('text-xs', {
                'text-muted-foreground': !isSaving,
                'text-foreground font-medium': isSaving,
              })}
            >
              {isSaving
                ? 'Saving your logo, please wait…'
                : "Upload or replace your association's logo."}
            </span>
          </div>
        </ImageUploader>
      </CardContent>
    </Card>
  );
}

/**
 * Persist the logo URL to `accounts.picture_url`, returning the updated row.
 *
 * `.select()` matters: a write filtered out by RLS affects 0 rows and returns
 * NO error, so `.throwOnError()` alone would report a false success. By asking
 * for the row back we can detect that case and surface a real error instead of
 * a misleading "Logo updated" toast that silently reverts on the next read.
 */
async function persistPictureUrl(
  client: SupabaseClient,
  accountId: string,
  pictureUrl: string | null,
) {
  const { data } = await client
    .from('accounts')
    .update({ picture_url: pictureUrl })
    .eq('id', accountId)
    .select('id')
    .throwOnError();

  if (!data || data.length === 0) {
    throw new Error(
      "You don't have permission to change this association's logo.",
    );
  }
}

function deleteLogo(client: SupabaseClient, url: string) {
  const fileName = url.split('/').pop()?.split('?')[0];
  if (!fileName) return;
  return client.storage.from(BUCKET).remove([fileName]);
}

async function uploadLogo(
  client: SupabaseClient,
  file: File,
  accountId: string,
) {
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
