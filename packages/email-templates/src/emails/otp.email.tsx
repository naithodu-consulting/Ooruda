import {
  Body,
  Head,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
  render,
} from 'react-email';

import { BodyStyle } from '../components/body-style';
import { EmailContent } from '../components/content';
import { EmailFooter } from '../components/footer';
import { EmailHeader } from '../components/header';
import { EmailHeading } from '../components/heading';
import { EmailWrapper } from '../components/wrapper';
import { initializeEmailI18n } from '../lib/i18n';

interface Props {
  otp: string;
  productName: string;
  language?: string;
}

export async function renderOtpEmail(props: Props) {
  const namespace = 'otp-email';

  const { t } = await initializeEmailI18n({
    language: props.language,
    namespace,
  });

  const subject = t(`subject`);
  const previewText = t(`previewText`);
  const heading = t(`heading`);
  const mainText = t(`mainText`);
  const expiryText = t(`expiryText`);
  const footerText = t(`footerText`);

  const html = await render(
    <Html>
      <Head>
        <BodyStyle />
      </Head>

      <Preview>{previewText}</Preview>

      <Tailwind>
        <Body>
          <EmailWrapper>
            <EmailHeader>
              <EmailHeading>{heading}</EmailHeading>
            </EmailHeader>

            <EmailContent>
              <Text
                style={{
                  fontSize: '15px',
                  lineHeight: '24px',
                  color: '#4a4a4a',
                  margin: '0 0 24px',
                }}
              >
                {mainText}
              </Text>

              {/* OTP code box */}
              <Section
                style={{
                  backgroundColor: '#FCD469',
                  borderRadius: '10px',
                  padding: '20px',
                  textAlign: 'center' as const,
                  margin: '0 0 24px',
                }}
              >
                <Text
                  style={{
                    margin: '0 0 4px',
                    fontSize: '11px',
                    fontWeight: '600',
                    letterSpacing: '0.12em',
                    color: '#5a4a10',
                    textTransform: 'uppercase' as const,
                  }}
                >
                  Your sign-in code
                </Text>
                <Text
                  style={{
                    margin: '0',
                    fontSize: '36px',
                    fontWeight: '800',
                    letterSpacing: '0.25em',
                    color: '#1d1e20',
                    fontFamily: 'monospace',
                  }}
                >
                  {props.otp}
                </Text>
              </Section>

              <Text
                style={{
                  fontSize: '13px',
                  lineHeight: '20px',
                  color: '#9a9a8a',
                  margin: '0 0 8px',
                  textAlign: 'center' as const,
                }}
              >
                {expiryText}
              </Text>

              <Text
                style={{
                  fontSize: '13px',
                  lineHeight: '20px',
                  color: '#9a9a8a',
                  margin: '0',
                  textAlign: 'center' as const,
                }}
              >
                {footerText}
              </Text>
            </EmailContent>

            <EmailFooter>{props.productName}</EmailFooter>
          </EmailWrapper>
        </Body>
      </Tailwind>
    </Html>,
  );

  return {
    html,
    subject,
  };
}
