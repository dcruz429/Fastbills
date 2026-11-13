/**
 * Documentation/test data ONLY. No runtime normalization or permission grants.
 * Do not import this module into application authorization or dropdowns.
 */
export const DEPARTMENT_REVIEW = [
  { access: "Verification", calendar: "Verification", proposal: "existing-exact-key" },
  { access: "Billing", calendar: "Billing", proposal: "existing-exact-key" },
  { access: "Posting", calendar: "Posting", proposal: "existing-exact-key" },
  { access: "Collections", calendar: "Collections", proposal: "existing-exact-key" },
  { access: "Denials", calendar: "Denials", proposal: "existing-exact-key" },
  { access: "Arbitration", calendar: "Arbitration", proposal: "existing-exact-key" },
  { access: "Checks", calendar: "Checks", proposal: "existing-exact-key" },
  { access: "Case Management / RTP", calendar: "RTP", proposal: "unapproved-alias-do-not-apply" },
  { access: null, calendar: "Other", proposal: "unapproved-scope-definition-not-a-wildcard" },
  { access: "Closed", calendar: null, proposal: "do-not-collapse-into-RTP" },
  { access: "Document Center", calendar: null, proposal: "no-new-calendar-scope" },
] as const;
