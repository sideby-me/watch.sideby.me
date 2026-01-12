# UI Copy and Language

This guide summarizes how to write UI copy for watch.sideby.me.

The persona: **a smart, nerdy friend who actually gets it** — someone who's genuinely passionate about real‑time tech and online collaboration, and refreshingly honest about why most tools in this space kind of suck.

---

## Core Voice Principles

### Genuine Enthusiasm

- Get excited about solving real problems, not just shipping features.
- Use conversational language that treats people as peers, not metrics.
- Celebrate small wins and acknowledge weird edge cases.
- Be genuinely helpful without layering on corporate‑speak.

### Technical Authenticity

- Use technical terms when they’re the right words, and explain why they matter when needed.
- Reference the real challenges of building real‑time systems (WebRTC, latency, sync, etc.).
- Be honest when something is genuinely hard to build ("WebRTC can be finicky sometimes").
- Share the _why_ behind technical behavior or limitations, not just the _what_.

### Internet‑Native Humor

- Reference memes and internet culture when it feels natural, not forced.
- Make jokes about universal collaboration pain points ("quick sync" that’s never quick, broken screen sharing, flaky voice).
- Use self‑deprecating humor about the platform’s limitations, not about users.
- Deploy sarcasm against bad UX patterns in the industry, never against struggling users.

### Honest Transparency

- Own mistakes and rough edges openly.
- Explain what we’re working on and why it might be slow or tricky.
- Acknowledge when other tools currently do something better.
- Call out industry BS while still focusing on building something genuinely useful.

---

## Psychological Calibration

### Building Genuine Trust

- Be honest about what works well and what doesn’t (yet).
- Explain technical trade‑offs in human terms (e.g. latency vs reliability).
- "Show your work" when it helps—surface enough of the engineering thinking to feel real, not magical.

### Respectful Competence

- Assume users are smart, even if they don’t know this specific domain.
- Use jargon when it’s precise, but translate or briefly explain when it’s helpful.
- Teach concepts through doing and micro‑explanations, not lectures.

### Cultural Fluency

- Stay current with developer/creator culture and the realities of remote collaboration.
- Reference shared experiences of watch‑party and collaboration pain.
- Respect the communities we’re serving; don’t stereotype them.

---

## Content Application Framework

### Error Messages

Make technical failures feel like shared frustrations, not user failures.

- Bad: "Connection failed. Retry?"
- Good: "Oof, the internet gremlins got us. WebRTC can be finicky sometimes—want to give it another shot?"

Room‑specific examples:

- Locked room: "This room is locked right now. The host isn’t letting new people in (yet)."
- Passcode: "This room needs a passcode. Ask your host nicely—or very dramatically, your call."
- Capacity: "Whoa, it’s a full house. Someone needs to leave before you can hop in."

### Feature Announcements

Share the journey, not just the destination.

- Bad: "New feature available."
- Good: "We finally cracked that subtitle sync bug that was driving everyone (including us) slightly mad. Huge thanks to the folks who sent extremely detailed repro steps."

### Loading States

Give context for waiting and make it feel like progress is happening.

- Bad: "Loading..."
- Good: "Herding all the packets into formation… (WebRTC handshakes are weirdly complex)."

Examples for watch.sideby.me:

- Video resolving: "Checking your video link so it doesn’t explode everyone’s player…"
- Joining room: "Sneaking you into the room and syncing the timeline…"

### Community Guidelines / Social Copy

Set expectations like a good host.

- Bad: "No spoilers allowed."
- Good: "Please don’t be that person who spoils the plot twist. We’re all here for the same chaos, and surprises are half the fun."

---

## Domain Adaptation Examples

- Entertainment collaboration: "Finally, a watch party that doesn’t require a degree in network engineering to set up."
- Productivity collaboration: "Making screen sharing and sync actually work on the first try. Revolutionary, we know."
- Creative collaboration: "Built for people who know a ‘quick sync’ is never actually quick—but should at least be possible."

Use these as patterns, not as the only allowed lines.

---

## Concrete Language Guidelines

- Prefer short, direct sentences.
- Make the outcome explicit: what happened, what changed, what’s blocked.
- When possible, suggest what the user can try next.
- Match the app’s overall tone across features (room, chat, video sync, media, subtitles) so nothing feels like it came from a different product.

---

## Voice Guidelines

**Always:**

- Be genuinely excited about solving collaboration problems.
- Acknowledge the technical complexity behind seemingly simple features (sync, media, real‑time chat).
- Use humor to reduce friction, never to exclude or belittle.
- Treat platform limitations as shared challenges, not secrets.
- Reference internet culture authentically when it fits.

**Never:**

- Mock users for not understanding technical concepts.
- Hide behind vague or corporate language when something breaks.
- Force memes or references that don’t fit naturally.
- Pretend the platform is perfect when it’s not.
- Talk down to people who are learning.

---

## Testing Your Copy

Before shipping any user‑facing text, ask:

- Would this make a developer / power user _smile_ while actually being helpful?
- Does this acknowledge the real complexity without overwhelming people?
- Would someone frustrated with other tools feel understood when they read this?
- Does this sound like something a smart, nerdy friend would actually say?

If the answer is "no" to any of these, iterate.
