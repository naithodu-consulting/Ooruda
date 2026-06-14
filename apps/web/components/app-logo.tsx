import Link from 'next/link';

import { cn } from '@kit/ui/utils';

export function LogoImage({
  className,
  textClassName,
  iconSize = 28,
}: {
  className?: string;
  textClassName?: string;
  iconSize?: number;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Upper tower */}
        <rect x="11" y="4" width="10" height="10" rx="1" className="fill-primary" />
        {/* Main building body */}
        <rect x="4" y="13" width="24" height="15" rx="1" className="fill-primary" />
        {/* Tower windows */}
        <rect x="13.5" y="6.5" width="2.5" height="2.5" rx="0.4" fill="white" opacity="0.8" />
        <rect x="17" y="6.5" width="2.5" height="2.5" rx="0.4" fill="white" opacity="0.8" />
        {/* Main windows row 1 */}
        <rect x="6.5" y="15.5" width="3.5" height="3" rx="0.4" fill="white" opacity="0.7" />
        <rect x="12" y="15.5" width="3.5" height="3" rx="0.4" fill="white" opacity="0.7" />
        <rect x="17.5" y="15.5" width="3.5" height="3" rx="0.4" fill="white" opacity="0.7" />
        <rect x="23" y="15.5" width="2.5" height="3" rx="0.4" fill="white" opacity="0.7" />
        {/* Door */}
        <rect x="13" y="22" width="6" height="6" rx="0.5" fill="white" opacity="0.5" />
      </svg>

      <span
        className={cn(
          'text-xl font-bold tracking-tight text-foreground',
          textClassName,
        )}
      >
        PropOps
      </span>
    </div>
  );
}

export function AppLogo({
  href,
  label,
  className,
  textClassName,
  iconSize,
}: {
  href?: string | null;
  className?: string;
  textClassName?: string;
  label?: string;
  iconSize?: number;
}) {
  if (href === null) {
    return (
      <LogoImage
        className={className}
        textClassName={textClassName}
        iconSize={iconSize}
      />
    );
  }

  return (
    <Link
      aria-label={label ?? 'PropOps Home'}
      href={href ?? '/'}
      prefetch={true}
      className="inline-flex"
    >
      <LogoImage
        className={className}
        textClassName={textClassName}
        iconSize={iconSize}
      />
    </Link>
  );
}
