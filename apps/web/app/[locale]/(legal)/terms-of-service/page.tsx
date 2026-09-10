import { SitePageHeader } from '~/(marketing)/_components/site-page-header';

import { LegalContact } from '../_components/legal-contact';
import { LegalLastUpdated, LegalProse } from '../_components/legal-prose';

export const metadata = {
  title: 'Terms of Service – Ooruda',
  description:
    'The terms governing access to and use of the Ooruda community-management platform, payment interfaces and related services.',
};

export default function TermsOfServicePage() {
  return (
    <div>
      <SitePageHeader
        title={'Terms of Service'}
        subtitle={'The terms that govern your use of our platform'}
      />

      <LegalProse>
        <LegalLastUpdated date={'September 9, 2026'} />

        <h2>Introduction</h2>
        <p>
          These Terms of Service govern access to and use of the Ooruda website,
          mobile application, software platform, payment interfaces,
          community-management tools and related services. The Services are
          operated by <strong>HABBAA SOLUTIONS PRIVATE LIMITED</strong>, having
          its registered office at 209, Citadel Prism, PVS Kalakunj Road,
          Kodialbail, Mangalore 575003, Karnataka, India. By using the Services,
          you agree to these Terms, the{' '}
          <a href={'/privacy-policy'}>Privacy Policy</a> and the{' '}
          <a href={'/refund-policy'}>Refund &amp; Cancellation Policy</a>.
        </p>

        <h2>1. Ooruda Services</h2>
        <p>
          Ooruda is a technology-enabled community-management platform for
          residential communities, apartment associations, resident welfare
          associations, owners associations and similar entities. Services may
          include community administration, resident communication, maintenance
          billing and collection, digital payment facilitation, reconciliation,
          reporting and related services.
        </p>

        <h2>2. Users and Accounts</h2>
        <p>
          Services may be used by residents, owners, tenants, Association
          representatives, administrators, facility managers and other
          authorised users. Users must provide accurate information and protect
          their login credentials. Users are responsible for activity carried
          out through their accounts.
        </p>

        <h2>3. Association Agreement</h2>
        <p>
          Ooruda may enter into a separate agreement with each Association
          covering scope, fees, implementation, responsibilities and payment
          arrangements. The Association remains responsible for determining
          maintenance charges, penalties, interest, levies and other amounts
          payable by residents. If a written Association agreement conflicts
          with these Terms, that agreement prevails to the extent of the
          conflict.
        </p>

        <h2>4. Maintenance Collections</h2>
        <p>
          Ooruda may facilitate collection of maintenance and other
          Association-approved payments. The underlying amounts are determined
          by the relevant Association. Where an escrow or other regulated
          payment arrangement is used, payments may be processed by a payment
          gateway, held under the applicable escrow arrangement, identified and
          reconciled Association-wise, and settled to the Association designated
          bank account. Ooruda does not acquire beneficial ownership of
          Association maintenance funds merely by facilitating their collection.
        </p>

        <h2>5. Escrow and Segregation</h2>
        <p>
          Where escrow is used, collections will be accounted for and reconciled
          Association-wise. Funds collected for one Association will not
          ordinarily be used for another. The applicable escrow agreement
          governs authorised instructions, settlement, disputes and charges.
          Ooruda will not use Association maintenance collections for its
          operating expenses except for deductions expressly permitted by
          applicable agreements.
        </p>

        <h2>6. SaaS, Platform and One-Time Fees</h2>
        <p>
          Ooruda may charge SaaS subscriptions, onboarding, implementation,
          configuration, customisation, professional services, support and
          one-time fees. Such fees are governed by the applicable agreement,
          quotation, order form or invoice. Unless agreed otherwise, these fees
          are separate from resident maintenance collections and are not
          required to pass through escrow. They may be paid directly to Ooruda
          current account or through an applicable payment gateway.
        </p>

        <h2>7. Payment Processing</h2>
        <p>
          Payments may be processed by third-party payment gateways, banks,
          escrow providers and other financial service providers. Ooruda does
          not ordinarily store complete card numbers, CVV numbers, UPI PINs or
          equivalent authentication credentials. A payment is treated as
          successfully received when confirmed by the applicable payment
          infrastructure.
        </p>

        <h2>8. Receipts and Records</h2>
        <p>
          Ooruda may provide confirmations, receipts, transaction histories,
          statements and reconciliation reports. Users should retain
          confirmations and promptly report discrepancies. Records may be
          subject to reconciliation with gateway, bank, escrow or Association
          records.
        </p>

        <h2>9. Refunds and Disputes</h2>
        <p>
          Maintenance refunds are generally subject to the relevant Association
          and payment provider. Ooruda may facilitate an approved refund.
          Chargebacks, failed transactions and disputes are handled under the
          applicable payment provider, escrow arrangement, Association agreement
          and <a href={'/refund-policy'}>Refund &amp; Cancellation Policy</a>.
        </p>

        <h2>10. Association Information</h2>
        <p>
          Association-specific information such as dues, penalties, notices,
          rules and balances may be supplied by the Association. Ooruda is not
          responsible for inaccuracies in information supplied by an
          Association. Disputes about the validity or calculation of an
          Association charge should be raised with that Association.
        </p>

        <h2>11. Intellectual Property</h2>
        <p>
          The Ooruda platform, software, architecture, interface, workflows,
          reports, content, designs, trademarks and related materials are owned
          by or licensed to Ooruda. Except as expressly permitted, users may not
          reproduce, modify, distribute, reverse engineer, sell, lease or
          commercially exploit them.
        </p>

        <h2>12. Acceptable Use</h2>
        <p>You must not:</p>
        <ul>
          <li>Use the Services for unlawful purposes.</li>
          <li>Provide false or misleading information.</li>
          <li>
            Impersonate another person or access another user account without
            authorisation.
          </li>
          <li>Interfere with the security or operation of the Services.</li>
          <li>Upload malicious code or attempt to extract source code.</li>
          <li>
            Scrape or commercially exploit platform data without permission.
          </li>
          <li>Transmit spam or unlawful communications.</li>
        </ul>

        <h2>13. Third-Party Services</h2>
        <p>
          Services may integrate with payment gateways, banks, escrow providers,
          cloud infrastructure, communication providers and other third parties.
          Ooruda is not responsible for their independent operation,
          availability, policies or actions.
        </p>

        <h2>14. Availability</h2>
        <p>
          Ooruda will make reasonable efforts to maintain availability, but
          uninterrupted or error-free operation cannot be guaranteed. Temporary
          unavailability may result from maintenance, upgrades, technical
          issues, third-party outages, telecommunications failures, security
          incidents or force majeure.
        </p>

        <h2>15. Suspension and Termination</h2>
        <p>
          Ooruda may suspend or restrict access where reasonably necessary for
          security, fraud investigation, legal or regulatory compliance,
          unauthorised access, material breach or protection of users,
          Associations or Ooruda.
        </p>

        <h2>16. Disclaimer</h2>
        <p>
          Services are provided on an as-is and as-available basis to the
          maximum extent permitted by law. Ooruda does not guarantee
          uninterrupted, completely secure or error-free operation and does not
          guarantee information supplied by Associations or third parties.
        </p>

        <h2>17. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, Ooruda is not liable for
          indirect, incidental, special, consequential or punitive losses, loss
          of profits, business or opportunity, or losses arising from
          third-party services. To the extent legally permissible, aggregate
          liability is limited to fees actually paid to Ooruda for the relevant
          Services during the twelve months preceding the event giving rise to
          the claim.
        </p>

        <h2>18. Indemnification</h2>
        <p>
          Users agree to indemnify Ooruda, its directors, employees, contractors
          and service providers against claims, losses, damages and expenses
          arising from breach of these Terms, misuse, fraudulent or unlawful
          activity, infringement of third-party rights, or information supplied
          by the user.
        </p>

        <h2>19. Changes</h2>
        <p>
          Ooruda may modify Services and update these Terms to reflect changes
          in Services, technology, business practices or law. Revised Terms will
          be posted with an updated effective date. Continued use after that
          date constitutes acceptance, subject to law.
        </p>

        <h2>20. Governing Law</h2>
        <p>
          These Terms are governed by the laws of India. Subject to applicable
          law and any dispute-resolution mechanism in an Association agreement,
          courts having jurisdiction over Mangalore, Karnataka shall have
          jurisdiction.
        </p>

        <h2>21. Contact</h2>
        <LegalContact />
      </LegalProse>
    </div>
  );
}
