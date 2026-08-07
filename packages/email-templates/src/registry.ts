import { renderAccountDeleteEmail } from './emails/account-delete.email';
import {
  renderBillDispatchEmail,
  renderReceiptDispatchEmail,
} from './emails/bill-dispatch.email';
import { renderBillReminderEmail } from './emails/bill-reminder.email';
import { renderInviteEmail } from './emails/invite.email';
import { renderOtpEmail } from './emails/otp.email';

/**
 * Registry of email template renderers.
 *
 * This is used to render email templates dynamically. Ex. list all available email templates in the MCP server.
 *
 * @example
 *
 * const { html, subject } = await renderAccountDeleteEmail({
 *   userDisplayName: 'John Doe',
 *   productName: 'My SaaS App',
 * });
 *
 * await mailer.sendEmail({
 *   to: 'user@example.com',
 *   from: 'noreply@yourdomain.com',
 *   subject,
 *   html,
 * });
 *
 * @example
 *
 * const { html, subject } = await renderAccountDeleteEmail({
 *   userDisplayName: 'John Doe',
 *   productName: 'My SaaS App',
 * });
 *
 */
export const EMAIL_TEMPLATE_RENDERERS = {
  'bill-dispatch-email': renderBillDispatchEmail,
  'receipt-dispatch-email': renderReceiptDispatchEmail,
  'bill-reminder-email': renderBillReminderEmail,
  'account-delete-email': renderAccountDeleteEmail,
  'invite-email': renderInviteEmail,
  'otp-email': renderOtpEmail,
};

export type EmailTemplateRenderer =
  (typeof EMAIL_TEMPLATE_RENDERERS)[keyof typeof EMAIL_TEMPLATE_RENDERERS];
