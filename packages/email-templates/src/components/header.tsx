import { Container, Section, Text } from 'react-email';

export function EmailHeader(props: React.PropsWithChildren) {
  return (
    <Container>
      {/* Amber top bar */}
      <Section
        style={{
          backgroundColor: '#FCD469',
          borderRadius: '12px 12px 0 0',
          padding: '20px 40px',
          textAlign: 'center' as const,
        }}
      >
        {/* Wordmark */}
        <Text
          style={{
            margin: '0',
            fontSize: '26px',
            fontWeight: '800',
            letterSpacing: '-0.5px',
            color: '#1d1e20',
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          }}
        >
          ooruda
        </Text>
        <Text
          style={{
            margin: '2px 0 0',
            fontSize: '10px',
            fontWeight: '600',
            letterSpacing: '0.15em',
            color: '#5a4a10',
            textTransform: 'uppercase' as const,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          }}
        >
          Property Management
        </Text>
      </Section>

      {/* Heading section inside white card top */}
      <Section
        style={{
          backgroundColor: '#ffffff',
          padding: '32px 40px 8px',
        }}
      >
        {props.children}
      </Section>
    </Container>
  );
}
