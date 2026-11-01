'use client';

import { Fragment } from 'react';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

import { cn } from '../lib/utils';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '../shadcn/breadcrumb';
import { If } from './if';
import { Trans } from './trans';

const unslugify = (slug: string) => slug.replace(/-/g, ' ');

export function AppBreadcrumbs(props: {
  values?: Record<string, string>;
  maxDepth?: number;
}) {
  const pathName = usePathname();
  const { locale } = useParams();

  // Remove the locale from the path
  const splitPath = pathName
    .split('/')
    .filter(Boolean)
    .filter((path) => path !== locale);

  const values = props.values ?? {};
  const maxDepth = props.maxDepth ?? 6;

  const Ellipsis = (
    <BreadcrumbItem>
      <BreadcrumbEllipsis className="h-4 w-4" />
    </BreadcrumbItem>
  );

  const showEllipsis = splitPath.length > maxDepth;

  const visiblePaths = showEllipsis
    ? ([splitPath[0], ...splitPath.slice(-maxDepth + 1)] as string[])
    : splitPath;

  const hasMultiple = visiblePaths.length > 1;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {visiblePaths.map((path, index) => {
          const isLast = index === visiblePaths.length - 1;
          const isSecondToLast = index === visiblePaths.length - 2;

          const label =
            path in values ? (
              values[path]
            ) : (
              <Trans
                i18nKey={`common.routes.${unslugify(path)}`}
                defaults={unslugify(path)}
              />
            );

          return (
            <Fragment key={index}>
              <BreadcrumbItem
                className={cn(
                  'capitalize lg:text-xs',
                  hasMultiple && isLast && 'max-sm:hidden',
                )}
              >
                <If condition={!isLast} fallback={label}>
                  <BreadcrumbLink
                    render={
                      <Link
                        href={
                          '/' +
                          splitPath
                            .slice(0, splitPath.indexOf(path) + 1)
                            .join('/')
                        }
                      >
                        {label}
                      </Link>
                    }
                  />
                </If>
              </BreadcrumbItem>

              {index === 0 && showEllipsis && (
                <>
                  <BreadcrumbSeparator />
                  {Ellipsis}
                </>
              )}

              <If condition={!isLast}>
                <BreadcrumbSeparator
                  className={cn(
                    hasMultiple && isSecondToLast && 'max-sm:hidden',
                  )}
                />
              </If>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
