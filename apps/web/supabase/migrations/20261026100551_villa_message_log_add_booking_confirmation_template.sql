-- Villa M11: allow 'booking_confirmation' in villa_message_log.template
--
-- M7 created the check with only ('pre_arrival', 'thank_you'). M10 added
-- the booking-confirmation email feature but forgot to widen the constraint.
-- Manual "Send now" inserts with template='booking_confirmation' were
-- rejected, producing "Could not send the email. Please try again."

alter table public.villa_message_log
  drop constraint if exists villa_message_log_template_check;

alter table public.villa_message_log
  add constraint villa_message_log_template_check
    check (template in ('pre_arrival', 'thank_you', 'booking_confirmation'));
