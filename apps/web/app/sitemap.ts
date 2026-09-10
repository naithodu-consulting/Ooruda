import { MetadataRoute } from 'next';

import { createCmsClient } from '@kit/cms';

import appConfig from '~/config/app.config';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = getPaths();
  const contentItems = await getContentItems();

  return transformSitemapEntries([...paths, ...contentItems]);
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

function getPaths() {
  const staticPaths: StaticPath[] = [
    {
      path: '/',
      priority: 1.0,
      lastmod: '2026-08-01',
      changeFrequency: 'weekly',
    },
    {
      path: '/pricing',
      priority: 0.9,
      lastmod: '2026-08-01',
      changeFrequency: 'monthly',
    },
    {
      path: '/blog',
      priority: 0.8,
      lastmod: '2026-08-01',
      changeFrequency: 'daily',
    },
    {
      path: '/docs',
      priority: 0.8,
      lastmod: '2026-08-01',
      changeFrequency: 'weekly',
    },
    {
      path: '/changelog',
      priority: 0.7,
      lastmod: '2026-08-01',
      changeFrequency: 'weekly',
    },
    {
      path: '/faq',
      priority: 0.7,
      lastmod: '2026-08-01',
      changeFrequency: 'monthly',
    },
    {
      path: '/contact',
      priority: 0.6,
      lastmod: '2026-08-01',
      changeFrequency: 'monthly',
    },
    {
      path: '/cookie-policy',
      priority: 0.3,
      lastmod: '2026-03-01',
      changeFrequency: 'yearly',
    },
    {
      path: '/terms-of-service',
      priority: 0.3,
      lastmod: '2026-03-01',
      changeFrequency: 'yearly',
    },
    {
      path: '/privacy-policy',
      priority: 0.3,
      lastmod: '2026-03-01',
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

async function getContentItems() {
  const client = await createCmsClient();

  // do not paginate the content items
  const limit = Infinity;

  const posts = client
    .getContentItems({
      collection: 'posts',
      content: false,
      limit,
    })
    .then((response) => response.items)
    .then((posts) =>
      posts.map((post) => ({
        loc: new URL(`/blog/${post.slug}`, appConfig.url).href,
        lastmod: post.publishedAt
          ? new Date(post.publishedAt).toISOString()
          : new Date().toISOString(),
        priority: 0.8,
        changeFrequency: 'weekly' as const,
      })),
    );

  const docs = client
    .getContentItems({
      collection: 'documentation',
      content: false,
      limit,
    })
    .then((response) => response.items)
    .then((docs) =>
      docs.map((doc) => ({
        loc: new URL(`/docs/${doc.slug}`, appConfig.url).href,
        lastmod: doc.publishedAt
          ? new Date(doc.publishedAt).toISOString()
          : new Date().toISOString(),
        priority: 0.8,
        changeFrequency: 'weekly' as const,
      })),
    );

  const changelog = client
    .getContentItems({
      collection: 'changelog',
      content: false,
      limit,
    })
    .then((response) => response.items)
    .then((docs) =>
      docs.map((doc) => ({
        loc: new URL(`/changelog/${doc.slug}`, appConfig.url).href,
        lastmod: doc.publishedAt
          ? new Date(doc.publishedAt).toISOString()
          : new Date().toISOString(),
        priority: 0.5,
        changeFrequency: 'weekly' as const,
      })),
    );

  return Promise.all([posts, docs, changelog]).then((items) => items.flat());
}

function transformSitemapEntries(
  entries: {
    loc: string;
    lastmod: string;
    priority: number;
    changeFrequency:
      | 'always'
      | 'hourly'
      | 'daily'
      | 'weekly'
      | 'monthly'
      | 'yearly'
      | 'never';
  }[],
): MetadataRoute.Sitemap {
  return entries.map((entry) => {
    return {
      url: entry.loc,
      lastModified: entry.lastmod,
      priority: entry.priority,
      changeFrequency: entry.changeFrequency,
    };
  });
}
