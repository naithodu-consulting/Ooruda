import {
  Body,
  Column,
  Head,
  Html,
  Preview,
  Row,
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

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatPeriod(period: string) {
  const [y, m] = period.split('-');
  if (!y || !m) return period;
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

function formatBillType(type: string) {
  return type
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function ColorScheme() {
  return (
    <>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <style>{`:root { color-scheme: light; supported-color-schemes: light; }`}</style>
    </>
  );
}

function DetailRow({
  label,
  value,
  last = false,
  emphasis = false,
}: {
  label: string;
  value: string;
  last?: boolean;
  emphasis?: boolean;
}) {
  const cell = {
    padding: '11px 0',
    borderBottom: last ? 'none' : '1px solid #ede9df',
    fontFamily: FONT,
    verticalAlign: 'middle' as const,
  };
  return (
    <Row>
      <Column
        style={{
          ...cell,
          width: '42%',
          fontSize: '13px',
          color: '#6b6b5e',
          textAlign: 'left' as const,
        }}
      >
        {label}
      </Column>
      <Column
        style={{
          ...cell,
          width: '58%',
          fontSize: emphasis ? '15px' : '13px',
          fontWeight: emphasis ? 600 : 400,
          color: emphasis ? '#1a1a1a' : '#2d2d2d',
          textAlign: 'left' as const,
        }}
      >
        {value}
      </Column>
    </Row>
  );
}

function DetailTable({ children }: { children: React.ReactNode }) {
  return (
    <Section style={{ margin: '20px 0', borderTop: '1px solid #ede9df' }}>
      {children}
    </Section>
  );
}

export interface BillReminderEmailProps {
  recipientName: string;
  unitNo: string;
  billNo: string;
  billType: string;
  period: string;
  outstandingAmount: number;
  dueDate: string;
  isOverdue: boolean;
  associationName: string;
  accountSlug: string;
}

function BillReminderEmail(props: BillReminderEmailProps) {
  const accentColor = props.isOverdue ? '#dc2626' : '#d97706';
  const amountLabel = props.isOverdue ? 'Overdue Amount' : 'Amount Due';
  const headingText = props.isOverdue
    ? `Overdue Bill – Action Required`
    : `Payment Reminder – ${formatBillType(props.billType)}`;

  const previewText = props.isOverdue
    ? `Your ${formatPeriod(props.period)} bill for Unit ${props.unitNo} is overdue. Pay now.`
    : `Reminder: Your ${formatPeriod(props.period)} bill for Unit ${props.unitNo} is due on ${props.dueDate}.`;

  return (
    <Html lang="en">
      <Head>
        <ColorScheme />
      </Head>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body style={{ margin: 0, padding: 0, backgroundColor: '#f8f5ee' }}>
          <BodyStyle />
          <EmailWrapper>
            <EmailHeader />
            <EmailContent>
              <EmailHeading>{headingText}</EmailHeading>

              <Text
                style={{
                  fontSize: '15px',
                  lineHeight: '24px',
                  color: '#4a4a4a',
                  margin: '0 0 16px',
                  fontFamily: FONT,
                }}
              >
                Dear {props.recipientName},
              </Text>

              <Text
                style={{
                  fontSize: '15px',
                  lineHeight: '24px',
                  color: '#4a4a4a',
                  margin: '0 0 24px',
                  fontFamily: FONT,
                }}
              >
                {props.isOverdue
                  ? `Your ${formatBillType(props.billType)} bill for ${formatPeriod(props.period)} (Unit ${props.unitNo}) is past its due date. Please clear the outstanding amount at your earliest convenience to avoid further action.`
                  : `This is a friendly reminder that your ${formatBillType(props.billType)} bill for ${formatPeriod(props.period)} (Unit ${props.unitNo}) is due on ${props.dueDate}. Please arrange payment before the due date.`}
              </Text>

              {/* Amount highlight box */}
              <Section
                style={{
                  backgroundColor: props.isOverdue ? '#fef2f2' : '#fffbeb',
                  border: `1px solid ${accentColor}`,
                  borderRadius: '8px',
                  padding: '20px 24px',
                  margin: '0 0 24px',
                  textAlign: 'center' as const,
                }}
              >
                <Text
                  style={{
                    fontSize: '13px',
                    color: accentColor,
                    fontWeight: 600,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.05em',
                    margin: '0 0 8px',
                    fontFamily: FONT,
                  }}
                >
                  {amountLabel}
                </Text>
                <Text
                  style={{
                    fontSize: '32px',
                    fontWeight: 700,
                    color: accentColor,
                    margin: 0,
                    fontFamily: FONT,
                  }}
                >
                  {formatCurrency(props.outstandingAmount)}
                </Text>
              </Section>

              <DetailTable>
                <DetailRow label="Bill Number" value={props.billNo} />
                <DetailRow label="Unit" value={props.unitNo} />
                <DetailRow
                  label="Bill Type"
                  value={formatBillType(props.billType)}
                />
                <DetailRow label="Period" value={formatPeriod(props.period)} />
                <DetailRow
                  label="Due Date"
                  value={props.dueDate}
                  emphasis={props.isOverdue}
                  last
                />
              </DetailTable>

              <Section
                style={{ textAlign: 'center' as const, margin: '24px 0' }}
              >
                <a
                  href={`${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ooruda.com'}/home/${props.accountSlug}/billing`}
                  style={{
                    display: 'inline-block',
                    backgroundColor: accentColor,
                    color: '#ffffff',
                    fontFamily: FONT,
                    fontSize: '15px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    borderRadius: '6px',
                    padding: '12px 28px',
                  }}
                >
                  {props.isOverdue ? 'Pay Now' : 'View & Pay Bill'}
                </a>
              </Section>

              <Text
                style={{
                  fontSize: '13px',
                  color: '#6b6b5e',
                  margin: '16px 0 0',
                  fontFamily: FONT,
                }}
              >
                If you have already made the payment, please ignore this
                message.
              </Text>
            </EmailContent>
            <EmailFooter>{props.associationName}</EmailFooter>
          </EmailWrapper>
        </Body>
      </Tailwind>
    </Html>
  );
}

export async function renderBillReminderEmail(props: BillReminderEmailProps) {
  const html = await render(<BillReminderEmail {...props} />);
  const typeLabel = formatBillType(props.billType);
  const periodLabel = formatPeriod(props.period);
  const subject = props.isOverdue
    ? `Action Required: Overdue ${typeLabel} Bill (${periodLabel}) – ${props.associationName}`
    : `Reminder: ${typeLabel} Bill Due ${props.dueDate} – ${props.associationName}`;
  return { html, subject };
}
