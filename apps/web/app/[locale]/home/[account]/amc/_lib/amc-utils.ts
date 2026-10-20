export type AmcStatus =
  | 'active'
  | 'due_soon'
  | 'urgent'
  | 'critical'
  | 'expired'
  | 'terminated';

export function computeAmcStatus(
  endDate: string,
  terminatedAt: string | null,
): AmcStatus {
  if (terminatedAt) return 'terminated';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const daysLeft = Math.round(
    (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 7) return 'critical';
  if (daysLeft <= 30) return 'urgent';
  if (daysLeft <= 90) return 'due_soon';
  return 'active';
}
