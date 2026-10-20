import { getTranslations } from 'next-intl/server';

import { PhoneOtpSignInContainer } from '@kit/auth/sign-in';

export const generateMetadata = async () => {
  const t = await getTranslations('auth');
  return { title: t('signIn') };
};

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-foreground text-xl font-semibold tracking-tight">
          Sign in
        </h2>
      </div>

      <PhoneOtpSignInContainer />
    </div>
  );
}
