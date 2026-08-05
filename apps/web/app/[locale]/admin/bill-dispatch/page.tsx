import { redirect } from 'next/navigation';

import { AdminGuard } from '@kit/admin/components/admin-guard';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody, PageHeader } from '@kit/ui/page';

import { BillDispatchClient } from './_components/bill-dispatch-client';
import { fetchAssociationsForDispatch } from './_lib/dispatch-queries';

export const metadata = { title: 'Bill Dispatch' };

async function BillDispatchPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_BILL_DISPATCH !== 'true') {
    redirect('/admin');
  }

  const associations = await fetchAssociationsForDispatch();

  return (
    <>
      <PageHeader
        title="Bill Dispatch"
        description="Send generated bills and receipts to unit owners via email."
        // align with PageBody, which carries lg:px-4
        className="lg:px-4"
      >
        <AppBreadcrumbs
          values={{
            'bill-dispatch': 'Bill Dispatch',
          }}
        />
      </PageHeader>

      <PageBody>
        <BillDispatchClient associations={associations} />
      </PageBody>
    </>
  );
}

export default AdminGuard(BillDispatchPage);
