/**
 * Registered-entity contact block. Identical across the Privacy Policy,
 * Terms of Service and Refund & Cancellation Policy, so it lives in one
 * place - these details are legally material and must not drift apart.
 */
export function LegalContact() {
  return (
    <address className={'not-italic'}>
      <strong>HABBAA SOLUTIONS PRIVATE LIMITED</strong>
      <br />
      209, Citadel Prism, PVS Kalakunj Road,
      <br />
      Kodialbail, Mangalore 575003,
      <br />
      Karnataka, India
      <br />
      <br />
      Phone:{' '}
      <a href={'tel:+917760777876'} className={'whitespace-nowrap'}>
        +91 77607 77876
      </a>
      <br />
      Email: <a href={'mailto:hello@ooruda.com'}>hello@ooruda.com</a>
      <br />
      <br />
      CIN: U47711KA2025PTC207750
      <br />
      GSTIN: 29AAICH1682G1ZD
    </address>
  );
}
