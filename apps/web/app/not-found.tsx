import { cookies } from 'next/headers';

import { getMessages, getTranslations } from 'next-intl/server';

import { routing } from '@kit/i18n';
import { I18nClientProvider } from '@kit/i18n/provider';

import { ErrorPageContent } from '~/components/error-page-content';
import { getFontsClassName } from '~/lib/fonts';
import { getRootTheme } from '~/lib/root-theme';

export const generateMetadata = async () => {
  const t = await getTranslations('common');
  const title = t('notFound');

  return {
    title,
  };
};

const NotFoundPage = async () => {
  const theme = await getRootTheme();
  const cookieStore = await cookies();
  const locale = cookieStore.get('lang')?.value || routing.defaultLocale;
  const { common } = await getMessages({ locale });

  return (
    <html
      lang={locale}
      className={`bg-background min-h-screen antialiased ${getFontsClassName(theme)}`}
    >
      <body className="bg-background">
        <div className={'flex h-screen flex-1 flex-col'}>
          <I18nClientProvider locale={locale} messages={{ common }}>
            <ErrorPageContent
              statusCode={'common.pageNotFoundHeading'}
              heading={'common.pageNotFound'}
              subtitle={'common.pageNotFoundSubHeading'}
            />
          </I18nClientProvider>
        </div>
      </body>
    </html>
  );
};

export default NotFoundPage;
