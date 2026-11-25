const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' });
export function tillAction(required, session, now = new Date()) {
  if (!required) return null;
  if (!session || session.status !== 'open') return 'open';
  return businessDate.format(new Date(session.openedAt)) === businessDate.format(now) ? null : 'close';
}

export function isTillExempt(user) {
  return user?.role === 'dispatch-worker' || user?.workerLogin === true || Boolean(user?.delegationId);
}
