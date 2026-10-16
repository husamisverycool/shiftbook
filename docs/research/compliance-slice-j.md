# Research J: Compliance calendar and counters (SPEC §16)

Prepared 2026-10-16 for slice (j). Confidence: **High** = I read the official text today, either the page itself or its full section text in a government-search index; **Medium** = an official snippet, or a page that is thin on the point; **Low** = a third-party source or my memory. We copy hierarchy and interactions only, never wording, names or colors.

**Could not read:** ilga.gov directly (TLS chain and 503 errors; Illinois text came from the government-search index of ilga.gov pages); mass.gov regulation pages (403; I read the 454 CMR PDF through the index); the Gusto help center (403); Rippling (no public compliance article found); Mosey (marketing pages only). Firecrawl scrape credits ran out partway through.

## 0. What the schema has today (wt-d)

- `obligations`:
  - `kind` enum: `il_equal_pay_720h`, `il_equal_pay_4160h`.
  - `worker_id` and `client_id` are **NOT NULL**; `crossed_on` is NOT NULL; `due_on`; `status` `open|done`; `done_at` and `done_by`.
  - `evidence` is jsonb typed to the Illinois counter.
  - Unique on (agency, kind, worker, client). So it cannot hold an agency, branch, client or assignment subject, or a recurring obligation.
- `equal_pay_rules`: dated thresholds. **There is no HoursCounter table.** The counter is computed inside the run (`src/server/run/service.ts` ~461–720).
  - Known limit from slice (c): there is no opening balance for hours worked before Shiftbook.
  - Decision C3 left the equal-pay hold waiting for this slice's rate screen.
- Useful as is: `workers.preferred_language`, `.wc_state`; `worksites.state`; `job_orders.soc_code`, `.shift`, `.day_and_temporary_labor`, `.branch_id`; assignment dates and status; `rate_cards.wc_class_code`; `wc_rates`; pay lines by type; weekly `pay_periods`; `DocumentStore.put/get` (`src/server/storage.ts`).
- **Gaps:**
  - Workers have no hire or termination date and no I-9 fields.
  - There is no table for agency registrations, workers' comp policies, ACA settings or equal-pay rates.
  - `source_documents` is tied to a pay period, so it cannot hold evidence.
  - Nothing shows a workers list yet (that is slice k).
  - The demo has no New Jersey client.

## 1. Illinois: Day and Temporary Labor Services Act (820 ILCS 175)

