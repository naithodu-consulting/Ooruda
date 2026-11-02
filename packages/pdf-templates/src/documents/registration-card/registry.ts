import type * as React from 'react';

import type { RegistrationCardTemplateKey } from './template-keys';
import type { RegistrationCardPdfData } from './types';
import { Villa19RegistrationCardDocument } from './villa19';

/**
 * Every registration card a property can print, by template key
 * (villa_properties.registration_card_template).
 *
 * There is deliberately NO default entry. A villa whose key is null, or whose
 * key nothing here answers to, prints no card at all and shows no download
 * button: a guest signing another villa's letterhead and another villa's
 * house rules is worse than a villa with no card yet. Onboarding a second
 * property means adding its own document file, one line here, and its key in
 * template-keys.ts — the `Record` below is typed by that list, so forgetting
 * either half is a type error rather than a silently missing button.
 */
export const REGISTRATION_CARD_TEMPLATES: Record<
  RegistrationCardTemplateKey,
  (props: { data: RegistrationCardPdfData }) => React.ReactElement
> = {
  villa19: Villa19RegistrationCardDocument,
};
