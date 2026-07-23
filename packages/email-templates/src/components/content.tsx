import { Container } from 'react-email';

export function EmailContent({
  children,
  className,
}: React.PropsWithChildren<{
  className?: string;
  displayLogo?: boolean;
}>) {
  return (
    <Container
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '0 0 12px 12px',
        padding: '8px 40px 36px',
      }}
      className={className ?? ''}
    >
      {children}
    </Container>
  );
}
