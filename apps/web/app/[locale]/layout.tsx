import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { hasLocale } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { PublicEnvScript } from 'next-runtime-env';

import { routing } from '@kit/i18n/routing';
import { Toaster } from '@kit/ui/sonner';
import { cn } from '@kit/ui/utils';

import { RootProviders } from '~/components/root-providers';
import appConfig from '~/config/app.config';
import { getFontsClassName } from '~/lib/fonts';
import { generateRootMetadata } from '~/lib/root-metadata';
import { getRootTheme } from '~/lib/root-theme';

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${appConfig.url}/#organization`,
      name: appConfig.name,
      url: appConfig.url,
      logo: {
        '@type': 'ImageObject',
        url: `${appConfig.url}/images/brand/og-image.png`,
      },
      sameAs: ['https://twitter.com/ooruda'],
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${appConfig.url}/#software`,
      name: appConfig.name,
      url: appConfig.url,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: appConfig.description,
      publisher: { '@id': `${appConfig.url}/#organization` },
    },
    {
      '@type': 'WebSite',
      '@id': `${appConfig.url}/#website`,
      url: appConfig.url,
      name: appConfig.name,
      publisher: { '@id': `${appConfig.url}/#organization` },
    },
  ],
};

export const generateMetadata = () => {
  return generateRootMetadata();
};

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const [theme, nonce, messages] = await Promise.all([
    getRootTheme(),
    getCspNonce(),
    getMessages({ locale }),
  ]);

  const className = getRootClassName(theme);

  return (
    <html lang={locale} className={className} suppressHydrationWarning>
      <head>
        <PublicEnvScript nonce={nonce} />
        <script
          id="schema-org"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
      </head>

      <body>
        <RootProviders
          theme={theme}
          locale={locale}
          nonce={nonce}
          messages={messages}
        >
          {children}

          <Toaster richColors={true} theme={theme} position="top-center" />
        </RootProviders>
      </body>
    </html>
  );
}

function getRootClassName(theme: string) {
  const fontsClassName = getFontsClassName(theme);

  return cn(
    'bg-background min-h-screen antialiased md:overscroll-y-none',
    fontsClassName,
  );
}

async function getCspNonce() {
  const headersStore = await headers();

  return headersStore.get('x-nonce') ?? undefined;
}
