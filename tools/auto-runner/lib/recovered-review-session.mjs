// Adopt the worker's successor session before the continuation can checkpoint
// or perform its next GitHub effect. Persistence must succeed first.
export async function adoptRecoveredReviewSession({ state, issue, review, persist }) {
  if (!review?.sessionLifecycle) return state;
  const next = { ...state, sessionLifecycle: review.sessionLifecycle };
  await persist(next);
  issue.sessionLifecycle = review.sessionLifecycle;
  return next;
}
