---
name: Medical Records Request scope
description: Workbook fidelity and reusable-contact decisions for the medical request tracker.
---

Keep the original workbook's tab structure, including non-clinic groupings such as “URGENT.” The user explicitly renamed the displayed “No Foud” tab to “Not Found”; retain the original spelling only in workbook provenance. Do not silently merge tabs or rename them to match the general clinic list.

**Why:** The user explicitly requested the workbook as the page template and said to keep its clinic-tab structure while importing its historical requests.

**How to apply:** Preserve a request's workbook provenance separately from its editable tab/location. Exclude stray copied-template cells without request identifiers, but preserve genuinely incomplete requests.

Keep historical dates, invoice/payment notes, and contact details as written instead of automatically correcting or interpreting ambiguous text.

**Why:** The supplied workbook contains date ranges, letter/fax/mail annotations, malformed date strings, multiple email addresses, and free-form financial notes. Converting them to strict dates, single-email fields, or monetary totals would lose information or introduce guesses.

**How to apply:** Calendar-date conversion of numeric Excel cells must not depend on server timezone. A sent date can support a “Sent” status, but it is not evidence of confirmed completion or payment.

Contact selection should fill all contact fields while allowing new text; distinct contact variants must not be merged merely because the organization or person's name matches.

**Why:** The user wants dropdown autofill and the ability to enter new information. Existing organizations have inconsistent or alternate phone/email/fax details, so name-only merging can combine unrelated contact destinations.

**How to apply:** Treat saved request contact details as historical snapshots. Reusing or adding a contact must not retroactively rewrite other requests. Clear absent fields when selecting a different contact to avoid leaving another person's details in the form.

Keep saved-contact searching and selection inside the request editor's modal interaction boundary.

**Why:** The user reported the contact details picker was not working while creating requests. An external popup adds conflicting modal focus/scroll behavior; the in-form dropdown avoids that interaction and keeps free-text entry available.

**How to apply:** Preserve keyboard selection without submitting the request. Escape from an open contact dropdown must close that dropdown, not discard the request editor; the parent modal's capture-phase Escape handler must allow for this.
