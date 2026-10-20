// Project-specific Badge variants. Apply via `className` so that
// `shadcn/badge.tsx` stays upstream-equivalent and CLI-replaceable, e.g.:
//   <Badge className={badgeExtras.success}>OK</Badge>

export const badgeExtras = {
  info: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
  success: 'bg-success/10 text-success [&>svg]:text-success',
  warning: 'bg-transparent border-warning text-warning [&>svg]:text-warning',
  danger: 'bg-destructive/10 text-destructive [&>svg]:text-destructive',
  purple: 'bg-purple-600/10 text-purple-700 [&>svg]:text-purple-700',
  teal: 'bg-teal-600/10 text-teal-700 [&>svg]:text-teal-700',
} as const;
