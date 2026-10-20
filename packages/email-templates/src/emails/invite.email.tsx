import {
  Body,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
  render,
} from 'react-email';

import { BodyStyle } from '../components/body-style';
import { EmailContent } from '../components/content';
import { CtaButton } from '../components/cta-button';
import { EmailFooter } from '../components/footer';
import { EmailHeader } from '../components/header';
import { EmailHeading } from '../components/heading';
import { EmailWrapper } from '../components/wrapper';
import { escapeHtml } from '../lib/escape-html';
import { initializeEmailI18n } from '../lib/i18n';

interface Props {
  teamName: string;
  teamLogo?: string;
  inviter: string | undefined;
  invitedUserEmail: string;
  link: string;
  productName: string;
  language?: string;
}

export async function renderInviteEmail(props: Props) {
  const namespace = 'invite-email';

  const { t } = await initializeEmailI18n({
    language: props.language,
    namespace,
  });

  const previewText = t('previewText', { teamName: props.teamName });
  const subject = t('subject', { teamName: props.teamName });

  const heading = t('heading', {
    teamName: props.teamName,
  });

  const hello = t('hello', {
    invitedUserEmail: props.invitedUserEmail,
  });

  const mainText = t('mainText', {
    inviter: escapeHtml(props.inviter ?? 'Someone'),
    teamName: escapeHtml(props.teamName),
    productName: escapeHtml(props.productName),
    strong: (chunks: string) => `<strong>${chunks}</strong>`,
  });

  const joinTeam = t('joinTeam', { teamName: props.teamName });

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
                  margin: '0 0 16px',
                }}
              >
                {hello}
              </Text>

              <Text
                style={{
                  fontSize: '15px',
                  lineHeight: '24px',
                  color: '#4a4a4a',
                  margin: '0 0 28px',
                }}
                dangerouslySetInnerHTML={{ __html: mainText }}
              />

              <Section style={{ margin: '0 0 24px' }}>
                <CtaButton href={props.link}>{joinTeam}</CtaButton>
              </Section>

              <Hr style={{ borderColor: '#e5e5e0', margin: '0 0 16px' }} />

              <Text
                style={{
                  fontSize: '13px',
                  lineHeight: '20px',
                  color: '#6b6b5e',
                  margin: '0 0 8px',
                }}
              >
                {t('copyPasteLink')}
              </Text>

              <Link
                href={props.link}
                style={{
                  fontSize: '13px',
                  color: '#5a4a10',
                  wordBreak: 'break-all' as const,
                }}
              >
                {props.link}
              </Link>

              <Text
                style={{
                  fontSize: '12px',
                  lineHeight: '18px',
                  color: '#6b6b5e',
                  margin: '16px 0 0',
                }}
              >
                {t('invitationIntendedFor', {
                  invitedUserEmail: props.invitedUserEmail,
                })}
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
