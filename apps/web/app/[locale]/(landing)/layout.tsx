import { DM_Sans } from 'next/font/google';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' });

export default function LandingLayout({
  children,
}: React.PropsWithChildren) {
  return (
    <>
      <style>{`html, body { background-color: #ffffff !important; }`}</style>
      <div
        className={`${dmSans.variable} font-[family-name:var(--font-dm-sans)]`}
        style={{ backgroundColor: '#ffffff' }}
      >
        {children}
      </div>
    </>
  );
}
