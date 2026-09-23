// Project-specific Alert variants. Apply via `className` so that
// `shadcn/alert.tsx` stays upstream-equivalent and CLI-replaceable, e.g.:
//   <Alert className={alertExtras.success}>...</Alert>

export const alertExtras = {
  info: 'border-info/20 text-info *:data-[slot=alert-description]:text-info *:[svg]:text-info',
  success:
    'border-success/20 text-success *:data-[slot=alert-description]:text-success *:[svg]:text-success',
  warning:
    'border-warning/30 text-warning *:data-[slot=alert-description]:text-warning *:[svg]:text-warning',
} as const;
