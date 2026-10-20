import { OorudaMark } from '~/components/ooruda-mark';

// Rendered on the auth screens in every environment. Production additionally
// carries these in the public landing-page footer: /auth sits behind the access
// gate there, so the auth copy alone would not be publicly reachable.
const LEGAL_LINKS = [
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/terms-of-service', label: 'Terms of Service' },
  { href: '/refund-policy', label: 'Refund Policy' },
];

function AuthLayout({ children }: React.PropsWithChildren) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: '#FCD469' }}
    >
      <div className="w-full max-w-[400px]">
        {/* Logo above card */}
        <div className="mb-6 flex flex-col items-center">
          <div
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-md"
            style={{ background: '#ffffff' }}
          >
            <OorudaMark size={36} className="text-foreground" />
          </div>

          <h1 className="text-foreground text-2xl leading-tight font-black tracking-tight lowercase">
            ooruda
          </h1>

          <p className="text-primary-foreground/75 mt-1 text-xs font-medium tracking-[0.15em] uppercase">
            Property Management
          </p>
        </div>

        {/* Form card */}
        <div
          className="overflow-hidden rounded-2xl shadow-2xl"
          style={{
            background: '#ffffff',
            border: '1.5px solid #C8A820',
            boxShadow:
              '0 8px 32px rgba(180,130,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          {/* Amber accent strip */}
          <div
            className="h-[5px] w-full"
            style={{
              background:
                'linear-gradient(90deg, #E8A800 0%, #FCD469 60%, #E8A800 100%)',
            }}
          />

          <div className="px-6 py-8 sm:px-10 sm:py-10">{children}</div>
        </div>

        <div className="mt-5 flex flex-col items-center gap-1">
          <p className="text-primary-foreground/75 text-center text-xs">
            &copy; {new Date().getFullYear()} Ooruda. All rights reserved.
          </p>

          <p className="text-primary-foreground/75 flex flex-wrap justify-center gap-x-1.5 gap-y-0.5 text-center text-xs">
            {LEGAL_LINKS.map((link, index) => (
              <span key={link.href}>
                {index > 0 ? <span aria-hidden>· </span> : null}
                <a
                  href={link.href}
                  className="hover:text-primary-foreground underline underline-offset-2 transition-colors"
                >
                  {link.label}
                </a>
              </span>
            ))}
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
