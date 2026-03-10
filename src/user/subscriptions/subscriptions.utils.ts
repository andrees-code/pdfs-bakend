export function calculateEndDate(plan: 'monthly' | 'yearly'): Date {
  const now = new Date();
  const end = new Date(now);

  if (plan === 'monthly') end.setMonth(end.getMonth() + 1);
  if (plan === 'yearly') end.setFullYear(end.getFullYear() + 1);

  return end;
}
