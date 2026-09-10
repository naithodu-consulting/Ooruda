import { SitePageHeader } from '~/(marketing)/_components/site-page-header';

import { LegalContact } from '../_components/legal-contact';
import { LegalLastUpdated, LegalProse } from '../_components/legal-prose';

export const metadata = {
  title: 'Refund & Cancellation Policy – Ooruda',
  description:
    'How refunds, reversals and cancellations are handled for Association maintenance collections and Ooruda platform fees.',
};

export default function RefundPolicyPage() {
  return (
    <div>
      <SitePageHeader
        title={'Refund & Cancellation Policy'}
        subtitle={'How refunds, reversals and cancellations are handled'}
      />

      <LegalProse>
        <LegalLastUpdated date={'September 9, 2026'} />

        <h2>1. Scope</h2>
        <p>
          This Policy covers refunds, reversals and cancellations for payments
          made through Ooruda. It distinguishes between Association maintenance
          collections and Ooruda own SaaS, platform, onboarding and other
          service fees.
        </p>

        <h2>2. Association Maintenance Payments</h2>
        <p>
          Maintenance and other community charges displayed through Ooruda are
          determined by the relevant Association. A payment does not become
          refundable merely because it was made through Ooruda. Refunds,
          reversals, waivers or adjustments are subject to the relevant
          Association and applicable payment provider.
        </p>

        <h2>3. Refund Requests</h2>
        <p>
          For duplicate payments, incorrect amounts, incorrect allocation, debit
          despite a failed transaction or another payment error, contact Ooruda.
          Transaction or reference details may be requested. Disputes about the
          validity or amount of an Association charge may be referred to the
          Association.
        </p>

        <h2>4. Duplicate or Erroneous Payments</h2>
        <p>
          Where verified, Ooruda will coordinate with the Association and/or
          payment provider for refund, reversal or account adjustment.
          Processing time may depend on the payment method, gateway, bank and
          Association approval.
        </p>

        <h2>5. Failed Transactions</h2>
        <p>
          If an account is debited but Ooruda does not show a successful
          payment, the transaction will be reconciled. If confirmed
          unsuccessful, the applicable payment provider will process reversal or
          refund under its procedures.
        </p>

        <h2>6. Disputed Transactions</h2>
        <p>
          Transactions subject to dispute, chargeback, fraud investigation or
          payment review may be withheld from settlement or handled under the
          applicable payment provider, bank, escrow arrangement and Association
          agreement. Ooruda may provide transaction and reconciliation records.
        </p>

        <h2>7. SaaS and Platform Fees</h2>
        <p>
          Ooruda fees for SaaS subscriptions, onboarding, implementation,
          configuration, customisation, professional services, support or
          one-time services are governed by the applicable agreement, quotation,
          order form or invoice. Unless expressly agreed otherwise, prepaid
          subscription fees are non-refundable once the period commences;
          onboarding, setup and implementation fees are non-refundable once work
          commences; completed professional or customisation services are
          non-refundable; and cancellation does not automatically create a
          refund for an unused portion of a commenced billing period.
        </p>

        <h2>8. Association-Specific Agreements</h2>
        <p>
          Specific refund or cancellation terms in an Association agreement with
          Ooruda prevail over this Policy to the extent of any conflict.
        </p>

        <h2>9. Refund Method</h2>
        <p>
          Approved refunds will ordinarily be processed through the original
          payment method or another method permitted by the payment provider.
          Ooruda cannot guarantee the exact time taken by banks, card networks,
          UPI systems or other providers to credit refunds.
        </p>

        <h2>10. Refund Processing Time</h2>
        <p>
          Once initiated, an approved refund will normally be processed within
          the timeline communicated at approval. Actual crediting time may vary
          by payment method and financial institution.
        </p>

        <h2>11. Non-Refundable Services</h2>
        <ul>
          <li>Completed onboarding or implementation services.</li>
          <li>Completed professional services.</li>
          <li>Customised development already performed.</li>
          <li>Subscription periods that have commenced.</li>
          <li>Services already consumed or utilised.</li>
          <li>Third-party charges that cannot be recovered.</li>
        </ul>

        <h2>12. Cancellation</h2>
        <p>
          An Association wishing to discontinue Ooruda Services should follow
          the termination procedure in its agreement. Closing an individual
          account does not cancel maintenance or other amounts legally payable
          to the Association. Outstanding Association dues remain payable.
        </p>

        <h2>13. Contact</h2>
        <LegalContact />
        <p>
          For disputes specifically concerning maintenance charges, residents
          may also contact their respective Association.
        </p>
      </LegalProse>
    </div>
  );
}
