# Proposed golden cases

Golden cases are the answer key for the parts of Granite that must never be wrong: the pay rules,
the document reader, the payroll export files, and the compliance dates and figures (the duties'
due dates, the ACA full-time test, the workers' comp premium split).

- `tests/goldens/rules/`, `tests/goldens/extract/` and `tests/goldens/exports/` hold **approved**
  cases. Claude cannot change them (a hook blocks it).
- Claude puts **new or changed** cases here, in `tests/goldens/_proposed/<rules|extract|exports|compliance>/`,
  each with a plain-English explanation of the expected result and the arithmetic behind it.
- To approve one, the owner types: `approve golden <name>` (for example
  `approve golden flsa-weekly-ot-basic`), or `approve all goldens`. That unlocks only those cases for
  that one turn, and Claude moves them into the approved folder.
