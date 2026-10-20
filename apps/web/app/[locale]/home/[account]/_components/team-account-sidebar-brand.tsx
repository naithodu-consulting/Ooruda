import Link from 'next/link';

import { OorudaMark } from '~/components/ooruda-mark';

export function TeamAccountSidebarBrand({ account }: { account: string }) {
  return (
    <Link
      href={`/home/${account}`}
      aria-label={'Ooruda Home'}
      className="flex items-center gap-2.5 px-1 group-data-[collapsible=icon]:justify-center"
    >
      {/* Ooruda mark - black glyph on the warm pale-gold sidebar */}
      <OorudaMark size={32} className="text-foreground" />

      <div className="min-w-0 group-data-[collapsible=icon]:hidden">
        <div className="text-foreground text-base font-black tracking-tight lowercase">
          ooruda
        </div>
        <div className="text-sidebar-foreground text-xs font-medium tracking-[0.08em] uppercase">
          Property Management
        </div>
      </div>
    </Link>
  );
}
