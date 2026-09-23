import { SiteFooter } from '~/(marketing)/_components/site-footer';

import { LegalHeader } from './_components/legal-header';

/**
 * Legal pages render no user-specific UI, so this layout does no auth work at
 * all - no Supabase call, no Suspense boundary, nothing to await. These are
 * the most cacheable pages on the site and now prerender completely.
 */
function LegalLayout(props: React.PropsWithChildren) {
  return (
    <div className={'flex min-h-screen flex-col'}>
      <LegalHeader />

      {props.children}

      <SiteFooter />
    </div>
  );
}

export default LegalLayout;
