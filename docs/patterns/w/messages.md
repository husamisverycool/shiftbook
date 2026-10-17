# Pattern: Messages with the agency (`/w/messages`)

Status: adopted — slice t (2026-10-17)
Reference product and screen: WhatsApp chat (one thread, newest at the bottom, each message with its
time, the field and Send at the bottom)
Source URL: https://faq.whatsapp.com/
Researched: 2026-10-17 (`docs/research/workers-app-slice-t.md` §5). Confidence: medium.

## Hierarchy
1. Title: the agency's name.
2. The thread: the worker's messages on the right, the agency's on the left with who wrote them;
   each with its time; a translation under a message written in the other language, marked
   "Translated".
3. At the bottom: a text field and **Send**.

## States
- Empty: one line inviting a first message.
- Demo: translations come from a fixed demo list; the demo makes no outside calls.

Deviations allowed: none
