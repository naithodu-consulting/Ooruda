import { Container, Hr, Text } from 'react-email';

export function EmailFooter(_props: React.PropsWithChildren) {
  return (
    <Container style={{ padding: '24px 0 0' }}>
      <Hr style={{ borderColor: '#e5e5e0', margin: '0 0 16px' }} />
      <Text
        style={{
          margin: '0 0 4px',
          textAlign: 'center' as const,
          fontSize: '12px',
          color: '#9a9a8a',
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        © {new Date().getFullYear()} Ooruda · Property Management
      </Text>
      <Text
        style={{
          margin: '0 0 4px',
          textAlign: 'center' as const,
          fontSize: '11px',
          color: '#b5b5a5',
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        hello@ooruda.com
      </Text>
    </Container>
  );
}