| Duty | What the law says | Cycle and dates | Source | Conf. |
|---|---|---|---|---|
| Agency registration | Register with IDOL. Prove an unemployment insurance account and workers' comp coverage. A **lapse in workers' comp must be reported and suspends the registration**. | Registration is for "one calendar year" and expires at year end. Apply for renewal "at least 60 days prior to the expiration", so **by November 1**. | § 45 https://ilga.gov/Documents/legislation/ilcs/documents/082001750K45.htm ; 56 IAC 260.320 https://ilga.gov/ftp/JCAR/AdminCode/056/056002600C03200R.html | High |
| Fees | **$3,000 per agency and $750 for each branch office** or location, at registration and at renewal; not refundable. | Annual | 56 IAC 260.330, amended at 50 Ill. Reg. 7177, eff. 2026-04-28: https://ilga.gov/ftp/JCAR/AdminCode/056/056002600C03300R.html | High |
| Application items | Renewal names any new manager. Includes a **$5,000 surety bond** and a copy of the § 10 employment-notice form. | Annual | 56 IAC 260.310 https://ilga.gov/ftp/JCAR/AdminCode/056/056002600C03100R.html | High |
| Client verification | **This is the client's duty, not the agency's.** The client must "verify a day and temporary labor service agency's status with the Department before entering into a contract … and on March 1 and September 1 of each year." The **agency** must give each client "proof of valid registration" at contract time. It must also notify clients and workers within 24 hours of any denial, suspension or revocation. | Mar 1 and Sep 1 | § 85(a) https://ilga.gov/Documents/legislation/ilcs/documents/082001750K85.htm ; 260.510 https://ilga.gov/ftp/JCAR/AdminCode/056/056002600E05100R.html ; IDOL's list of registered agencies: https://labor.illinois.gov/employers/approveddtlsa.html (it may show only a 2023 list; Medium) | High |
| § 42 equal pay | Applies after "more than 720 hours within a 12-month period, beginning on or after April 1, 2024". Method (1), a client comparator, is the default (260.445(a)(1)). The client may direct method (2), the BLS median, or the 75th percentile after 4,160 hours in 48 months. On request the client must provide comparator, seniority and benefits data, "timely", meaning before the next pay period (260.505(b)). Source line: P.A. 103-437, 103-564, 103-1030 (eff. 2024-08-09). | Event (counter) | § 42 https://ilga.gov/documents/legislation/ilcs/documents/082001750K42.htm ; 260.445 https://ilga.gov/ftp/JCAR/AdminCode/056/056002600D04450R.html ; IDOL method (2) links: https://labor.illinois.gov/laws-rules/fls/day-temporary-labor/Guidance-on-Using-USDOL-Standard-Occupational-Classifications-to-Determine-Wage-Rate | High |
| Employment notice | At dispatch, a statement on a Department-approved form. **Once § 42 applies, it must state "the seniority and hourly wage of the comparator" or the SOC used** (§ 10(a)(7)). | Per dispatch | https://ilga.gov/legislation/ilcs/documents/082001750K10.htm | High |
| Records | § 12 lists the records (clients, worksites, hours and rate per worker, contracts, invoices). 260.410 adds:<br>(l) safety-training records "signed by each … laborer";<br>(m) "all records, including information provided by third party clients, used to determine compensation";<br>(n) strike notices.<br>The IDOL FAQ says keep them "three years". | Ongoing | § 12 https://ilga.gov/legislation/ilcs/fulltext.asp?DocName=082001750K12 ; 260.410 (amended eff. 2026-04-28) https://ilga.gov/ftp/JCAR/AdminCode/056/056002600D04100R.html ; FAQ https://labor.illinois.gov/faqs/day-temp-labor-faq.html | High / Medium (3 years) |
| Safety training (**not in SPEC §16**) | The agency gives general safety training "for each client company … on or before a … laborer's first day working at that client company each year". The client confirms site-specific training within 3 business days (§ 85(d)(4)). | Per worker × client × year | 260.404 https://ilga.gov/ftp/JCAR/AdminCode/056/056002600D04040R.html | High |

**Amendments 2024–2026:**
- The rules were amended at 50 Ill. Reg. 7177, eff. 2026-04-28 (260.330, 260.410, 260.450 and 260.550 seen; 260.445 assumed, as in slice c).
- The indexed text of § 42 shows no Public Act numbered 104-.
- The 104th General Assembly's Senate bill list shows **SB0037 "DAY&TEMPORARY LABOR SERVICES"** (https://ilga.gov/Legislation/RegularSession/SB?DocTypeID=SB&GaId=18&num1=0501&num2=0800). I could not read its text or status (ilga.gov 503). Low.
- The § 42 litigation status is unchanged from slice (c), research §9.1.

**What Shiftbook can compute:**
- Illinois clients that have covered work: an Illinois worksite with `day_and_temporary_labor` set, on an active assignment.
- Branches. The renewal due date: expiry minus 60 days.
- The § 42 crossing, which slice (c) already computes.
- The employment-notice fields: wage, worksite with county, and, after a crossing, the comparator or SOC.

## 2. New Jersey: Temporary Workers' Bill of Rights (P.L. 2023, c.10; N.J.S.A. 34:8D)

Act text: https://pub.njleg.gov/Bills/2022/PL23/10_.HTM. Labor rules N.J.A.C. 12:72 (56 N.J.R. 1852, eff. **2024-09-16**): https://nj.gov/labor/assets/PDFs/Legal%20Notices/Rule%20Adoptions/2024/NJAC_12_72_(TWBOR_new_rules)_(notice_of_adoption)_FILED.pdf. Certification rules N.J.A.C. 13:45B-12A (eff. 2024-09-16): https://njconsumeraffairs.gov/Adoptions/regbusado_09162024.pdf. All High unless noted.

