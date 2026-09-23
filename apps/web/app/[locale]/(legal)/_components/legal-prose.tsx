import { cn } from '@kit/ui/utils';

/**
 * Typographic shell for legal documents.
 *
 * Note: this project does not install @tailwindcss/typography, so `prose`
 * classes are inert here - the element styling below is deliberate, not a
 * fallback. Semantic tokens only, per the project's UI conventions.
 */
export function LegalProse(props: React.PropsWithChildren) {
  return (
    <div className={'container mx-auto max-w-3xl px-4 py-12'}>
      <div
        className={cn(
          'text-muted-foreground max-w-none text-sm leading-relaxed',
          '[&_h2]:text-foreground [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold',
          '[&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold',
          '[&_p]:mb-4',
          '[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6',
          '[&_strong]:text-foreground [&_strong]:font-semibold',
          '[&_a]:text-brand-ink [&_a]:underline [&_a]:underline-offset-2',
          '[&_address]:mt-2 [&_address]:leading-7',
        )}
      >
        {props.children}
      </div>
    </div>
  );
}

/** "Last updated" stamp shown at the top of every legal document. */
export function LegalLastUpdated({ date }: { date: string }) {
  return (
    <p className={'text-muted-foreground text-sm'}>Last updated: {date}</p>
  );
}
