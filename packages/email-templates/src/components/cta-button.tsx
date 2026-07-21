import { Button } from 'react-email';

export function CtaButton(
  props: React.PropsWithChildren<{
    href: string;
  }>,
) {
  return (
    <Button
      href={props.href}
      style={{
        display: 'block',
        width: '100%',
        backgroundColor: '#FCD469',
        borderRadius: '8px',
        padding: '14px 24px',
        textAlign: 'center' as const,
        fontSize: '15px',
        fontWeight: '700',
        color: '#1d1e20',
        textDecoration: 'none',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {props.children}
    </Button>
  );
}
