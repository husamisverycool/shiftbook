-- The product is renamed Tabulado (owner, 2026-10-19): the Illinois equal-pay rule's note says so in the
-- database too, as it does in src/server/rules/reference-data.ts. Only the product's name changes; the law
-- cited does not.
UPDATE equal_pay_rules
SET citation = replace(citation, 'The 600-hour heads-up is Granite''s (SPEC §9), not law.', 'The 600-hour heads-up is Tabulado''s (SPEC §9), not law.')
WHERE rule_code = 'il_dtlsa_equal_pay' AND citation LIKE '%The 600-hour heads-up is Granite''s%';
