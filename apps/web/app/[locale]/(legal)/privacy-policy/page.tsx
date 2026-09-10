import { SitePageHeader } from '~/(marketing)/_components/site-page-header';

import { LegalContact } from '../_components/legal-contact';
import { LegalLastUpdated, LegalProse } from '../_components/legal-prose';

export const metadata = {
  title: 'Privacy Policy – Ooruda',
  description:
    'How Ooruda collects, uses, shares and protects personal information across its community-management platform.',
};

export default function PrivacyPolicyPage() {
  return (
    <div>
      <SitePageHeader
        title={'Privacy Policy'}
        subtitle={'How we collect, use, and protect your information'}
      />

      <LegalProse>
        <LegalLastUpdated date={'September 9, 2026'} />

        <h2>1. Information We Collect</h2>
        <p>
          Depending on use of the Services, Ooruda may collect name, mobile
          number, email, residential address, apartment or unit details,
          ownership or occupancy information, Association details, maintenance
          account information, dues and payment status, notices, transaction
          amount, transaction date and time, payment status, transaction or
          reference number, payment method, refund information, settlement and
          reconciliation information, device and usage information, and support
          communications. Complete card numbers, CVV numbers, UPI PINs and
          similar authentication credentials are generally processed by the
          relevant payment provider and are not ordinarily stored by Ooruda.
        </p>

        <h2>2. Sources</h2>
        <p>
          Information may be collected directly from you, from your Association
          or authorised representatives, automatically through use of the
          Services, from payment gateways and banking partners, service
          providers and other parties where permitted by law.
        </p>

        <h2>3. How We Use Information</h2>
        <p>
          We may use personal information to operate Services; manage accounts,
          residents and communities; generate maintenance dues; facilitate
          payments and escrow settlement; reconcile transactions; provide
          statements; send reminders and notices; provide support; process
          refunds and disputes; prevent fraud; maintain security; improve
          Services; comply with law; and enforce agreements and policies.
        </p>

        <h2>4. Association Access</h2>
        <p>
          Where Ooruda provides Services to an Association, relevant resident
          and transaction information may be available to the Association and
          authorised representatives for billing, account management,
          reconciliation, communication, accounting, dispute resolution,
          community administration and legal compliance.
        </p>

        <h2>5. Service Providers</h2>
        <p>
          Information may be shared where necessary with payment gateways, banks
          and escrow providers, cloud and hosting providers, email and SMS
          providers, analytics and technology providers, support providers,
          professional advisers and governmental or regulatory authorities where
          required or permitted by law.
        </p>

        <h2>6. Payment Information</h2>
        <p>
          Payments may be processed by third-party payment gateways, banks and
          financial service providers. Ooruda does not ordinarily receive or
          store complete card credentials, UPI PINs or equivalent authentication
          information.
        </p>

        <h2>7. Cookies</h2>
        <p>
          Ooruda may use cookies, local storage, analytics tools and similar
          technologies to operate Services, maintain sessions, remember
          preferences, understand usage, improve performance and maintain
          security. Users may manage cookies through browser or device settings.
        </p>

        <h2>8. Security</h2>
        <p>
          Ooruda uses reasonable technical, organisational and administrative
          safeguards designed to protect personal information against
          unauthorised access, alteration, disclosure, loss or misuse. No
          electronic system can be guaranteed completely secure.
        </p>

        <h2>9. Retention</h2>
        <p>
          Information is retained for as long as reasonably necessary to provide
          Services, maintain transaction and accounting records, comply with
          law, resolve disputes, enforce agreements and protect legal rights.
        </p>

        <h2>10. Rights and Choices</h2>
        <p>
          Subject to applicable law, users may have rights to access information
          about their personal data, request correction or deletion where
          applicable, withdraw consent where processing is based on consent,
          raise grievances and exercise other rights under applicable
          data-protection law. Identity verification may be required.
        </p>

        <h2>11. Withdrawal of Consent</h2>
        <p>
          Where processing is based on consent, consent may be withdrawn through
          the mechanism provided by Ooruda. Withdrawal does not affect lawful
          processing carried out before withdrawal. Information may continue to
          be retained where required or permitted by law.
        </p>

        <h2>12. Children Data</h2>
        <p>
          The Services are primarily intended for adult residents, owners,
          Association representatives and other authorised users. Ooruda does
          not knowingly seek children personal information where prohibited by
          law.
        </p>

        <h2>13. International Processing</h2>
        <p>
          Some technology or service providers may store or process information
          outside India. Ooruda will comply with applicable legal requirements
          for such transfers.
        </p>

        <h2>14. Data Breaches</h2>
        <p>
          Where required by law, Ooruda will take appropriate steps in response
          to personal-data breaches, including investigation, mitigation and
          notification to relevant persons or authorities.
        </p>

        <h2>15. Third-Party Websites</h2>
        <p>
          Ooruda is not responsible for the privacy, security or content of
          third-party websites linked from the Services. Users should review
          their policies before providing information.
        </p>

        <h2>16. Changes</h2>
        <p>
          This Privacy Policy may be updated to reflect changes in Services,
          technology, business practices or law. The revised Policy will be
          posted with an updated date.
        </p>

        <h2>17. Contact and Grievance</h2>
        <LegalContact />
      </LegalProse>
    </div>
  );
}
