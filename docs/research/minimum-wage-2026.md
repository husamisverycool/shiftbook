# Research notes: minimum wage rates (verified 2026-10-15)

Verified by a research subagent against primary sources. Feeds `minimum_wage_rules` and
`jurisdiction_rules` (drizzle/0004_rule_data_v2.sql, mirrored in src/server/rules/reference-data.ts).

| Jurisdiction | Rate / effective | Citation | Previous | Primary source |
|---|---|---|---|---|
| Federal | $7.25 / 2009-07-24 | 29 U.S.C. § 206(a)(1)(C) | $6.55 / 2008-07-24 | dol.gov/agencies/whd/minimum-wage; law.cornell.edu/uscode/text/29/206 |
| Illinois | $15.00 / 2025-01-01 (unchanged 2026) | 820 ILCS 105/4(a)(1) | $14.00 / 2024-01-01 | IDOL rate-history PDF (modified 2026-01-02); IDOL FAQ |
| Massachusetts | $15.00 / 2023-01-01 (unchanged 2026) | M.G.L. c. 151, § 1 (St. 2018 c. 121) | $14.25 / 2022-01-01 | malegislature.gov statute text and session law |
| California | $16.90 / 2026-01-01 | Cal. Lab. Code § 1182.12 | $16.50 / 2025-01-01 | dir.ca.gov FAQ; DIR release 2026-66 ($17.40 from 2027-01-01, certified 2026-07-31) |
| City of Chicago | $17.05 / 2026-07-01 (4+ employees) | Chicago Municipal Code ch. 6-105 | $16.60 / 2025-07-01 | chicago.gov BACP minimum wage page |
| Cook County | $15.40 / 2026-07-01 (4+ employees) | Cook County Code § 42-13 (Ord. 16-5768) | $15.00 (held 2025-07-01) | cookcountyil.gov notices 2026-06-01, 2025-05-29 |

Scope notes:
- Cook County's rate does not apply in Chicago (own ordinance) or in municipalities that opted out; the
  county publishes no current opt-out list. **Decision:** Cook County and Chicago worksites are held
  ("local_minimum_wage" not implemented) until slice (c) models local ordinances, instead of guessing.
- No other Illinois local minimum wage found (not an exhaustive statewide list). Joliet (Will/Kendall
  counties) is outside Cook County; no ordinance found.
- Massachusetts has no local minimum wages: Amend. Art. 89 § 7(5) of the state constitution bars
  municipalities from enacting private civil law; Boston/Cambridge living-wage ordinances cover only
  city contractors.
