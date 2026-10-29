import { describe, expect, it } from 'vitest';

import {
  classifyEvents,
  eventSetFingerprint,
  nightsBetween,
  parseIcal,
  redactFeedUrl,
  renderIcalConflictEmail,
} from './ical-sync';

describe('redactFeedUrl', () => {
  it('strips query tokens and hashes from feed URLs', () => {
    expect(
      redactFeedUrl(
        'https://www.airbnb.co.in/calendar/ical/123456.ics?s=secret-token&t=another#frag',
      ),
    ).toBe('https://www.airbnb.co.in/calendar/ical/123456.ics');
  });

  it('returns placeholder for unparseable URLs', () => {
    expect(redactFeedUrl('not-a-url')).toBe('[unparseable feed url]');
  });
});

describe('parseIcal', () => {
  it('throws on non-iCalendar bodies (e.g. HTML 502 error page)', () => {
    expect(() => parseIcal('<html>502 Bad Gateway</html>')).toThrow(
      'Body is not an iCalendar document.',
    );
  });

  it('parses VEVENTs and unfolds folded lines', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:airbnb-123',
      'DTSTART;VALUE=DATE:20261105',
      'DTEND;VALUE=DATE:20261108',
      'SUMMARY:Airbnb (Not ',
      ' available)',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const { events, skipped } = parseIcal(ics);
    expect(skipped).toBe(0);
    expect(events).toEqual([
      {
        uid: 'airbnb-123',
        summary: 'Airbnb (Not available)',
        start: '2026-11-05',
        end: '2026-11-08',
      },
    ]);
    expect(nightsBetween(events[0]!.start, events[0]!.end)).toBe(3);
  });

  it('skips invalid dates (e.g. Feb 31)', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:bad-date',
      'DTSTART;VALUE=DATE:20260231',
      'DTEND;VALUE=DATE:20260302',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');

    const { events, skipped } = parseIcal(ics);
    expect(events).toHaveLength(0);
    expect(skipped).toBe(1);
  });
});

describe('classifyEvents', () => {
  const today = '2026-10-27';

  it('drops past events and Airbnb availability-window edge', () => {
    const events = [
      // Past stay ending today
      { uid: '1', summary: 'Past', start: '2026-10-24', end: '2026-10-27' },
      // Valid upcoming stay
      { uid: '2', summary: 'Stay', start: '2026-11-10', end: '2026-11-14' },
      // Airbnb 3-month availability horizon (ends > today+300 and > 90 nights)
      { uid: '3', summary: 'Horizon', start: '2027-01-25', end: '2027-10-28' },
    ];

    const result = classifyEvents(events, { today });
    expect(result.heldForReview).toBe(false);
    expect(result.apply).toEqual([events[1]]);
    expect(result.totalNights).toBe(4);
    expect(result.dropped.map((d) => d.reason)).toEqual([
      'past',
      'window_edge',
    ]);
  });

  it('holds feed for review when a single non-horizon event exceeds maxSpanNights', () => {
    const events = [
      { uid: '1', summary: 'Long', start: '2026-11-01', end: '2027-02-15' },
    ];

    const result = classifyEvents(events, { today });
    expect(result.heldForReview).toBe(true);
    expect(result.apply).toHaveLength(0);
    expect(result.dropped[0]?.reason).toBe('too_long');
  });
});

describe('eventSetFingerprint', () => {
  it('produces order-independent fingerprint', () => {
    const a = {
      uid: 'u1',
      summary: 'S',
      start: '2026-11-01',
      end: '2026-11-03',
    };
    const b = {
      uid: 'u2',
      summary: 'S',
      start: '2026-12-01',
      end: '2026-12-05',
    };
    expect(eventSetFingerprint([a, b])).toBe(eventSetFingerprint([b, a]));
  });
});

describe('renderIcalConflictEmail', () => {
  it('interpolates the property name instead of hardcoding a domain', () => {
    const { subject, html } = renderIcalConflictEmail(
      'Sunset Villa',
      'Airbnb',
      [
        {
          bookingId: 'b1',
          reference: 'SV-0001',
          checkIn: '2026-11-10',
          checkOut: '2026-11-12',
          feedStart: '2026-11-11',
          feedEnd: '2026-11-13',
        },
        {
          bookingId: 'b2',
          reference: 'SV-0002',
          checkIn: '2026-12-01',
          checkOut: '2026-12-03',
          feedStart: '2026-12-01',
          feedEnd: '2026-12-03',
        },
      ],
    );

    expect(subject).toBe(
      'Double booking: 2 clashes between Airbnb and Sunset Villa',
    );
    expect(html).toContain('Sunset Villa');
    expect(html).not.toContain('villa19.in');
  });
});
