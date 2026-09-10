import { Trans } from '@kit/ui/trans';

import { MobileSiteNavigation } from './mobile-site-navigation';
import { SiteNavigationItem } from './site-navigation-item';

/**
 * Ooruda has no public marketing site — there is nothing to navigate to from
 * the header. The only public pages are the legal documents and the contact
 * form, which the footer covers. Sign-in stays available on mobile, where the
 * header's own sign-in button is hidden.
 */
const links = {
  SignIn: {
    label: 'auth.signIn',
    path: '/auth/sign-in',
    showOn: 'mobile',
  },
};

export function SiteNavigation() {
  const NavItems = Object.values(links)
    .map((item) => {
      if ('showOn' in item && item.showOn === 'mobile') return null;

      return (
        <SiteNavigationItem key={item.path} path={item.path}>
          <Trans i18nKey={item.label} />
        </SiteNavigationItem>
      );
    })
    .filter(Boolean);

  return (
    <>
      <div className={'hidden items-center justify-center md:flex'}>
        {NavItems}
      </div>

      <div className={'flex justify-start sm:items-center md:hidden'}>
        <MobileSiteNavigation links={Object.values(links)} />
      </div>
    </>
  );
}
