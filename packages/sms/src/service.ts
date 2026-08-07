import 'server-only';
import { KaleyraProvider } from './providers/kaleyra';
import { MockSmsProvider } from './providers/mock';
import { Msg91SmsProvider } from './providers/msg91';
import { TwoFactorSmsProvider } from './providers/two-factor';
import type { ISmsProvider } from './types';

export function getSmsProvider(): ISmsProvider {
  const provider = (process.env.SMS_PROVIDER ?? 'mock').toLowerCase();

  switch (provider) {
    case 'kaleyra':
      return new KaleyraProvider();
    case 'msg91':
      return new Msg91SmsProvider();
    case 'twofactor':
    case '2factor':
      return new TwoFactorSmsProvider();
    case 'mock':
    default:
      return new MockSmsProvider();
  }
}