- **Scope.** The Act covers "designated classification placements" only. NJDOL's FAQ lists the groups: protective service, food preparation, building cleaning, personal care, construction laborers and helpers, installation and repair, production, and transportation and material moving.
  - Workers placed outside New Jersey are covered when their primary residence is in New Jersey (12:72-1.1(c)).
  - FAQ: https://nj.gov/labor/myworkrights/worker-protections/temp_workers
  - Computable from `job_orders.soc_code` major group plus worksite state. The exact SOC list is Medium.
- **Certification (34:8D-8).** Certified by the Director of Consumer Affairs, not by NJDOL.
  - **Annual.** The principal executive officer certifies "under oath … each year".
  - Surety bond of at least **$200,000**.
  - The firm must also be registered as a temporary help service firm (N.J.S.A. 56:8-1.1) or licensed.
  - Fees (13:45B-12A.2): **$250 annual certification for the primary location and $250 for each secondary location; late fee $25 for each 30 days**.
  - The rules did not show the expiry anniversary, so store the dates printed on the certificate. Medium.
- **Client verification.** The client verifies the firm's certification before contracting "and on March 1 and September 1 of each year" (34:8D-9). This mirrors Illinois.
- **Primary language.**
  - At dispatch, the firm gives an **assignment notification statement "in English and in the language identified by the employee as the employee's primary language"**, on NJDOL's single published form (34:8D-3(a); 12:72-3.1(a)–(b)). NJDOL said it "has no discretion to deviate".
  - 12:72-3.5: notices must be available in Spanish or the worker's primary language. The firm stays responsible even where NJDOL publishes no translation.
  - **Pay statement:** 34:8D-6 and 12:72-9.1 (pay stub or NJDOL form) contain **no express primary-language rule that I could find**. The FAQ says forms go to workers "in a language they understand" (Medium).
  - So SPEC's "primary-language pay-statement flag" should really be an assignment-notice flag that also reminds about the pay statement.
- **Equal pay (34:8D-7(b)).** From the first day: "not … less than the average rate of pay and average cost of benefits" of comparable client employees. 12:72-7.2 gives the step-by-step formula.
  - There is no hours threshold, so no counter is needed. It is outside SPEC §16.
- **Records:** "six years from their creation" (34:8D-4(b)).

## 3. Massachusetts: DLS registration and the Right to Know job order

- **Registration.**
  - Staffing agencies must be **licensed as employment agencies or registered as placement agencies** with DLS, office in Massachusetts or not.
  - The credential is "valid for a period of one year following the date of issuance". Renewal is due "not later than thirty (30) days prior to the expiration" (454 CMR 24.06(1)–(2)). PDF: https://mass.gov/doc/454-cmr-2400-temporary-worker-right-to-know/download (High via index)
  - DLS sends "a courtesy reminder 45 days prior", but tracking is the agency's job. Each location and each business name needs its own credential. https://mass.gov/info-details/information-for-placement-and-staffing-agencies (High)
  - Fees per year: placement agency main office **$300**; **each branch $180**. Licensed employment agency $300 (1–4 counselors) or $550 (5 or more). https://mass.gov/info-details/register-apply-for-or-renew-a-dls-employmentplacement-agency-license (High via index)
  - Statute: M.G.L. c. 140 § 46D, a license lasts "one year following the date thereof". https://mass.gov/doc/employment-agency-law/download
