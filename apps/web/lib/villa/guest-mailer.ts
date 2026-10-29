import 'server-only';
import { getMailer } from '@kit/mailers';

/**
 * Sends villa guest email through the villa's own Resend account.
 *
 * A deliberate exception to packages/mailers/AGENTS.md ("always use
 * getMailer()"): the shared mailer binds one RESEND_API_KEY at module load,
 * and Resend only accepts a `from:` whose domain is verified in that same
 * account. Villa guest mail leaves from habbaa.com (VILLA_EMAIL_FROM) while
 * Ooruda's auth, invite and contact mail leaves from ooruda.com, so the two
 * need separate keys live in one process. Sending villa mail on Ooruda's key
 * returns 403.
 *
 * Falls back to RESEND_API_KEY, and then to the shared mailer, when
 * VILLA_RESEND_API_KEY is unset, so a deployment that keeps both domains in
 * one Resend account still works.
 */
export async function sendVillaEmail(args: {
  to: string;
  from: string;
  subject: string;
  html: string;
  /**
   * The plain-text alternative. A transactional message without one reads as
   * bulk mail to the filters that decide whether a confirmation lands in the
   * inbox, so it is sent whenever the template provides one.
   */
  text?: string;
  replyTo?: string;
}): Promise<{ providerId?: string }> {
  const key =
    process.env.VILLA_RESEND_API_KEY?.trim() ||
    process.env.RESEND_API_KEY?.trim();

  if (!key) {
    // The shared mailer's config is a union of {text} | {html} and its Resend
    // provider picks ONE of them - handed both, it sends the plain-text part
    // and drops the HTML entirely. So the text alternative only goes out on
    // the direct call below, which controls the whole payload.
    const { text: _text, ...rest } = args;
    const result = await (await getMailer()).sendEmail(rest);

    return {
      providerId:
        result && typeof result === 'object' && 'id' in result
          ? String((result as { id: unknown }).id)
          : undefined,
    };
  }

  const replyTo =
    args.replyTo ??
    (args.from.includes('<')
      ? /<([^>]+)>/.exec(args.from)?.[1]?.trim()
      : args.from);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      from: args.from,
      to: [args.to],
      reply_to: replyTo,
      subject: args.subject,
      html: args.html,
      ...(args.text ? { text: args.text } : {}),
    }),
  });

  if (!response.ok) {
    // Resend's error body names the cause (an unverified domain, most often)
    // and never echoes the key.
    const detail = await response.text().catch(() => '');

    throw new Error(
      `Resend refused the villa email (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const body = (await response.json().catch(() => null)) as {
    id?: string;
  } | null;

  return { providerId: body?.id };
}
