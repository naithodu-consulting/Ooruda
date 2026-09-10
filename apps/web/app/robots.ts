import { MetadataRoute } from 'next';

import appConfig from '~/config/app.config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/home/', '/admin/', '/api/'],
    },
    sitemap: `${appConfig.url}/sitemap.xml`,
  };
}
