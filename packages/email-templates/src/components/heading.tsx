import { Heading } from 'react-email';

export function EmailHeading(props: React.PropsWithChildren) {
  return (
    <Heading
      style={{
        margin: '0 0 8px',
        padding: '0',
        fontSize: '22px',
        fontWeight: '700',
        color: '#1d1e20',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {props.children}
    </Heading>
  );
}