- **Job order (M.G.L. c. 149 § 159C(b); 454 CMR 24.08).**
  - Statute: https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXXI/Chapter149/Section159C (High)
  - **Contents:** contact details of the agency, its **workers' comp carrier**, the worksite employer and DLS; the position and any required clothing, equipment, training or licenses with costs; pay day, hourly rate, whether overtime may occur; start date, expected duration, daily start and end time; meals, transportation and other charges; strike or lockout; "a multi-lingual statement issued by the department".
  - **When:** "confirmed in writing … before … the end of the first pay period" ("on the same day" for daily pay), by "a method of transmittal designated by the Worker". The worksite employer may hand it over; the agency stays responsible. Changes go to the worker immediately.
  - **Exempt:** professional employees, secretaries and administrative assistants.
  - Every item except the DLS multilingual text can be computed from the job order, rate card, pay periods and agency settings. **The multilingual text must be DLS's own wording.** Worker poster: https://mass.gov/doc/notice-of-temporary-workers-rights-11x17/download
- **Unverified:** mass.gov also hosts "proposed 429 CMR 10.00" with the same structure (https://mass.gov/doc/proposed-regulation-429-cmr-1000/download). Whether it has replaced 454 CMR 24.00 is unknown. Low.

## 4. Workers' compensation premium audit packet

The North Carolina Rate Bureau publishes Basic Manual Rule 2. NCCI-style manuals use the same structure, but the wording was not checked against NCCI's own manual (Medium). https://www.ncrb.org/digitallibrary/basicmanual/Rule_2_-_Premium_and_Payroll.htm

- **2-A:** premium is on "total payroll paid or payable".
- **2-C-2-a:** extra pay for overtime is excluded "provided that the insured's books and records are maintained to show overtime pay separately by employee and in summary by classification".
  - So the packet must show **straight-time and premium portions per employee and in summary by class**.
- **2-G:** an employee's payroll may be split across classes only with records "which show the actual payroll by classification for each employee". "Estimated or percentage allocation … is not permitted."
- **2-H:** subcontractors need a certificate of insurance, or their payroll is charged.
  - This rarely applies to a staffing agency. It applies only if a sub-vendor supplies workers.

State exceptions are unverified: third-party sources say Pennsylvania and Delaware do not exclude the overtime premium (Low). California and Massachusetts run their own class systems (Medium, from slice i).

Illinois § 45 and New Jersey § 8 both require valid workers' comp, so **the policy's expiry is itself an obligation**.

UI reference: **Patriot Software, Workers' Compensation Wages report** (High), https://help.patriotsoftware.com/en/articles/15383790-workers-compensation-wages-report
- Date range; sorted state → code → employee.
- Gross wages and **overtime wages as separate columns**.
- Employees missing a code listed first and left out of the totals.
- PDF/CSV export, with redaction "before sending … to auditors".

## 5. Form I-9 (USCIS Handbook M-274)

- **Section 1:** "no later than the employee's first day of employment", and only after the job offer is accepted. 3.0: https://www.uscis.gov/i-9-central/form-i-9-resources/handbook-for-employers-m-274/30-completing-section-1-employee-information-and-attestation (High)
- **Section 2:** "within three business days of the date employment begins". Started Monday means done by Thursday. A job of less than three business days needs it by the first day. 4.0: https://www.uscis.gov/i-9-central/form-i-9-resources/handbook-for-employers-m-274/40-completing-section-2-employer-review-and-verification (High)
- **Reverification:**
  - "Reverify by the earlier date" of the Section 1 authorization expiry and the Section 2 document expiry.
  - USCIS suggests "at least 90 days advance warning".
  - Never required for U.S. citizens, noncitizen nationals, Permanent Resident Cards, U.S. passports or List B.
  - A rehire within 3 years may use Supplement B.
  - https://www.uscis.gov/i-9-central/completing-form-i-9/completing-supplement-b-reverification-and-rehires-formerly-section-3 ; 6.0 https://www.uscis.gov/i-9-central/form-i-9-resources/handbook-for-employers-m-274/60-completing-supplement-b-reverification-and-rehire-of-form-i-9 (High)
- **Retention:** "three years after the date of hire, or one year after the date employment ends, whichever is later". 10.0: https://www.uscis.gov/i-9-central/form-i-9-resources/handbook-for-employers-m-274/100-retaining-form-i-9 (High)
- For a staffing agency the agency is the employer, so the **I-9 is done once per hire, not per assignment** (Medium; M-274 2.0 not read).
- **Staffing UI reference:** Bullhorn **I-9 Digest** (High), https://kb.bullhorn.com/bote/Content/BOTE/Topics/i9DigestNotifications.htm
  - Counts: Section 1 incomplete, Section 2 incomplete, documents expiring within 90 days, receipts expiring within 90 days.
  - Scheduled daily or weekly per recipient.

## 6. ACA look-back measurement method (26 CFR 54.4980H)

- **Full-time:** "at least 30 hours of service per week or … 130 hours of service in the month". The applicable large employer threshold is an average of 50 full-time employees, counting full-time equivalents, in the prior year.
  - IRS Q&A 5 and 20: https://www.irs.gov/affordable-care-act/employers/questions-and-answers-on-employer-shared-responsibility-provisions-under-the-affordable-care-act (High)
- **Standard measurement period:** "at least three but not more than 12 consecutive months" (definition in § 54.4980H-1(a)). High, from the regulation's definition as printed in the Federal Register:
  - https://federalregister.gov/documents/2013/01/02/2012-31269/shared-responsibility-for-employers-regarding-health-coverage
  - https://federalregister.gov/documents/2014/02/12/2014-03082/shared-responsibility-for-employers-regarding-health-coverage
- **Other periods.** § 54.4980H-3 (https://www.ecfr.gov/current/title-26/chapter-I/subchapter-D/part-54/section-54.4980H-3), all High:
  - **Stability period:** "at least six consecutive calendar months but no shorter in duration than the standard measurement period" ((d)(1)(iii)).
  - **Administrative period:** up to 90 days ((d)(1)(vi)).
  - **New variable-hour employees:** an initial measurement period of 3 to 12 months. The initial period plus the administrative period "cannot extend beyond the last day of the first calendar month beginning on or after the first anniversary" of the start date ((d)(3)(vi)(B)).
  - **Break in service:** at least 13 consecutive weeks with no hour of service makes the employee new ((c)(4)(i)).
  - TempWorks also applies a 4-week "parity" break. Whether the final rule keeps parity was not verified (Low).
- **Temporary staffing factors** for the new-hire expectation (§ 54.4980H-1(a)(49)(ii)(B), https://ecfr.gov/on/2026-06-10/title-26/section-54.4980H-1, High). Do employees in the same position:
  - "retain the right to reject temporary placements";
  - "typically have periods during which no offer … is made";
  - get placements of "differing periods of time"; or
  - get placements "that do not extend beyond 13 weeks"?
- **Hours of service** include paid hours with no duties performed, such as holidays (§ 54.4980H-1(a)(24)). Low, from memory; verify.
  - So holiday-not-worked minutes count, but meal and rest premiums, which are not hours, do not.
- **Exact integer test:** an employee is full-time in a period of D days with M minutes if **M × 7 ≥ 1,800 × D**.
- **Staffing UI reference:** TempWorks **ACA Employee Cycles** (High; https://kb.tempworks.com/help/pdfexport/id/5f15b22fec161cb956687e7c).
  - One row per employee cycle: identity and statuses, then Measurement (hours, weeks, average hours, dates), Admin, Stability and Break In Service dates.
  - Filters: date range, branch, status, customer, average hours. "Show" finds missing cycles or hire dates. Group By: Branch, ACA Status, Customer.

## 7. UI references (help-center articles)

| Part | Reference and what to copy | Source | Conf. |
|---|---|---|---|
| List | **Vanta Tests page:** a left sidebar of subject areas; "most urgent" first; search by name; filter by status and framework; an owner column with an inline picker and an unassigned/person filter; "Edit SLAs" sets deadlines per category. | https://help.vanta.com/en/articles/11345374-the-tests-page ; https://help.vanta.com/hc/en-us/articles/6993220120980-Assignment-and-Ownership-for-Tests-Policies-and-Documents | High |
| List grouping | Linear display options (already adopted in Shiftbook): group by status, ordering | https://linear.app/docs/display-options | High (earlier slices) |
| Detail | **Vanta test detail tabs:** Results (with how to fix), Evidence, History, Tasks, Controls, Audits, Notes | the Tests page article | High |
| Detail and evidence | **Drata control detail:** tabs Overview / Evidence / Monitoring / Policies / Frameworks / Risks; readiness cards; one or more owners; link, unlink, create or map evidence; notes. | https://help.drata.com/en/articles/13372784-assess-and-manage-individual-controls-new-experience | High |
| Evidence and renewals | **Drata evidence:** its own owner; statuses Needs artifact / Needs renewal / Upcoming renewal (within two months) / Ready; many-to-many with controls; old files kept as "Past artifacts".<br>**Vanta documents:** recurrence Annually … Never, counted from the file's **effective date**; "Remind me … days before"; Due soon → Overdue; expired files to History; "Renew by" filter; Export All as a zip. | https://help.drata.com/en/articles/13404035-evidence-overview ; https://help.vanta.com/en/articles/11345476-document-renewal-settings ; https://help.vanta.com/en/articles/11345479-managing-documents | High |
| Calendar | **Google Calendar** shortcuts (best documented): 1/d day, 2/w week, 3/m month, 4/x custom, 5/a agenda; t today; j/n next range; g go to date; c create; e details; / search. The previous-range key was not confirmed. | https://support.google.com/calendar/answer/37034?hl=en | High |
| Calendar | **Notion Calendar** (SPEC's reference), thinly documented: collapsible all-day section; −/+ days shown; T today; ? lists shortcuts. Verify week view in a browser. | https://www.notion.com/en-gb/help/notion-calendar-settings ; https://www.notion.com/help/notion-calendar-keyboard-shortcuts | Medium |
| Calendar | **Linear cycles:** auto-created upcoming cycles; "subscribe to … calendar" (.ics) from the cycle menu. Weak for a calendar grid. | https://linear.app/docs/use-cycles | High (thin) |
| Reminders and digest | Bullhorn I-9 Digest (§5); DLS's 45-day courtesy reminder; Vanta's per-document reminder days | above | High |
| HR compliance product | Gusto Business Compliance ("proactive alerts" before state deadlines, per a search snippet); Rippling: none found; Mosey: marketing only | https://support.gusto.com/article/178974266922487/use-gusto-business-compliance-to-stay-compliant-in-your-states | Medium (403) |

---

## Proposed decisions for the plan

- **J1. Obligation model.** Generalize `obligations` in a migration that keeps the Illinois rows:
  - `type` (FK to a dated `compliance_rules` row) and `jurisdiction`.
  - **subject**: `subject_kind` (agency | branch | client | assignment | worker | worker_client), with nullable `branch_id`, `client_id`, `assignment_id` and `worker_id`, plus a check per kind.
  - `period_key`: the occurrence, e.g. `2027-03-01`, the expiry date, or the crossing.
  - `trigger_on` (replaces `crossed_on`, nullable), `due_on`, `remind_on`.
  - `status`: `open | done | not_applicable`, with a reason for not applicable. Done keeps `done_by`, `done_at` and a note.
  - `evidence` jsonb for computed facts.
  - Unique on (agency, type, subject, period_key).
  - Display states are computed when read, never stored: **Upcoming → Due soon (from `remind_on`) → Overdue**, plus Done and Not applicable. This copies Vanta (Due soon / Overdue) and Drata (Upcoming renewal).
- **J2. Rules as data.** No literals.
  - Each `compliance_rules` row holds: code, jurisdiction, subject kind, recurrence (`annual_from_expiry`, `fixed_dates[03-01, 09-01]`, `event`), lead days, remind days, citation, `effective_from`/`to`.
  - Rows: Illinois renewal lead 60 days; Massachusetts 30; New Jersey annual; Illinois fees $3,000/$750; Massachusetts $300/$180; New Jersey $250/$250; the I-9 3 business days and 3y/1y retention; the 90-day reverification warning; the ACA period limits (3–12 months, ≤ 90 days, ≥ 6 months), 30 h / 130 h, and the 13-week break.
- **J3. Generated automatically.** Pure, deterministic generators run after any change to their inputs and are idempotent through the unique key:
  - **Illinois and Massachusetts registrations:** renewal obligations from new `agency_registrations` rows. Each row holds jurisdiction, kind (agency or branch), branch, number, issued and expires dates, and the certificate as evidence. Illinois expires Dec 31 with renewal due Nov 1; Massachusetts renewal is due expiry − 30.
  - **New Jersey certification:** renewal from its expiry, only when the agency has a New Jersey worksite.
  - **Illinois client proof:** one per Illinois client with covered work active in the prior six months, for each Mar 1 and Sep 1. The obligation is "send proof of registration". The client's verification duty is noted, not owned.
  - **§ 42:** already built; it moves to subject `worker_client`. Done requires an equal-pay rate on file (J7).
  - **Massachusetts job order:** one per new assignment at a Massachusetts worksite, unless the job order is marked exempt (a new flag for professional, secretary or administrative assistant). Due by the last day of the pay period containing the start date, or the start date for workers paid daily.
  - **New Jersey language flag:** one per New Jersey designated placement whose worker's `preferred_language` ≠ `en`. The notice must be in English and that language.
  - **I-9:** per worker from a new `hire_date`. Section 1 due on the hire date; Section 2 due hire + 3 business days. The safe reading counts Mon–Fri and skips no holidays, which only makes the deadline earlier. Reverify on a stored date minus 90 days. Retention ends `max(hire + 3y, termination + 1y)`.
  - **Workers' comp:** policy renewal from a new `wc_policies` row (carrier, number, states, period); the audit is due when the person enters a date.
  - **ACA:** an obligation at the end of each measurement period: "offer by the stability start", for workers measured full-time.
- **J4. Evidence.**
  - A new `compliance_documents` table: filename, media type, sha256, size, storage key, `effective_on`, `expires_on`, `source` (`upload | generated`), uploader.
  - It links many-to-many to obligations (Drata), so one Illinois certificate evidences agency and branch renewals.
  - Files are never deleted. A replaced file moves to History (Vanta, Drata).
  - Generated PDFs (proof page, job order, workers' comp packet) attach themselves.
  - **No I-9 copies or identity documents:** the I-9 is a status with dates only (data-safety rules). No model calls in this slice.
- **J5. Hours counters.**
  - `hours_opening_balances` (worker, client, as-of date, minutes, note, who) closes slice (c)'s known limit.
  - A monthly ACA hours-of-service import (CSV, same code path in the demo) feeds measurement periods before Shiftbook.
  - Counters are computed when read; no stored HoursCounter rows, so they cannot drift. SPEC §4's HoursCounter becomes a view; needs the owner's OK.
- **J6. Screens.**

  | Route | Pattern file | Reference |
  |---|---|---|
  | `/compliance` (list grouped by display state, then due date; filters jurisdiction, type, owner, subject; Due-soon count) | `docs/patterns/compliance.md` | Vanta Tests page (primary), Linear display options |
  | `/compliance/[id]` (header with status, due, owner; tabs Overview / Evidence / History / Notes; Mark done; Not applicable with a reason) | `docs/patterns/compliance/[id].md` | Drata control detail (primary), Vanta test detail tabs, Vanta document versions |
  | `/compliance/calendar` (month, week, agenda; t, j/n, m, w, a) | `docs/patterns/compliance/calendar.md` | Google Calendar (primary, best documented); Notion Calendar week view to verify |
  | `/compliance/counters` (Illinois 12- and 48-month hours per worker × client; opening balances) | `docs/patterns/compliance/counters.md` | TempWorks ACA Employee Cycles table style |
  | `/compliance/aca` (cycles per worker) | `docs/patterns/compliance/aca.md` | TempWorks ACA Employee Cycles |
  | `/compliance/workers-comp` (payroll by state → class → worker; straight time, overtime premium, double-time premium separate; export) | `docs/patterns/compliance/workers-comp.md` | Patriot Workers' Comp Wages report |
  | `/settings/compliance` (registrations, workers' comp policy, ACA periods) | `docs/patterns/settings/compliance.md` | Vanta document renewal settings |
  | `src/pdf/il-registration-proof.tsx` | `docs/patterns/_documents/il-registration-proof.md` | Layout as `_documents/statement.md`; content from § 85 |
  | `src/pdf/ma-job-order.tsx` | `docs/patterns/_documents/ma-job-order.md` | 454 CMR 24.08 contents + DLS multilingual statement |
  | `src/pdf/wc-audit-packet.tsx` | `docs/patterns/_documents/wc-audit-packet.md` | Patriot report + Rule 2-C-2-a |

  The Illinois proof page holds:
  - agency legal name, IDOL registration number, year and expiry, registered branches;
  - workers' comp carrier;
  - the line "verify at" with IDOL's list URL; the date printed.
- **J7. Illinois equal-pay rate (finishes decision C3).** A **wage-rule change, so it needs a second opinion.**
  - `equal_pay_rates` per worker × client: method (comparator / BLS median / BLS 75th), straight-time rate in cents, benefits cash equivalent per hour, comparator seniority months or SOC, the client's data as evidence, effective from the crossing.
  - The engine pays max(rate card, equal-pay rate) from the crossing, plus a benefits-cash line.
  - **The hold starts the week after a crossing with no rate on file.**
  - The § 10(a)(7) notice fields come from this row.
- **J8. Reminders.**
  - In-app Due-soon counts in the sidebar.
  - A weekly email digest to the Owner through the existing sender (Bullhorn digest; Vanta per-item alerts). In the demo it goes to the demo mailbox, so no external calls.
  - Optional .ics feed (Linear cycles); owner decides.
- **J9. Roles.**
  - Owner: everything.
  - Coordinator: completes worker and assignment items.
  - Billing: client proof pages.
  - Accountant: reads everything.
- **J10. Demo seed** (today 2026-10-16):
  - Illinois agency and Joliet branch registration expiring 2026-12-31: **Due soon** (renewal by 2026-11-01).
  - Massachusetts registration expiring 2026-11-20: Due soon (by 2026-10-21).
  - Prairie Line proof pages: Mar 1 and Sep 1 2026 done, with the generated PDF attached; Mar 1 2027 upcoming.
  - A Massachusetts job order per Harborview assignment: done, except one **Overdue**.
  - I-9 hire dates for all 40 workers: one Section 2 due, one reverification within 90 days (no immigration details).
  - An opening balance that makes one Illinois worker cross 720 h in week 2.
  - A workers' comp policy for 2026, carrier "(demo)".
  - ACA settings with 12 months of imported monthly hours.
  - No New Jersey client.
- **J11. Tests.**
  - Golden generator cases: Mar 1/Sep 1 per client; the Nov 1 Illinois lead; Massachusetts first-pay-period and daily-pay cases; Section 2 across a weekend; retention max(); the ACA limits including the first-anniversary cap; the integer full-time test; the workers' comp packet tying to export control totals with the overtime premium split.
  - Second opinion on J7 and on the packet (an export).

### Open questions for the owner (one at a time)

1. Do you place workers in New Jersey? If not, may we leave New Jersey out of the demo?
2. Should Shiftbook also track Illinois yearly safety training per worker per client? It is the law, but not in SPEC.
3. Do you want Shiftbook to hold copies of I-9 forms, or only their dates (recommended)?
4. When does your workers' comp policy year start, and who is your carrier?
5. Do you use a 12-month ACA measurement period, and which month does it start?
6. Should the Illinois proof page be sent automatically before March 1 and September 1, or only printed?
7. May the Illinois equal-pay hold start the week after a crossing with no rate on file (decision C3)?
