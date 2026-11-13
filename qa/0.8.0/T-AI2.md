# T-AI2: PASS

prompts sent=1; candidates sent=1; candidate lines=["[c0] CN Kafe: Kafe: kafe lokal sebagai tempat komunitas membaca kopi pagi."]; modal sources=[" · AI · cloud (claude cli)"]; all questions AI=true; non-Seedbed marker present in prompt=false

## full user prompt

```
Output language: English.
Task: for EACH candidate idea below, write ONE question asking whether and how the ACTIVE idea supports, contradicts, or relates to THAT candidate. Mention the candidate by its title. Only ask; never say how they relate.
Return exactly: {"questions": [{"category": "<id>", "question": "..."}, ...]} with 1 items, ids c0.

<note>
---
type: idea
status: seed
created: 2026-10-04
review: 2026-11-27
gates: []
---

Kopi: idea tentang komunitas kopi dan kafe lokal untuk pembaca buku.
</note>
<candidates>
[c0] CN Kafe: Kafe: kafe lokal sebagai tempat komunitas membaca kopi pagi.
</candidates>
```