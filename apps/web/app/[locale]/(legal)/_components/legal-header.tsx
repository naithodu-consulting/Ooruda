import { AppLogo } from '~/components/app-logo';

import { LegalBackButton } from './legal-back-button';

/**
 * Deliberately minimal: a way back, and the wordmark. No navigation, and no
 * sign-in button — readers reach these documents *from* the sign-in screen,
 * so offering to send them there is circular.
 *
 * The three-column grid keeps the wordmark optically centred regardless of
 * how wide the back control renders.
 */
export function LegalHeader() {
  return (
    <header className={'bg-background sticky top-0 z-10 border-b'}>
      <div
        className={
          'container mx-auto grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3'
        }
      >
        <div className={'justify-self-start'}>
          <LegalBackButton />
        </div>

        <AppLogo className={'w-[85px] md:w-[95px]'} href={'/'} />

        <div aria-hidden />
      </div>
    </header>
  );
}
