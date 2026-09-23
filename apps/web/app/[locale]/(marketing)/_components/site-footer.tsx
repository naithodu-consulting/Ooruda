import Link from 'next/link';

import { AppLogo } from '~/components/app-logo';

const LEGAL_LINKS = [
  { href: '/terms-of-service', label: 'Terms of Service' },
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/refund-policy', label: 'Refund & Cancellation Policy' },
];

/**
 * Minimal footer: the registered entity and the legal documents. Ooruda has no
 * public marketing site, so there are no About/Product sections to link - the
 * previous ones pointed at Makerkit demo content. Contact details are published
 * in full on each legal page.
 */
export function SiteFooter() {
  return (
    <footer className={'bg-background mt-auto border-t'}>
      <div
        className={
          'container mx-auto flex flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between'
        }
      >
        <div className={'flex flex-col gap-2'}>
          <AppLogo className={'w-[85px] md:w-[95px]'} />

          <p className={'text-muted-foreground text-xs'}>
            Habbaa Solutions Private Limited
          </p>

          <p className={'text-muted-foreground text-xs'}>
            &copy; {new Date().getFullYear()} Ooruda. All rights reserved.
          </p>
        </div>

        <nav
          aria-label={'Legal'}
          className={'flex flex-wrap gap-x-5 gap-y-2 sm:justify-end'}
        >
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                'text-muted-foreground hover:text-foreground text-xs transition-colors'
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
