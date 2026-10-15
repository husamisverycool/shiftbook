# 0008 — Local wage rules matched by Census place codes

Status: accepted
Date: 2026-10-15

## Context
The third second-opinion review found that worksite county and city typed as text ("County of Cook",
"Cook Co.", "Chicago, IL") slipped past local-ordinance matching and were paid at the state rate.

## Decision
Worksites carry a 5-digit county FIPS code and a 7-digit place code, or an explicit "outside any
city or town" flag; local rule rows carry the same codes. Names are never matched. A missing place
code is unknown and holds the week; codes are format- and state-checked in the engine and by
database constraints. Source: U.S. Census Bureau ANSI/FIPS code files (the demo codes were verified
against the 2020 files by the fourth review).

## Alternatives considered
Smarter name normalisation: always one spelling away from paying the wrong rate.

## Consequences
The worksite editor (slice b) must pick places from a Census list, not free text. Codes are only
format-checked today: a real-looking but wrong code would not be caught. New England town
ordinances (county subdivisions) need their own code type when one is modelled.
