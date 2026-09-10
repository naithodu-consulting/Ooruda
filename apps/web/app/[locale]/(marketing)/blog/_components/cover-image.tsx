import Image from 'next/image';

import { cn } from '@kit/ui/utils';

type Props = {
  title: string;
  src: string;
  alt?: string;
  preloadImage?: boolean;
  className?: string;
};

export function CoverImage({
  title,
  src,
  alt,
  preloadImage,
  className,
}: Props) {
  return (
    <Image
      className={cn('block rounded-md object-cover', {
        className,
      })}
      src={src}
      priority={preloadImage}
      alt={alt ?? title}
      fill
    />
  );
}
