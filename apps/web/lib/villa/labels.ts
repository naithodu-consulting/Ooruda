/**
 * Villa vocabulary shared by settings, bookings (M3) and invoices (M5).
 * The values mirror database check constraints; labels are what people read.
 */

export const ADDON_UNITS = [
  'per_stay',
  'per_night',
  'per_guest_per_night',
  'per_unit',
] as const;

export type AddonUnit = (typeof ADDON_UNITS)[number];

export const ADDON_UNIT_LABELS: Record<AddonUnit, string> = {
  per_stay: 'per stay',
  per_night: 'per night',
  per_guest_per_night: 'per guest per night',
  per_unit: 'each',
};

export function addonUnitLabel(unit: string): string {
  return ADDON_UNIT_LABELS[unit as AddonUnit] ?? unit;
}

export const CONTACT_CATEGORIES = [
  'caretaker',
  'manager',
  'owner',
  'security',
  'doctor',
  'hospital',
  'ambulance',
  'police',
  'fire',
  'electrician',
  'plumber',
  'other',
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  caretaker: 'Caretaker',
  manager: 'Manager',
  owner: 'Owner',
  security: 'Security',
  doctor: 'Doctor',
  hospital: 'Hospital',
  ambulance: 'Ambulance',
  police: 'Police',
  fire: 'Fire',
  electrician: 'Electrician',
  plumber: 'Plumber',
  other: 'Other',
};

export function contactCategoryLabel(category: string): string {
  return CONTACT_CATEGORY_LABELS[category as ContactCategory] ?? category;
}
