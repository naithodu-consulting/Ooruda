import { MetadataRoute } from 'next';

import appConfig from '~/config/app.config';

export default function sitemap(): MetadataRoute.Sitemap {
  return transformSitemapEntries(getPaths());
}

type SitemapFrequency =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never';

type StaticPath = {
  path: string;
  priority: number;
  lastmod: string;
  changeFrequency: SitemapFrequency;
};

/**
 * Only the publicly reachable pages belong here: the landing page at `/` and
 * the legal documents. Everything else on this deployment sits behind the
 * access gate or the app's own auth.
 */
function getPaths() {
  const staticPaths: StaticPath[] = [
    {
      path: '/',
      priority: 1.0,
      lastmod: '2026-07-19',
      changeFrequency: 'weekly',
    },
    {
      path: '/terms-of-service',
      priority: 0.3,
      lastmod: '2026-09-09',
      changeFrequency: 'yearly',
    },
    {
      path: '/privacy-policy',
      priority: 0.3,
      lastmod: '2026-09-09',
      changeFrequency: 'yearly',
    },
    {
      path: '/refund-policy',
      priority: 0.3,
      lastmod: '2026-09-09',
      changeFrequency: 'yearly',
    },
  ];

  return staticPaths.map(({ path, priority, lastmod, changeFrequency }) => ({
    priority,
    loc: new URL(path, appConfig.url).href,
    lastmod,
    changeFrequency,
  }));
}

function transformSitemapEntries(
  entries: {
    loc: string;
    lastmod: string;
    priority: number;
    changeFrequency: SitemapFrequency;
  }[],
): MetadataRoute.Sitemap {
  return entries.map((entry) => ({
    url: entry.loc,
    lastModified: entry.lastmod,
    priority: entry.priority,
    changeFrequency: entry.changeFrequency,
  }));
}
