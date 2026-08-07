import { redirect } from 'next/navigation';

import { AdminGuard } from '@kit/admin/components/admin-guard';

function AdminPage(): never {
  redirect('/admin/accounts');
}

export default AdminGuard(AdminPage);
