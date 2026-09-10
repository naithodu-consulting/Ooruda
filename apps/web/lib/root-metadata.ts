import { Metadata } from 'next';
import { headers } from 'next/headers';

import appConfig from '~/config/app.config';

/**
 * @name generateRootMetadata
 * @description Generates the root metadata for the application
 */
export const generateRootMetadata = async (): Promise<Metadata> => {
  const headersStore = await headers();
  const csrfToken = headersStore.get('x-csrf-token') ?? '';

  return {
    title: appConfig.title,
    description: appConfig.description,
    metadataBase: new URL(appConfig.url),
    applicationName: appConfig.name,
    other: {
      'csrf-token': csrfToken,
    },
    openGraph: {
      url: appConfig.url,
      siteName: appConfig.name,
      title: appConfig.title,
      description: appConfig.description,
      images: ['/images/brand/og-image.png'],
    },
    twitter: {
      card: 'summary_large_image',
      title: appConfig.title,
      description: appConfig.description,
      images: ['/images/brand/og-image.png'],
      site: '@ooruda',
    },
    icons: {
      icon: [
        { url: '/images/favicon/favicon.ico', sizes: 'any' },
        {
          url: '/images/favicon/favicon-32x32.png',
          type: 'image/png',
          sizes: '32x32',
        },
        {
          url: '/images/favicon/favicon-16x16.png',
          type: 'image/png',
          sizes: '16x16',
        },
        { url: '/images/brand/ooruda-favicon.svg', type: 'image/svg+xml' },
      ],
      apple: '/images/favicon/apple-touch-icon.png',
      other: [{ rel: 'manifest', url: '/images/favicon/site.webmanifest' }],
    },
  };
};
