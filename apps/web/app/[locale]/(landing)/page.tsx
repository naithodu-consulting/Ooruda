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

const SECONDARY_IMAGE =
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80';

export const metadata = {
  title: 'Ooruda — Private Beta',
  description:
    'Future of Property Management, Simplified. Ooruda is stepping in to digitize, streamline, and automate your entire property ecosystem.',
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-neutral-100 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <OorudaMark size={30} className="text-[#FCD469]" />
              <span className="text-xl font-bold tracking-tight text-neutral-950 lowercase">
                ooruda
              </span>
            </Link>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
              Private Beta
            </span>
          </div>

          <Link
            href="/access"
            className="inline-flex items-center justify-center rounded-lg border border-neutral-200 bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="px-6 pt-12 pb-16 sm:px-8 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24">
        <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-12 lg:items-center lg:gap-12 xl:gap-16">
          <div className="lg:col-span-7">
            <h1 className="text-4xl font-normal tracking-tight text-neutral-950 sm:text-5xl lg:text-[54px] lg:leading-[1.14]">
              <strong className="font-bold">Future</strong> of Property
              Management, <strong className="font-bold">Simplified.</strong>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
              Managing properties shouldn&apos;t feel like a full-time chore.
              Whether you are overseeing a bustling commercial complex or
              tracking utility bills across multiple units,{' '}
              <strong className="font-semibold text-neutral-900">Ooruda</strong>{' '}
              is stepping in to digitize, streamline, and automate your entire
              property ecosystem.
            </p>

            <div className="mt-8 flex items-center gap-4 sm:mt-10">
              <a
                href="#waitlist"
                className="inline-flex items-center justify-center rounded-lg bg-[#FCD469] px-6 py-3.5 text-sm font-semibold text-neutral-950 shadow-sm transition hover:bg-[#f5cf5e] hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
              >
                Request Access
              </a>
            </div>
          </div>

          <div className="mt-10 lg:col-span-5 lg:mt-0">
            <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-neutral-100 shadow-lg shadow-neutral-200/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={BUILDING_IMAGE}
                alt="A commercial office building of the kind Ooruda associations manage"
                width={1400}
                height={1867}
                loading="eager"
                decoding="async"
                className="aspect-[4/3] w-full object-cover lg:aspect-[4/4.2]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── "Something Big" section ── */}
      <section className="border-y border-[#f0eee6] bg-[#faf8f2]/80 px-6 py-16 sm:px-8 sm:py-20 lg:py-24">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12 xl:gap-16">
          {/* On desktop: Image on left (lg:order-1, col-span-5). On mobile: renders after text */}
          <div className="lg:order-1 lg:col-span-5">
            <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-neutral-100 shadow-lg shadow-neutral-200/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={SECONDARY_IMAGE}
                alt="Property management essentials — commercial building architecture"
                width={1200}
                height={800}
                loading="lazy"
                decoding="async"
                className="aspect-[16/10] w-full object-cover lg:aspect-[4/3.5]"
              />
            </div>
          </div>

          {/* On desktop: Text on right (lg:order-2, col-span-7). On mobile: renders first */}
          <div className="order-first lg:order-2 lg:col-span-7">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl lg:text-4xl">
              Something Big is Built for Your Properties.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
              Ooruda is live with a hyper-focus on Commercial Property
              Management, bringing associations smarter tools to handle the
              essentials without the headache. We are onboarding a limited
              number of associations at a time.
            </p>
          </div>
        </div>
      </section>

      {/* ── Early access form ── */}
      <section
        id="waitlist"
        className="border-t border-neutral-100 px-6 py-16 sm:px-8 sm:py-24"
      >
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold tracking-wider text-amber-700 uppercase">
            Early Access
          </span>
          <h3 className="mt-2 text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
            Secure your spot
          </h3>
          <p className="mt-4 text-base leading-relaxed text-neutral-600 sm:text-lg">
            Request an invitation to the private beta. We will get in touch to
            set your association up, and founding members keep preferential
            pricing at launch.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <EarlyAccessForm />
          <div className="mt-6 border-t border-neutral-100 pt-6 text-center text-xs text-neutral-500 sm:text-sm">
            OR drop us a line at:{' '}
            <a
              href="mailto:hello@ooruda.com"
              className="font-medium text-neutral-900 underline underline-offset-4 hover:text-neutral-700"
            >
              hello@ooruda.com
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-neutral-200/80 bg-neutral-50 px-6 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            {/* Brand & Tagline */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <OorudaMark size={28} className="text-[#FCD469]" />
                <span className="text-xl font-bold tracking-tight text-neutral-950">
                  Ooruda
                </span>
                <span className="rounded-full bg-neutral-200/70 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                  Private Beta
                </span>
              </div>
              <p className="text-sm text-neutral-600">
                <strong>Future</strong> of Property Management,{' '}
                <strong>Simplified</strong>
              </p>
            </div>

            {/* Legal Links */}
            <nav
              aria-label="Legal"
              className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-600"
            >
              {LEGAL_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="transition-colors hover:text-neutral-950"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="my-8 h-px w-full bg-neutral-200/70" />

          <div className="flex flex-col gap-4 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
            {/* Corporate entity */}
            <address className="leading-relaxed not-italic">
              Habbaa Solutions Private Limited &middot; 209, Citadel Prism, PVS
              Kalakunj Road, Kodialbail, Mangalore 575003, Karnataka, India
              <br />
              CIN: U47711KA2025PTC207750 &middot; GSTIN: 29AAICH1682G1ZD
            </address>

            <span className="shrink-0">
              &copy; {new Date().getFullYear()} Ooruda. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
