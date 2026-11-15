# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

* **First: people who build AI agents.** They have an agent that works when everything goes right, and they
  want to know what it does when a tool fails, a search result lies, or the model is too busy. They point
  Evalix at the agent, run a benchmark, and read where it slipped and why.
* **Also: hackathon judges** (Geek Room, PS 02, Bifrost and Tavily tracks; deadline Nov 15, 2026,
  23:59 IST). They watch a live run and need to see who held up within seconds.

## Product Purpose

Evalix tests how AI agents behave when things break. It asks agents everyday research questions, causes
problems on purpose (broken tool, slow tool, empty result, lying result, misleading instruction, busy model,
tool gone), and grades each run with fixed rule checks. Success means a builder can see which problems their
agent survives, which it doesn't, and the exact step where it went wrong.

## Positioning

Two claims carry equal weight:

1. **Stress tests for any agent, with no code changes.** Each run gets its own tool address and model
   address, so Evalix can inject faults into an agent built with any framework (plain Python, LangChain,
   Google ADK, or one made in Agent Studio). Grading is plain rule checks first; an AI second opinion is
   optional.
2. **Live proof that the gateway copes.** Every model call goes through Bifrost. The Gateway page follows one
   real call through Bifrost's stops (key, limits, route, cache, retry, backup, log) and lets you break five of
   them live: a model the key isn't allowed, a spending limit, a calls-per-hour limit, a busy model, and a main
   model that's down. Members' own runs also go through a Bifrost key with a daily budget.

## Operating Context

* Runs on one machine: FastAPI backend (:8000), Bifrost (:8080), sample agents (:9001–9004), web app (:5173),
  started with `./scripts/dev.sh` (`--mock` for test mode with no keys).
* Agents are separate HTTP programs that answer `POST /run`.
* Search uses saved Tavily results by default, or the live web.
* Results can be sent to Maxim as traces.
* Sign-in: Google, "continue on this computer" when Google isn't set up, or look around as a guest.
* Workspaces: the owner (`EVALIX_OWNER_EMAILS`) uses the main workspace and Settings. Every other Google account
  is a member with its own workspace that starts empty, and a daily allowance ($0.25 of model calls, 60 live
  searches) because members run on the owner's keys. Guests see the main workspace read only, as an example.

## Capabilities and Constraints

* The API contract is `spec/api.md`; it wins over the code when they disagree.
* Models: Gemini 3.5 Flash Lite (agents) and Gemini 3.8 Flash (second opinion), chosen in Settings and applied
  to the next run only.
* Terms used in the UI: "run", "problem" (a fault we cause), "everyday question" (a task), "got through",
  "slipped", "crashed", "second opinion", "Agent Studio" (where agents are made from a sentence).
* Screens carry no explanations; the **How it works** page and a first-visit tour do that once.
* Open: whether Quick Answer should be made weaker (human queue Q3); whether to keep four answer values taken from
  third-party pages (Q4); whether to reuse an existing Google sign-in client ID (Q5).

## Brand Commitments

* Never name the author's employer, in any file, commit, code comment, prompt log or screen.
* Bank and card examples stay limited to the ones already approved: Capital One Venture X and Bank of America Advantage Plus.
* The interface never uses the word "demo".

## Evidence on Hand

* A real benchmark (Nov 14, 2026): 5 agents, 65 runs, one try each, $0.17 in total. Fact Checker got through 7 of 7
  problems, Research Assistant 7, Web Analyst 7, the Studio agent 5, Quick Answer 4. Stored in `backend/evalix.db`.
* Live gateway runs through Bifrost v2.5.1: fallback 6 of 6 calls answered by the backup with 0 errors; retry
  answered on the 3rd try (waits about 1 s and 2.4 s); a $0.01 limit stopped an agent after about 10 calls.
* A member's real run on Nov 15, 2026 (Fact Checker, one question and one problem): both got through, $0.0048,
  every model call made with that member's own Bifrost key.
* No users, customers, testimonials or press exist yet. Do not invent them.

## Lessons from earlier judging

The author's previous hackathon project scored 26 of 30. The judges' main note: "synthetic data limits real-world
validation." So Evalix leans on real things: people test their own agents in their own workspace, runs use real
models and can use live web search, and every gateway claim comes from a real call and Bifrost's own log.
Presentation also lost a point, so a first-time visitor must be able to understand the product without help.

## Product Principles

1. **Show where it broke, not just a score.** Every result links to the step where things went wrong.
2. **Fair by construction.** Every agent gets the same questions, the same problems and the same answer key.
3. **Prove it live.** Anything claimed about agents or the gateway can be re-run on the spot with real calls.
4. **Works with whatever you built.** No changes to the agent's code, no framework lock-in.
