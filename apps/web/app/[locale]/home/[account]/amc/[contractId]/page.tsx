import { notFound, redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../../_components/team-account-layout-page-header';
import { createAmcService } from '../_lib/server/amc.service';
import { AmcDetailClient } from './_components/amc-detail-client';

interface Props {
  params: Promise<{ account: string; contractId: string }>;
}

export const metadata = { title: 'AMC Contract' };

export default async function AmcDetailPage({ params }: Props) {
  const { account, contractId } = await params;

  const { accountId } = await requireRole(account, ['assoc_admin']);

  const client = getSupabaseServerClient();

  const { data: assoc } = await client
    .from('associations')
    .select('id')
    .eq('account_id', accountId)
    .single();

  if (!assoc) redirect(`/home/${account}`);

  const service = createAmcService(client);

  let result: Awaited<ReturnType<typeof service.getContract>>;
  try {
    result = await service.getContract(contractId, assoc.id);
  } catch {
    notFound();
  }

  return (
    <>
      <TeamAccountLayoutPageHeader
        account={account}
        title={result.contract.name}
        description={`${result.contract.vendor_name} · ${result.contract.category}`}
      />
      <PageBody>
        <AmcDetailClient
          associationId={assoc.id}
          accountSlug={account}
          contract={result.contract}
          history={result.history}
        />
      </PageBody>
    </>
  );
}
