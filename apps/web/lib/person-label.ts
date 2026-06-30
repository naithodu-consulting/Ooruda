import { formatPhoneNumber } from '@kit/shared/utils';

interface PersonInfo {
  full_name?: string | null;
  mobile_number?: string | null;
}

/**
 * Returns a formatted label for a person, preferring their full name,
 * falling back to a formatted mobile number, or null if neither exists.
 */
export function personLabel(info?: PersonInfo | null): string | null {
  if (info?.full_name?.trim()) {
    return info.full_name.trim();
  }

  if (info?.mobile_number) {
    return formatPhoneNumber(info.mobile_number);
  }

  return null;
}
