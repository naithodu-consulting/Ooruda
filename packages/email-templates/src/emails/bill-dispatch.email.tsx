import {
  Body,
  Head,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
  Tailwind,
  render,
} from 'react-email';

import { BodyStyle } from '../components/body-style';
import { EmailContent } from '../components/content';
import { EmailFooter } from '../components/footer';
import { EmailHeader } from '../components/header';
import { EmailHeading } from '../components/heading';
import { EmailWrapper } from '../components/wrapper';

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

interface BillEmailProps {
  ownerName: string;
  unitNo: string;
  billNo: string;
  billType: string;
  period: string;
  totalAmount: number;
  dueDate: string;
  associationName: string;
}

interface ReceiptEmailProps {
  ownerName: string;
  unitNo: string;
  billNo: string;
  billType: string;
  period: string;
  paidAmount: number;
  associationName: string;
}

const cellStyle = {
  fontSize: '13px',
  color: '#6b6b5e',
  padding: '7px 0',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const valueStyle = {
  fontSize: '13px',
  color: '#1d1e20',
  fontWeight: '600' as const,
  padding: '7px 0',
  textAlign: 'right' as const,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const bodyStyle = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#4a4a4a',
  margin: '0 0 24px',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

function BillEmail(props: BillEmailProps) {
  const periodLabel = formatPeriod(props.period);
  const dueDateLabel = new Date(props.dueDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Html>
      <Head>
        <BodyStyle />
      </Head>
      <Preview>
        Your {props.billType} bill for {periodLabel} – {props.associationName}
      </Preview>
      <Tailwind>
        <Body>
          <EmailWrapper>
            <EmailHeader>
              <EmailHeading>Your {props.billType} Bill</EmailHeading>
            </EmailHeader>

            <EmailContent>
              <Text style={bodyStyle}>Dear {props.ownerName},</Text>
              <Text style={bodyStyle}>
                Please find your <strong>{props.billType}</strong> bill for{' '}
                <strong>{periodLabel}</strong> attached to this email.
              </Text>

              {/* Amount highlight — amber OTP-style box */}
              <Section
                style={{
                  backgroundColor: '#FCD469',
                  borderRadius: '10px',
                  padding: '16px 24px',
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
                    fontFamily:
                      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}
                >
                  Amount Due
                </Text>
                <Text
                  style={{
                    margin: '0',
                    fontSize: '30px',
                    fontWeight: '800',
                    color: '#1d1e20',
                    fontFamily:
                      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}
                >
                  {formatCurrency(props.totalAmount)}
                </Text>
              </Section>

              {/* Details table */}
              <Section
                style={{
                  backgroundColor: '#f9f7f2',
                  borderRadius: '8px',
                  padding: '4px 20px',
                  margin: '0 0 20px',
                }}
              >
                <Row>
                  <Text style={cellStyle}>Bill Number</Text>
                  <Text style={valueStyle}>{props.billNo}</Text>
                </Row>
                <Hr style={{ borderColor: '#ede9df', margin: '0' }} />
                <Row>
                  <Text style={cellStyle}>Unit</Text>
                  <Text style={valueStyle}>{props.unitNo}</Text>
                </Row>
                <Hr style={{ borderColor: '#ede9df', margin: '0' }} />
                <Row>
                  <Text style={cellStyle}>Period</Text>
                  <Text style={valueStyle}>{periodLabel}</Text>
                </Row>
                <Hr style={{ borderColor: '#ede9df', margin: '0' }} />
                <Row>
                  <Text style={cellStyle}>Due Date</Text>
                  <Text style={{ ...valueStyle, color: '#b45309' }}>
                    {dueDateLabel}
                  </Text>
                </Row>
              </Section>
            </EmailContent>

            <EmailFooter>{props.associationName}</EmailFooter>
          </EmailWrapper>
        </Body>
      </Tailwind>
    </Html>
  );
}

function ReceiptEmail(props: ReceiptEmailProps) {
  const periodLabel = formatPeriod(props.period);

  return (
    <Html>
      <Head>
        <BodyStyle />
      </Head>
      <Preview>
        Payment Receipt – {props.billType} ({periodLabel}) –{' '}
        {props.associationName}
      </Preview>
      <Tailwind>
        <Body>
          <EmailWrapper>
            <EmailHeader>
              <EmailHeading>Payment Receipt</EmailHeading>
            </EmailHeader>

            <EmailContent>
              <Text style={bodyStyle}>Dear {props.ownerName},</Text>
              <Text style={bodyStyle}>
                Thank you for your payment. Your receipt for the{' '}
                <strong>{props.billType}</strong> bill ({periodLabel}) is
                attached.
              </Text>

              {/* Amount highlight — green tint for receipt */}
              <Section
                style={{
                  backgroundColor: '#d1fae5',
                  borderRadius: '10px',
                  padding: '16px 24px',
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
                    color: '#065f46',
                    textTransform: 'uppercase' as const,
                    fontFamily:
                      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}
                >
                  Amount Paid
                </Text>
                <Text
                  style={{
                    margin: '0',
                    fontSize: '30px',
                    fontWeight: '800',
                    color: '#064e3b',
                    fontFamily:
                      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}
                >
                  {formatCurrency(props.paidAmount)}
                </Text>
              </Section>

              {/* Details table */}
              <Section
                style={{
                  backgroundColor: '#f9f7f2',
                  borderRadius: '8px',
                  padding: '4px 20px',
                  margin: '0 0 20px',
                }}
              >
                <Row>
                  <Text style={cellStyle}>Bill Number</Text>
                  <Text style={valueStyle}>{props.billNo}</Text>
                </Row>
                <Hr style={{ borderColor: '#ede9df', margin: '0' }} />
                <Row>
                  <Text style={cellStyle}>Unit</Text>
                  <Text style={valueStyle}>{props.unitNo}</Text>
                </Row>
                <Hr style={{ borderColor: '#ede9df', margin: '0' }} />
                <Row>
                  <Text style={cellStyle}>Period</Text>
                  <Text style={valueStyle}>{periodLabel}</Text>
                </Row>
              </Section>

              <Text
                style={{
                  fontSize: '13px',
                  color: '#9a9a8a',
                  margin: '0',
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                }}
              >
                Thank you for your prompt payment.
              </Text>
            </EmailContent>

            <EmailFooter>{props.associationName}</EmailFooter>
          </EmailWrapper>
        </Body>
      </Tailwind>
    </Html>
  );
}

export async function renderBillDispatchEmail(props: BillEmailProps) {
  const html = await render(<BillEmail {...props} />);
  return {
    html,
    subject: `Your ${props.billType} Bill for ${formatPeriod(props.period)} – ${props.associationName}`,
  };
}

export async function renderReceiptDispatchEmail(props: ReceiptEmailProps) {
  const html = await render(<ReceiptEmail {...props} />);
  return {
    html,
    subject: `Payment Receipt – ${props.billType} (${formatPeriod(props.period)}) – ${props.associationName}`,
  };
}
