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

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

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

/**
 * The DB stores bill_type as lowercase_underscore ("other_charges"), so the
 * raw value must never reach a subject line or heading.
 */
function formatBillType(type: string) {
  return type
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
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

const bodyStyle = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#4a4a4a',
  margin: '0 0 16px',
  fontFamily: FONT,
};

/**
 * Tells Apple Mail, iOS Mail and Outlook not to auto-invert this email.
 * Gmail's Android app force-inverts regardless, so the palette is also chosen
 * to stay legible when inverted.
 */
function ColorScheme() {
  return (
    <>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <style>
        {`:root { color-scheme: light; supported-color-schemes: light; }`}
      </style>
    </>
  );
}

/**
 * One label/value line of the detail table.
 *
 * Must be Row + Column: react-email's Row renders a <tr>, so a <Text> (a <p>)
 * placed directly inside it is invalid HTML — mail clients hoist it out of the
 * table and stack the label and value on separate lines. Fixed column widths
 * keep values aligned across rows.
 */
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
          fontSize: '14px',
          fontWeight: 600,
          color: emphasis ? '#b45309' : '#1d1e20',
          textAlign: 'right' as const,
        }}
      >
        {value}
      </Column>
    </Row>
  );
}

function AmountBox({
  label,
  amount,
  tone,
}: {
  label: string;
  amount: number;
  tone: 'bill' | 'receipt';
}) {
  const isBill = tone === 'bill';

  return (
    <Section
      style={{
        backgroundColor: isBill ? '#FCD469' : '#d1fae5',
        borderRadius: '10px',
        padding: '18px 24px',
        textAlign: 'center' as const,
        margin: '0 0 24px',
      }}
    >
      <Text
        style={{
          margin: '0 0 6px',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.12em',
          color: isBill ? '#5a4a10' : '#065f46',
          textTransform: 'uppercase' as const,
          fontFamily: FONT,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          margin: '0',
          fontSize: '30px',
          lineHeight: '36px',
          fontWeight: 800,
          color: isBill ? '#1d1e20' : '#064e3b',
          fontFamily: FONT,
        }}
      >
        {formatCurrency(amount)}
      </Text>
    </Section>
  );
}

function DetailTable({ children }: React.PropsWithChildren) {
  return (
    <Section
      style={{
        backgroundColor: '#f9f7f2',
        borderRadius: '8px',
        padding: '2px 20px',
        margin: '0',
      }}
    >
      {children}
    </Section>
  );
}

function BillEmail(props: BillEmailProps) {
  const periodLabel = formatPeriod(props.period);
  const typeLabel = formatBillType(props.billType);
  const dueDateLabel = new Date(props.dueDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

  return (
    <Html>
      <Head>
        <ColorScheme />
        <BodyStyle />
      </Head>
      <Preview>
        {typeLabel} bill for {periodLabel} — {formatCurrency(props.totalAmount)}{' '}
        due {dueDateLabel}
      </Preview>
      <Tailwind>
        <Body>
          <EmailWrapper>
            <EmailHeader>
              <EmailHeading>Your {typeLabel} Bill</EmailHeading>
            </EmailHeader>

            <EmailContent>
              <Text style={bodyStyle}>Dear {props.ownerName},</Text>
              <Text style={bodyStyle}>
                Your {typeLabel.toLowerCase()} bill for{' '}
                <strong>{periodLabel}</strong> at {props.associationName} is
                ready. The full invoice is attached to this email as a PDF.
              </Text>

              <AmountBox
                label="Amount Due"
                amount={props.totalAmount}
                tone="bill"
              />

              <DetailTable>
                <DetailRow label="Bill Number" value={props.billNo} />
                <DetailRow label="Unit" value={props.unitNo} />
                <DetailRow label="Period" value={periodLabel} />
                <DetailRow
                  label="Due Date"
                  value={dueDateLabel}
                  emphasis
                  last
                />
              </DetailTable>
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
  const typeLabel = formatBillType(props.billType);

  return (
    <Html>
      <Head>
        <ColorScheme />
        <BodyStyle />
      </Head>
      <Preview>
        Payment of {formatCurrency(props.paidAmount)} received — {typeLabel}{' '}
        {periodLabel}
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
                Thank you — we have received your payment for the{' '}
                {typeLabel.toLowerCase()} bill for{' '}
                <strong>{periodLabel}</strong> at {props.associationName}. Your
                receipt is attached to this email as a PDF.
              </Text>

              <AmountBox
                label="Amount Paid"
                amount={props.paidAmount}
                tone="receipt"
              />

              <DetailTable>
                <DetailRow label="Bill Number" value={props.billNo} />
                <DetailRow label="Unit" value={props.unitNo} />
                <DetailRow label="Period" value={periodLabel} last />
              </DetailTable>
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
    subject: `Your ${formatBillType(props.billType)} Bill for ${formatPeriod(props.period)} – ${props.associationName}`,
  };
}

export async function renderReceiptDispatchEmail(props: ReceiptEmailProps) {
  const html = await render(<ReceiptEmail {...props} />);

  return {
    html,
    subject: `Payment Receipt – ${formatBillType(props.billType)} (${formatPeriod(props.period)}) – ${props.associationName}`,
  };
}
