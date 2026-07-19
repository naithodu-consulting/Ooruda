import Link from 'next/link';

import { OorudaMark } from '~/components/ooruda-mark';

const BUILDING_IMAGE =
  'https://images.unsplash.com/photo-1498335746477-0c73d7353a07?auto=format&fit=crop&w=1200&q=80';

export const metadata = {
  title: 'Coming Soon — Ooruda',
  description:
    'Future of Property Management, Simplified. Ooruda is stepping in to digitize, streamline, and automate your entire property ecosystem.',
};

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ fontFamily: '"DM Sans", sans-serif', backgroundColor: '#ffffff' }}>

      {/* ── Header ── */}
      <header className="flex items-start justify-between px-8 py-6 sm:px-14" style={{ backgroundColor: '#ffffff' }}>
        <span className="border-b border-[#1d1e20] pb-0.5 text-[15px] text-[#1d1e20]">
          Coming Soon
        </span>

        <div className="flex flex-col items-center gap-1">
          <OorudaMark size={34} className="text-[#FCD469]" />
          <span className="text-[22px] font-bold tracking-tight text-[#1d1e20] lowercase">
            ooruda
          </span>
        </div>

        <Link
          href="/access"
          className="rounded-lg border border-[#FCD469] bg-[#FCD469]/30 px-4 py-1.5 text-[13px] font-medium text-[#1d1e20] transition-colors hover:bg-[#FCD469]/50"
        >
          Sign in
        </Link>
      </header>

      {/* ── Hero ── */}
      {/*
        Building image sits absolutely within this section, mirroring the original.
        Content overlaps from the left; the building fades to white on all sides.
      */}
      <section className="relative overflow-hidden px-8 pb-16 pt-0 sm:px-14" style={{ minHeight: 460, backgroundColor: '#ffffff' }}>
        {/* Building photo — decorative, fades into white */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BUILDING_IMAGE}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            top: 0,
            left: '25%',
            width: '75%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center top',
            opacity: 0.9,
            WebkitMaskImage:
              'radial-gradient(ellipse 80% 90% at 70% 40%, black 20%, transparent 80%), linear-gradient(to left, black 20%, transparent 70%), linear-gradient(to bottom, black 50%, transparent 100%)',
            WebkitMaskComposite: 'destination-in',
            maskImage:
              'radial-gradient(ellipse 80% 90% at 70% 40%, black 20%, transparent 80%)',
          }}
        />

        {/* White left fade so text is readable */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              'linear-gradient(to right, #ffffff 35%, rgba(255,255,255,0.6) 55%, transparent 75%)',
          }}
        />

        {/* Hero content */}
        <div className="relative z-10 pt-4">
          <h1
            className="max-w-[680px] text-[52px] leading-[1.2] text-[#1d1e20]"
            style={{ fontWeight: 400 }}
          >
            <strong style={{ fontWeight: 700 }}>Future</strong> of Property
            Management,{' '}
            <strong style={{ fontWeight: 700 }}>Simplified.</strong>
          </h1>

          <p className="mt-6 max-w-[520px] text-[16px] leading-[1.7] text-[#1d1e20]">
            Managing properties shouldn&apos;t feel like a full-time chore.
            Whether you are overseeing a bustling commercial complex or tracking
            utility bills across multiple units,{' '}
            <strong>Ooruda</strong> is stepping in to digitize, streamline, and
            automate your entire property ecosystem.
          </p>

          <a
            href="#waitlist"
            className="mt-10 inline-block rounded-lg px-6 py-3.5 text-[16px] font-medium text-black transition-opacity hover:opacity-90"
            style={{ background: '#FCD469', borderRadius: '8px' }}
          >
            Request Access
          </a>
        </div>
      </section>

      {/* ── "Something Big" section ── */}
      <section className="border-t border-[#f0f0f0] px-8 py-16 sm:px-14" style={{ backgroundColor: '#ffffff' }}>
        <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
          {/* Text */}
          <div className="min-w-0 flex-1">
            <h2 className="max-w-2xl text-[32px] font-bold leading-[1.2] text-[#FCD469]">
              Something Big is Built for Your Properties.
            </h2>
            <p className="mt-5 max-w-xl text-[16px] leading-[1.7] text-[#4a4a4a]">
              We are launching soon with a hyper-focus on Commercial Property
              Management, bringing you smarter tools to handle the essentials
              without the headache. Stay Tuned.
            </p>
          </div>

          {/* Dark property photo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.pexels.com/photos/27920274/pexels-photo-27920274.jpeg?auto=compress&cs=tinysrgb&w=800"
            alt="Property management essentials — house models, key, calculator"
            className="w-full shrink-0 rounded-2xl object-cover shadow-xl lg:w-[480px]"
            style={{ aspectRatio: '16/9' }}
          />
        </div>
      </section>

      {/* ── Early access form ── */}
      <section id="waitlist" className="px-8 py-16 sm:px-14" style={{ backgroundColor: '#ffffff' }}>
        <div className="mx-auto max-w-xl text-center">
          <span className="text-[13px] font-semibold tracking-[0.15em] text-[#FCD469] uppercase">
            Early Access
          </span>
          <h3 className="mt-3 text-[36px] font-bold leading-[1.2] text-[#1d1e20]">
            Secure your spot
          </h3>
          <p className="mt-4 text-[16px] leading-[1.7] text-[#4a4a4a]">
            Join our exclusive early-access list to get a first look, beta
            testing invites, and special founding-member pricing.
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
      <footer className="border-t border-[#eee] px-8 py-12 sm:px-14" style={{ backgroundColor: '#ffffff' }}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <div className="mx-auto mb-1 h-px w-12 bg-[#FCD469]" />
            <span className="text-[22px] font-bold text-[#1d1e20]">
              Ooruda
            </span>
            <p className="text-[14px] font-medium text-[#1d1e20]">
              <strong>Future</strong> of Property Management,{' '}
              <strong>Simplified</strong>
            </p>
          </div>

          <Link href="/" className="text-[13px] font-semibold tracking-widest text-[#1d1e20]/60 uppercase hover:text-[#1d1e20]">
            Home
          </Link>

          <div className="h-px w-full bg-[#eee]" />

          <span className="text-[13px] text-[#1d1e20]/50">
            &copy; {new Date().getFullYear()} Ooruda
          </span>

          <span className="text-[11px] font-semibold tracking-[0.2em] text-[#FCD469] uppercase">
            Ooruda Private Beta
          </span>
        </div>
      </footer>
    </div>
  );
}

