import { getRequestConfig } from 'next-intl/server';

import account from '../../web/i18n/messages/en/account.json';
import auth from '../../web/i18n/messages/en/auth.json';
import billing from '../../web/i18n/messages/en/billing.json';
import common from '../../web/i18n/messages/en/common.json';
import teams from '../../web/i18n/messages/en/teams.json';

export default getRequestConfig(async () => {
  return {
    locale: 'en',
    messages: {
      common,
      auth,
      account,
      teams,
      billing,
    },
    timeZone: 'UTC',
    getMessageFallback(info) {
      return info.key;
    },
  };
});
