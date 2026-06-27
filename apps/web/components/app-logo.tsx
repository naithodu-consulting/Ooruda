import Link from 'next/link';

import { cn } from '@kit/ui/utils';

import { OorudaMark } from './ooruda-mark';

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
    <div className={cn('text-foreground flex items-center gap-2.5', className)}>
      <OorudaMark size={iconSize} />

      <span
        className={cn(
          'text-foreground text-xl font-black tracking-tight lowercase',
          textClassName,
        )}
      >
        ooruda
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
      aria-label={label ?? 'Ooruda Home'}
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
