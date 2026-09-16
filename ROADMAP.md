# TeachToComply AI — 24-Hour Build Roadmap

**Concept:** Employees teach a naive AI avatar their company's Generative AI / data-rights / IP policy. The AI pushes back with realistic compliance traps (PII leaks, copyright misuse, data-sharing mistakes); the employee must catch and correct each one. Live visuals (risk meter, data-flow diagram, copyright inspector) react to how the conversation goes, and a scoring engine tracks mastery.

**Goal for the 24 hours:** a working, demoable slice — one full "teach → trap → correct → score" loop, with at least one live visual reacting to it. Everything else is a stretch goal.

---

## MVP scope (what "done" means at hour 24)

- Employee can type (or speak) an explanation of one policy topic (e.g. "don't paste client PII into public LLMs").
- AI avatar responds with a scripted-but-dynamic misconception ("what if I just rename the file first?").
- Employee corrects it; system classifies the correction as right/wrong/partial.
- One visual (Risk Meter is the cheapest to build) updates live based on correctness.
- A running compliance score is shown at the end.
- 3-minute demo script + slides.

Everything below that (multiple policy modules, voice input, the full data-flow diagram, copyright inspector, persistent user accounts) is a stretch goal — cut ruthlessly if behind schedule.

---

## Suggested stack (optimized for speed, not scale)

- **Frontend:** Next.js (React) + Tailwind — fast to scaffold, good for live-updating visuals.
- **Backend:** Next.js API routes or a thin FastAPI service if the team prefers Python.
- **AI:** Claude API for the misconception generator + correctness grader (one system prompt encoding the company policy + trap patterns; structured JSON output for "is this correction right?").
- **State:** In-memory / localStorage for the hackathon — no need for a database unless there's time left over.
- **Visuals:** Simple SVG/CSS-animated gauge for the Risk Meter; skip charting libraries unless someone already knows one cold.

---

## Hour-by-hour plan

### Hours 0–2: Setup & alignment
- Lock the MVP scope above as a team (resist scope creep now, not at hour 20).
- Scaffold repo: frontend app, backend/API stub, env vars, deploy target (Vercel/Render) wired up **immediately** so "it deploys" is never a surprise at the end.
- Write the one policy module you'll demo (pick ONE: PII-in-prompts, or image-copyright, or data-residency — not all three).
- Sketch the 3 screens: chat view, risk meter, score summary.

### Hours 2–6: Core conversation loop
- Write the Claude system prompt for the AI avatar: persona (eager, naive intern), the target policy, and a bank of 3–5 misconception "traps" it can pull from.
- Write the grading prompt: given the employee's correction, classify `correct / partial / incorrect` + a one-line reason, as structured JSON.
- Build the chat UI (message list + input) wired to these two calls.
- **Checkpoint:** by hour 6 you should be able to have one full back-and-forth exchange end-to-end, even if ugly.

### Hours 6–10: Scoring + risk engine
- Turn grader output into a running score (simple weighted tally: correct=+10, partial=+3, incorrect=-5).
- Map each trap to a risk category (PII leak, IP violation, etc.) so the score isn't just a number but tied to a visible risk type.
- Build the Risk Meter component (SVG gauge or animated bar) driven by the running score.
- **Checkpoint:** chat interaction visibly moves the risk meter.

### Hours 10–14: Second visual + polish the loop
- Add one more visual if on schedule: the Data Flow Diagram (static diagram with a highlighted path that switches "safe/unsafe" color) is the next cheapest after the risk meter. Skip the Copyright Inspector unless well ahead of schedule.
- Tighten the AI persona's tone — this is what sells the demo emotionally, worth real polish time.
- Add a "session summary" screen: final score, traps caught, traps missed.

### Hours 14–18: Integration + UX pass
- Full run-through as if you were the judge: does the flow make sense with zero explanation?
- Fix the rough edges: loading states while Claude responds, error handling for API failures, mobile/projector-friendly layout.
- Freeze features. From here on, only bug fixes.

### Hours 18–20: Testing & hardening
- Run the demo scenario 5+ times end-to-end, including deliberately wrong employee answers, to make sure grading doesn't break.
- Fix anything that broke the demo path. Do not fix anything that doesn't.
- Confirm the deployed URL actually works (not just localhost).

### Hours 20–22: Demo prep
- Write a tight 3-minute script: problem (30s) → live demo (90s) → why it wins the track (60s).
- Build 3–5 slides max: title, problem, how it works (the pipeline diagram from the pitch), why small businesses need this, what's next.
- Assign who drives the live demo vs. who talks — rehearse once.

### Hours 22–24: Buffer & submission
- This block is intentionally empty. Something will have gone wrong earlier — this is where you fix it.
- Final rehearsal.
- Submit: repo link, deployed link, demo video/slides per hackathon requirements.

---

## Cut list (in order, if you're behind)

1. Data Flow Diagram / Copyright Inspector visuals — keep only the Risk Meter.
2. Multiple policy modules — keep just one.
3. Voice input — text only.
4. Persistent scoring across sessions — single-session only.
5. Polished persona writing — functional over charming, if it must ship.

Never cut: the end-to-end loop working live, and the deployed URL working.