function EarlyAccessForm() {
  return (
    <form
      action="https://formsubmit.co/hello@ooruda.com"
      method="POST"
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="_subject" value="Ooruda Early Access Request" />
      <input type="hidden" name="_captcha" value="false" />
      <input type="hidden" name="_next" value="https://ooruda.com" />

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-[#1d1e20]">
          Your Name <span className="text-red-500">*</span>
        </label>
        <input
          name="name"
          type="text"
          required
          placeholder="John Smith"
          className="rounded-lg border border-[#ddd] bg-[#fafafa] px-4 py-3 text-sm text-[#1d1e20] outline-none transition focus:border-[#FCD469] focus:ring-2 focus:ring-[#FCD469]/30"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-[#1d1e20]">
          Email Address <span className="text-red-500">*</span>
        </label>
        <input
          name="email"
          type="email"
          required
          placeholder="john@example.com"
          className="rounded-lg border border-[#ddd] bg-[#fafafa] px-4 py-3 text-sm text-[#1d1e20] outline-none transition focus:border-[#FCD469] focus:ring-2 focus:ring-[#FCD469]/30"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-[#1d1e20]">
          Message
        </label>
        <textarea
          name="message"
          rows={4}
          placeholder="Tell us about your property management needs…"
          className="rounded-lg border border-[#ddd] bg-[#fafafa] px-4 py-3 text-sm text-[#1d1e20] outline-none transition focus:border-[#FCD469] focus:ring-2 focus:ring-[#FCD469]/30"
        />
      </div>

      <button
        type="submit"
        className="mt-1 block rounded-lg px-10 py-3.5 text-center text-[15px] font-medium text-black transition-opacity hover:opacity-90 mx-auto"
        style={{ background: '#FCD469' }}
      >
        Request Early Access
      </button>
    </form>
  );
}
