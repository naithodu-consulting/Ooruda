import { getTranslations } from 'next-intl/server';

import { PhoneOtpSignInContainer } from '@kit/auth/sign-in';

export const generateMetadata = async () => {
  const t = await getTranslations('auth');
  return { title: t('signIn') };
};

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-y-7">
      <div className="flex flex-col gap-y-1.5">
        <h2 className="text-[15px] font-bold text-white">
          Enter your registered mobile number
        </h2>
      </div>

      <PhoneOtpSignInContainer />
    </div>
  );
}
