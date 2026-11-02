/**
 * The facts a guest registration card prints.
 *
 * Note what this type does NOT carry: no labels, no field order, no terms, no
 * page geometry. Those belong to a villa's own template, because a
 * registration card is the villa's sheet — Villa 19's field order and house
 * rules are Villa 19's, and the next villa will hand us a different one. A
 * shared "label/value rows" shape would quietly turn eight different villas
 * into one generic form, which is exactly what we are not building.
 *
 * Every optional value means "print the label with an empty line after it":
 * the guest completes it in pen on arrival. That is by design for identity
 * and travel details — we do not hold a date of birth, a permanent address or
 * a full ID number, and the card is the instrument that collects them.
 */

export interface RegistrationCardLetterhead {
  /** Display name of the villa, e.g. "Villa 19". */
  villaName: string;
  /** Operating company, e.g. "HABBAA SOLUTIONS PVT LTD". */
  legalName: string | null;
  /** Registered address of that company, one line. */
  legalAddress: string | null;
  /** Contact number as printed, e.g. "+91 8050484123". */
  phone: string | null;
  /** Guest-facing address, e.g. "reservations@habbaa.com". */
  email: string | null;
  gstin: string | null;
}

/**
 * Occupancy limits as the villa's settings hold them right now, so the house
 * rule the guest signs cannot drift from what the system enforces.
 */
export interface RegistrationCardOccupancy {
  /** Most guests the villa may take at all. */
  maxGuests: number;
  /** Guests included in the nightly rate; charges apply above this. */
  includedGuests: number;
}

export interface RegistrationCardPdfData {
  letterhead: RegistrationCardLetterhead;
  occupancy: RegistrationCardOccupancy;

  /** Booking code as staff and the guest know it, e.g. "V19-2611-0007". */
  bookingId: string;
  /**
   * The guest's name as booked, printed whole. Deliberately not split into
   * first and last: "Prashanth N" has no safe split, and a card that renames
   * the guest is worse than one the guest completes.
   */
  guestName: string;
  email: string;
  mobile: string;
  /** Company name and GSTIN when the booking carries them. */
  companyInfo: string | null;
  /** ID type on file, e.g. "Aadhaar". The number is always left blank. */
  govtIdType: string | null;

  /** "15 Nov 2026, 2:00 PM" */
  arrival: string;
  /** "18 Nov 2026, 11:00 AM" */
  departure: string;
  /** "10 (8 adults, 2 children)" */
  numberOfGuests: string;
  /** Printed only when exactly one mode has been recorded so far. */
  modeOfPayment: string | null;
  /** Always blank today: the amount is not configured anywhere yet. */
  securityDeposit: string | null;
  /** Per night, before GST, e.g. "₹18,500 per night". */
  tariff: string | null;
  remarks: string | null;
}
