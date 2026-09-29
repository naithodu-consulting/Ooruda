import { Input } from '@kit/ui/input';
import { cn } from '@kit/ui/utils';

/**
 * A rupee amount field with a ₹ prefix.
 *
 * Every prop (including `id`, `aria-invalid` and `aria-describedby` that
 * FormControl injects, and `ref`) lands on the real <input>, so the label and
 * the field error stay tied to it for screen readers. Use it as the direct
 * child of FormControl.
 */
export function RupeeInput({
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm"
      >
        ₹
      </span>
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        className={cn('pl-7', className)}
      />
    </div>
  );
}
