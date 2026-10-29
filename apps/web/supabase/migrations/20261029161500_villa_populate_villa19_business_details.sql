/*
 * Populates the Villa 19 property row with the operating company details and
 * WhatsApp contact. A property connected to the villa-booking site without
 * having these configured in Villa Settings previously sent booking
 * confirmation emails missing the legal footer and WhatsApp contact.
 *
 * Every column is written with coalesce(nullif(trim(...), '')), so a value a
 * villa admin has already entered in Villa Settings is never overwritten.
 *
 * GSTIN is seeded here rather than defaulted in code: it is a per-state
 * registration (29 = Karnataka), so it belongs to this property, not to the
 * company. See DEFAULT_VILLA_ENTITY in lib/villa/guest-emails.ts.
 */

update public.villa_properties
set
  legal_name = coalesce(nullif(trim(legal_name), ''), 'HABBAA SOLUTIONS PVT LTD'),
  legal_address = coalesce(nullif(trim(legal_address), ''), '209, Citadel Prism, PVS Kalakunj Road, Kodialbail, Mangalore 575003'),
  cin = coalesce(nullif(trim(cin), ''), 'U47711KA2025PTC207750'),
  gstin = coalesce(nullif(trim(gstin), ''), '29AAICH1682G1ZD'),
  support_email = coalesce(nullif(trim(support_email), ''), 'reservations@habbaa.com'),
  whatsapp_number = coalesce(nullif(trim(whatsapp_number), ''), '+918050484123')
-- Matched on booking_code_prefix, not on the display name: the prefix is the
-- villa's stable identifier (villa_properties.id is uuid_generate_v4(), so it
-- differs between local, dev and prod), and an exact match cannot catch an
-- unrelated future property that happens to have 'Habbaa' in its name.
where booking_code_prefix = 'V19';
