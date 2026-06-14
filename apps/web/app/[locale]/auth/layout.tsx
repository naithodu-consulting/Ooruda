import { Building2 } from 'lucide-react';

function AuthLayout({ children }: React.PropsWithChildren) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{
        background:
          'linear-gradient(135deg, #060D18 0%, #0F1F35 50%, #1A2F4A 100%)',
      }}
    >
      <div className="w-full max-w-[380px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-[0_8px_24px_rgba(245,158,11,0.4)]"
            style={{
              background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
            }}
          >
            <Building2 className="h-7 w-7 text-[#0F172A]" strokeWidth={2} />
          </div>

          <h1 className="text-[28px] font-black leading-tight tracking-tight text-white">
            PropOps
          </h1>

          <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-white/35">
            Commercial Property Management
          </p>
        </div>

        {/* Glass card — .dark forces MakerKit inputs/labels into dark-mode styles */}
        <div
          className="dark rounded-[18px] p-7 backdrop-blur-xl text-foreground"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {children}
        </div>

        <p className="mt-6 text-center text-[11px] text-white/20">
          &copy; {new Date().getFullYear()} PropOps. All rights reserved.
        </p>
      </div>
    </div>
  );
}

export default AuthLayout;
