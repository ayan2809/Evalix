# Project Operating Rules & Agent Guidelines — Evalix

> **Purpose:** This file defines the mandatory operating protocols, architectural guardrails, and collaboration rules for any AI agent or developer working on the **Evalix** repository. Any agent initiating work on this workspace **must read and adhere to these rules first**.

---

## 1. Prime Directive: Continuous Co-Creation Logging

* **Mandatory Rule:** **Every single user prompt, architectural dialogue, technical decision, and thought process must be logged in `thinking.md`.**
* **Why:** The author (Ayan Sadhukhan, Software Engineer II at JPMorgan Chase) maintains radical transparency for hackathon evaluators, open-source contributors, and hiring managers. Judges must be able to audit exactly how human domain expertise drove every stage of development.
* **How to update:**
  * Whenever the user speaks, discusses, or refines an idea in the chat, update `thinking.md` under a dedicated phase/prompt section before concluding the turn.
  * Record the exact user prompt (verbatim or key excerpts), the underlying engineering intent, the collaborative synthesis, and any resulting technical decisions.

---

## 2. Project Vision & Architecture Boundaries

* **Core Mission:** **Evalix** is a framework-independent benchmarking and chaos evaluation platform for autonomous AI agents (Problem Statement 02 of the Geek Room Global AI Hackathon).
* **Key Architecture Pillars:**
  1. **Framework Independence:** Agents (LangChain, CrewAI, AutoGen, or vanilla HTTP/CLI) are treated as black boxes via standard JSON input/output schemas or Model Context Protocol (MCP). No agent rewrites allowed.
  2. **Active Chaos Engineering:** Unlike passive observers (Arize Phoenix, Datadog), Evalix actively injects faults: HTTP 429 rate limits, 500 tool crashes, schema mismatches, empty search payloads, and stale web contexts.
  3. **Strict Reliability (`pass^k` over `pass@k`):** Production agents must be evaluated on statistical consistency ($(\text{accuracy})^k$) across multiple runs, measuring variance and failure recovery.
  4. **Multi-Turn Synthetic Simulation:** Ingesting PRDs/flows to generate synthetic user personas and multi-turn dialogues to test agents pre-release.
* **Dual-Track Technology Integration:**
  * **Bifrost by Maxim AI:** Open-source AI gateway managing model routing, caching, budget caps, and failover telemetry.
  * **Tavily:** Search API serving as the live tool for the built-in research agent testbed.

---

## 3. Git & Branching Strategy

* **Active Feature Branch:** `feature/research`
* **Base Branch:** `main`
* **Workflow:**
  * All active research, architectural docs, benchmarks, and prototype code must be committed and pushed to `feature/research`.
  * **Never push directly to `main`** without explicit user instruction.
  * Keep Pull Request [#1](https://github.com/ayan2809/Evalix/pull/1) updated with clear commit messages and documentation links.

---

## 4. Code & Environment Standards

* **Language & Frameworks:** Python 3.10+ (FastAPI for backend/runner), clean modular architecture.
* **Security & Secrets:**
  * **Never commit API keys or secrets.** Use `.env` (which is strictly ignored in `.gitignore`).
  * Ensure dummy/mock fallbacks exist for automated CI testing so tests pass without live billable credentials.
* **File References:** Always maintain clickable relative markdown links (`./thinking.md`, `./README.md`, `./HACKATHON_GUIDE.md`, `./AGENT_BENCHMARKING_AND_EVALS_GUIDE.md`).

---

## 5. Frontend Design & UI/UX Operating Rules

Any UI developed for Evalix must strictly comply with these design principles:
* **Radical Minimalism & Clean Aesthetic:**
  * Clean, distraction-free interface with generous breathing room and purposeful hierarchy.
  * No visual clutter, flashy animations, or unnecessary nested widgets.
* **Universal Accessibility (Engineers, PMs, & Non-Technical Stakeholders):**
  * The interface must be instantly intelligible to **Product Managers, Journey Owners, Executives, and Engineers alike**.
  * Anyone unfamiliar with AI evaluation should be able to open the dashboard and immediately understand: *Did the agent succeed? Where did it stumble? What did it cost?*
* **Jargon-Free Clarity:**
  * Avoid raw, intimidating ML/eval jargon. Present plain-language metrics with intuitive labels and progressive disclosure (e.g., label $pass^k$ clearly as **"Success Consistency (3/3 Runs)"**, with technical formulas tucked into helpful tooltips).
  * Clear visual badges (Pass / Fail / Recovered) rather than wall-of-text error logs.
* **Zero Context Overload & Low Device Footprint:**
  * Avoid dumping multi-megabyte raw JSON traces onto the browser DOM.
  * Use lazy-loaded, collapsible step accordions, pagination, and virtualized trace views so the UI never causes client-side memory spikes, device lag, or cognitive fatigue.

---

## 6. Core Reference Documents

Before making architectural suggestions or writing code, consult:
1. `thinking.md` — The historical reasoning, prompt transcripts, and design evolution.
2. `AGENT_BENCHMARKING_AND_EVALS_GUIDE.md` — Complete production metric taxonomy (`pass^k`, trajectory efficiency, chaos taxonomy).
3. `HACKATHON_GUIDE.md` — Hackathon rules, deadlines (Nov 15, 2026), prizes, and track constraints.
4. `problem_statements/` — Original challenge briefs and PDF specifications.
