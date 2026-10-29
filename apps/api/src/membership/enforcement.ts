/** The paid-pilot switch (docs/MEMBERSHIP-PLAN.md §2).
 *
 *  Accounts, quota and the membership tables are not in production yet (#95 is the
 *  gate), and the Coach has been answering there without them. So the account path
 *  is opt-in: only the exact value `enforce` turns entitlement, reserve/settle and
 *  cost accounting on. Unset, `off` or a typo keeps the pre-#83 behaviour - guests
 *  may ask, nothing is metered - which means a half-configured deploy cannot take
 *  the chat down, it can only fail to charge. Flip the API and the web together. */
export function membershipEnforced(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MEMBERSHIP_ENFORCEMENT === 'enforce';
}
