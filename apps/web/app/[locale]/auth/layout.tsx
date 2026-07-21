import { OorudaMark } from '~/components/ooruda-mark';

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
            <OorudaMark size={36} className="text-[#1a1a1a]" />
          </div>

          <h1 className="text-[26px] leading-tight font-black tracking-tight text-[#1a1a1a] lowercase">
            ooruda
          </h1>

          <p className="mt-1 text-[10px] font-medium tracking-[0.15em] text-[#5a4a10] uppercase">
            Property Management
          </p>
        </div>

        {/* Form card */}
        <div
          className="overflow-hidden rounded-2xl shadow-2xl"
          style={{
            background: '#ffffff',
            border: '1.5px solid #C8A820',
            boxShadow: '0 8px 32px rgba(180,130,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          {/* Amber accent strip */}
          <div className="h-[5px] w-full" style={{ background: 'linear-gradient(90deg, #E8A800 0%, #FCD469 60%, #E8A800 100%)' }} />

          <div className="px-6 py-7 sm:px-8">{children}</div>
        </div>

        <p className="mt-5 text-center text-[11px] text-[#a09070]">
          &copy; {new Date().getFullYear()} Ooruda. All rights reserved.
        </p>
      </div>
    </div>
  );
}

export default AuthLayout;
