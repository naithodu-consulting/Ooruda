import { Container } from 'react-email';

export function EmailWrapper(
  props: React.PropsWithChildren<{
    className?: string;
  }>,
) {
  return (
    <Container
      style={{
        backgroundColor: '#f5f5f0',
        margin: 'auto',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: '#1d1e20',
        width: '100%',
      }}
    >
      <Container
        style={{
          maxWidth: '600px',
          backgroundColor: '#f5f5f0',
          margin: 'auto',
          padding: '40px 20px',
        }}
        className={props.className ?? ''}
      >
        {props.children}
      </Container>
    </Container>
  );
}
