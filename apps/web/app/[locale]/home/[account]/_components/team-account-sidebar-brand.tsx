import Link from 'next/link';

import { Building2 } from 'lucide-react';

export function TeamAccountSidebarBrand() {
  return (
    <Link
      href={'/home'}
      aria-label={'PropTech Home'}
      className="flex items-center gap-2.5 px-1 group-data-[collapsible=icon]:justify-center"
    >
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] shadow-[0_4px_12px_rgba(245,158,11,0.35)]"
        style={{
          background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
        }}
      >
        <Building2
          className="h-[18px] w-[18px] text-[#0F172A]"
          strokeWidth={2.2}
        />
      </div>

      <div className="min-w-0 group-data-[collapsible=icon]:hidden">
        <div className="text-[15.5px] font-black tracking-tight text-white">
          PropTech
        </div>
        <div className="text-[9px] font-medium tracking-[0.1em] text-[#6B88A4] uppercase">
          Property Mgmt
        </div>
      </div>
    </Link>
  );
}
