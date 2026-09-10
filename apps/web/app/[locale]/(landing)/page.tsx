import Link from 'next/link';

import { OorudaMark } from '~/components/ooruda-mark';

import { EarlyAccessForm } from './_components/early-access-form';

const LEGAL_LINKS = [
  { href: '/terms-of-service', label: 'Terms of Service' },
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/refund-policy', label: 'Refund & Cancellation' },
];

const BUILDING_IMAGE =
  'https://images.unsplash.com/photo-1554435493-93422e8220c8?auto=format&fit=crop&w=1400&q=80';

export const metadata = {
  title: 'Ooruda — Private Beta',
  description:
    'Future of Property Management, Simplified. Ooruda is stepping in to digitize, streamline and automate your entire property ecosystem.',
};

export default function LandingPage() {
  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: '"DM Sans", sans-serif',
        backgroundColor: '#ffffff',
      }}
    >
      {/* ── Header ── */}
      <header
        className="flex items-center justify-between px-8 py-5 sm:px-14"
        style={{ backgroundColor: '#ffffff' }}
      >
        {/* Status badge, not a link — the underline it carried read as one. */}
        <span className="rounded-full bg-[#1d1e20]/5 px-3 py-1 text-[12px] font-medium tracking-wide text-[#1d1e20]">
          Private Beta
        </span>

        <div className="flex flex-col items-center gap-1">
          <OorudaMark size={34} className="text-[#FCD469]" />
          <span className="text-[22px] font-bold tracking-tight text-[#1d1e20] lowercase">
            ooruda
          </span>
        </div>

        <Link
          href="/access"
          className="rounded-lg border border-[#FCD469] bg-[#FCD469]/30 px-4 py-1.5 text-[12px] font-medium text-[#1d1e20] transition-colors hover:bg-[#FCD469]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1e20]"
        >
          Sign in
        </Link>
      </header>

      {/* ── Hero ── */}
      {/*
        Building image sits absolutely within this section, mirroring the original.
        Content overlaps from the left; the building fades to white on all sides.
      */}
      {/*
        Two columns, mirroring the section below: copy left, photo card right.
        The photo used to be an absolutely-positioned, gradient-masked
        background, which is why it had hard edges, a muddy fade and no
        relationship to the rounded card further down. As a real flex child it
        also stacks under the copy on mobile, so the building is finally
        visible on a phone instead of hidden.
      */}
      <section
        className="px-8 pt-8 pb-12 sm:px-14 sm:pt-10 sm:pb-16"
        style={{ backgroundColor: '#ffffff' }}
      >
        {/*
          Grid on desktop, plain block flow on mobile. This lets the photo sit
          between the copy and the CTA on a phone — so the button is the last
          thing in the hero and reads as the section's endpoint — while still
          occupying the full right-hand column on desktop. Ordering this with
          flex would have meant duplicating either the image or the button.
        */}
        <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-2 lg:items-center lg:gap-x-16">
          <h1
            className="text-[52px] leading-[1.15] text-[#1d1e20]"
            style={{ fontWeight: 400 }}
          >
            <strong style={{ fontWeight: 700 }}>Future</strong> of Property
            Management, <strong style={{ fontWeight: 700 }}>Simplified.</strong>
          </h1>

          <p className="mt-6 max-w-2xl text-[16px] leading-[1.7] text-[#1d1e20]">
            Managing properties shouldn&apos;t feel like a full-time chore.
            Whether you are overseeing a bustling commercial complex or tracking
            utility bills across multiple units, <strong>Ooruda</strong> is
            stepping in to digitize, streamline, and automate your entire
            property ecosystem.
          </p>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={BUILDING_IMAGE}
            alt="A commercial office building of the kind Ooruda associations manage"
            width={1400}
            height={1867}
            loading="eager"
            decoding="async"
            className="mt-8 w-full rounded-2xl object-cover shadow-xl lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:mt-0"
            style={{ aspectRatio: '4 / 3' }}
          />

          <a
            href="#waitlist"
            className="mt-8 inline-block justify-self-start rounded-lg px-6 py-3.5 text-[16px] font-medium text-black transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1e20] lg:mt-9"
            style={{ background: '#FCD469', borderRadius: '8px' }}
          >
            Request Access
          </a>
        </div>
      </section>

      {/* ── "Something Big" section ── */}
      <section
        className="border-t border-[#f0f0f0] px-8 py-12 sm:px-14 sm:py-16"
        style={{ backgroundColor: '#ffffff' }}
      >
        {/*
          Centred and capped. The text column was `flex-1` while its own copy
          was capped at max-w-xl, so on a wide screen the column kept growing
          and left a dead channel between the paragraph and the photo.
        */}
        <div className="mx-auto flex max-w-6xl flex-col gap-10 lg:flex-row lg:items-center lg:gap-14">
          {/* Text */}
          <div className="min-w-0 flex-1">
            <h2 className="text-[32px] leading-[1.2] font-bold text-[#FCD469]">
              Something Big is Built for Your Properties.
            </h2>
            <p className="mt-5 max-w-2xl text-[16px] leading-[1.7] text-[#4a4a4a]">
              Ooruda is live with a hyper-focus on Commercial Property
              Management, bringing associations smarter tools to handle the
              essentials without the headache. We are onboarding a limited
              number of associations at a time.
            </p>
          </div>

          {/* Dark property photo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.pexels.com/photos/27920274/pexels-photo-27920274.jpeg?auto=compress&cs=tinysrgb&w=800"
            alt="Property management essentials — house models, key, calculator"
            width={800}
            height={450}
            loading="lazy"
            decoding="async"
            className="w-full shrink-0 rounded-2xl object-cover shadow-xl lg:w-[480px]"
            style={{ aspectRatio: '16/9' }}
          />
        </div>
      </section>

      {/* ── Early access form ── */}
      <section
        id="waitlist"
        className="px-8 py-16 sm:px-14"
        style={{ backgroundColor: '#ffffff' }}
      >
        <div className="mx-auto max-w-xl text-center">
          <span className="text-[12px] font-semibold tracking-[0.15em] text-[#FCD469] uppercase">
            Early Access
          </span>
          <h3 className="mt-3 text-[24px] leading-[1.25] font-bold text-[#1d1e20]">
            Secure your spot
          </h3>
          <p className="mt-4 text-[16px] leading-[1.7] text-[#4a4a4a]">
            Request an invitation to the private beta. We will get in touch to
            set your association up, and founding members keep preferential
            pricing at launch.
          </p>
        </div>
        <div className="mx-auto mt-10 max-w-xl">
          <EarlyAccessForm />
          <p className="mt-6 text-center text-[14px] text-[#1d1e20]/60">
            OR drop us a line at:{' '}
            <a
              href="mailto:hello@ooruda.com"
              className="font-medium text-[#1d1e20] underline underline-offset-2"
            >
              hello@ooruda.com
            </a>
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="border-t border-[#eee] px-8 py-12 sm:px-14"
        style={{ backgroundColor: '#ffffff' }}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <div className="mx-auto mb-1 h-px w-12 bg-[#FCD469]" />
            <span className="text-[22px] font-bold text-[#1d1e20]">Ooruda</span>
            <p className="text-[14px] font-medium text-[#1d1e20]">
              <strong>Future</strong> of Property Management,{' '}
              <strong>Simplified</strong>
            </p>

            <span className="mt-1 text-[11px] font-semibold tracking-[0.2em] text-[#FCD469] uppercase">
              Ooruda Private Beta
            </span>
          </div>

          {/*
            These three links are the only public route to the policies:
            proxy.ts gates /(auth|home)/* behind the access cookie, so the
            copies rendered on the auth screens are unreachable to a visitor
            who has no PIN — including a payment-gateway reviewer.
          */}
          <nav
            aria-label="Legal"
            className="flex flex-wrap justify-center gap-x-5 gap-y-2"
          >
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded text-[12px] text-[#1d1e20]/70 transition-colors hover:text-[#1d1e20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1e20]"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="h-px w-full bg-[#eee]" />

          {/* The operating entity: "Ooruda" is the product, not the company. */}
          <address className="text-[12px] leading-relaxed text-[#1d1e20]/70 not-italic">
            Habbaa Solutions Private Limited
            <br />
            209, Citadel Prism, PVS Kalakunj Road, Kodialbail, Mangalore 575003,
            Karnataka, India
            <br />
            CIN: U47711KA2025PTC207750 &middot; GSTIN: 29AAICH1682G1ZD
          </address>

          <span className="text-[12px] text-[#1d1e20]/70">
            &copy; {new Date().getFullYear()} Ooruda. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
