# Global AI Hackathon (Geek Room) — Comprehensive Event & Track Guide

> **Event Dashboard:** [Manage Registration](https://hackculture.io/my-events/manage/6ad854a1566c2195397af37a)  
> **Public Event Page:** [Global AI Hackathon on HackCulture](https://hackculture.io/hackathons/ai-global-hackathon)  
> **Official Discord:** [Geek Room Discord](https://discord.gg/STHG8YQdd) *(Mandatory for announcements & support)*  
> **Organizer:** Geek Room  
> **Title Partner:** Bifrost by Maxim AI  
> **Track Partner:** Tavily  

---

## 1. Executive Summary & Critical Timeline

| Parameter | Details |
| :--- | :--- |
| **Current Date** | November 14, 2026 |
| **Submission Deadline** | **November 15, 2026 at 18:29 UTC (23:59 IST)** ⚠️ *Under 24 hours remaining* |
| **Team Size** | 1 to 4 members |
| **Format** | 100% Online / Virtual |
| **Judging Round** | November 29, 2026 (13:30 – 18:29 UTC) |
| **Total Prize Pool** | \$1,000 USD Cash + \$60,000 Tavily Credits + Omnidimension Voice Credits + Certificates |

---

## 2. Participation Tracks & Submission Modes

Participants can tackle challenges from **Bifrost by Maxim AI** (AI Gateway / Infrastructure) and **Tavily** (Search / Real-Time Information Retrieval).

You have **3 submission strategies**:

1. **Combined Project (Recommended for maximum score):**
   - Address a primary Bifrost problem statement and integrate Tavily (or vice versa).
   - Demonstrates multi-technology synergy (e.g., Bifrost for model gateway/routing/caching + Tavily for real-time web retrieval).
2. **Single Track Project:**
   - Choose exactly 1 problem statement from either Bifrost or Tavily.
3. **Two Separate Projects:**
   - Submit two independent projects (one for Bifrost and one for Tavily) using the dual submission fields in the official submission form.

> [!IMPORTANT]
> A single team is eligible to win prizes across **both** tracks if submitting dual/integrated solutions.

---

## 3. Official Rules & Deliverables

### Mandatory Deliverables (Submission Phase)
1. **GitHub Repository URL** (Required):
   - Repository must be public.
   - Comprehensive `README.md` covering: problem statement tackled, architecture, installation/setup instructions, technologies used, and explanation of how AI is leveraged.
2. **Presentation / Pitch Deck (PPT)** (Required):
   - Slide deck detailing the problem, solution, technical architecture, and results/demo walkthrough.
3. **Demo Video Link** (Optional but strongly recommended):
   - YouTube / Loom / Drive video demonstrating the live functioning prototype.
4. **Live Deployed URL** (Optional):
   - Working deployment or hosted service.

### General Hackathon Rules
- **Core Build Period:** Core project development must be conducted during the hackathon period (1–15 Nov 2026). Existing open-source libraries, boilerplates, and frameworks are permitted.
- **AI Tooling Disclosure:** Using AI APIs, agents, and frameworks is encouraged; explicitly disclose your tech stack in your README.
- **No Plagiarism:** All code must be original or appropriately licensed.
- **Evaluation Criteria:**
  - **Innovation & Originality**
  - **Technical Execution & Robustness**
  - **Meaningful Use of AI** (Bifrost / Tavily integration)
  - **Problem Impact & Relevance**
  - **User Experience (UX / DX)**
  - **Scalability & Architecture**

---

## 4. Participant Perks & Free API Credits

- **Tavily API Credits:**  
  - **8,000 free search credits** per participant.  
  - **Redemption Code:** `GEEKROOM2`  
  - **Redeem at:** [https://app.tavily.com/home](https://app.tavily.com/home) *(Valid until Nov 28, 2026)*.
- **Bifrost AI Gateway (Maxim AI):**  
  - Open-Source Gateway Repo: [github.com/maximhq/bifrost](https://github.com/maximhq/bifrost)  
  - Technical Documentation: [docs.getmaxim.ai](https://docs.getmaxim.ai)  
  - *Perks:* \$1,000 cash prize pool, direct hiring/interview opportunities with Maxim AI.
- **Omnidimension Voice AI:**  
  - \$50 USD Voice AI credits for builders and winners.

---

## 5. Detailed Problem Statements

There are 6 official problem statements across the Bifrost and Tavily tracks.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   GLOBAL AI HACKATHON THEMES                           │
├──────────────────────────────────┬─────────────────────────────────────┤
│   BIFROST BY MAXIM AI TRACK      │            TAVILY TRACK             │
│   (AI Gateway, Ops & Agents)     │   (Fact Verification & Research)    │
├──────────────────────────────────┼─────────────────────────────────────┤
│ PS 01: Low-Token Coding Agent    │ PS 05: Pre-Meeting Briefing Agent   │
│ PS 02: AI Agent Benchmark Plat.  │ PS 06: Stale-Answer Detector Layer  │
│ PS 03: Autonomous Pentest Agent  │                                     │
│ PS 04: Open-Source Bifrost Ext.  │                                     │
└──────────────────────────────────┴─────────────────────────────────────┘
```

---

### Problem Statement 01: Build a Coding Agent That Gets the Job Done on the Fewest Tokens
* **Track:** Bifrost by Maxim AI  
* **Format:** CLI, IDE extension, or local server  
* **Reference PDF:** [problem_explanation_q2jha91frd9.pdf](https://hackcultureplatform.blob.core.windows.net/event-assets/hackathons/6ac5c8240037f69fb28e23ec/problem_explanation_q2jha91frd9.pdf)

#### Problem Context:
AI coding agents burn excessive tokens and costs by rereading identical files, resending bloated context, and invoking heavy frontier models for simple tasks.

#### Core Goal:
Build a functional coding agent that executes real development tasks correctly while drastically cutting token consumption, enforcing budget limits, and guaranteeing privacy.

#### Mandatory Requirements:
1. **Reliability & Model Failover:** Continue executing through provider rate limits or outages without losing session context; notify the user when fallback models engage.
2. **Budget Management:** Enforce hard per-user or per-session spending caps before model invocation, with graceful degradation.
3. **Code Privacy:** Repositories marked `confidential` must strictly route only to local models (e.g. Ollama/vLLM), ignoring contradictory prompt instructions.
4. **Action Approval Gate:** Read operations are automated; write operations, shell commands, and Git operations require explicit user approval. Prompts cannot bypass this gate.

---

### Problem Statement 02: Build a Benchmarking Platform for AI Agents, Not Just Models
* **Track:** Bifrost by Maxim AI  
* **Format:** Web Platform / CLI Suite  
* **Reference PDF:** [problem_explanation_ck1ellfr6qh.pdf](https://hackcultureplatform.blob.core.windows.net/event-assets/hackathons/6ac5c8240037f69fb28e23ec/problem_explanation_ck1ellfr6qh.pdf)

#### Problem Context:
Standard benchmarks test LLM weights, not agentic architectures (prompts, tool loops, memory, retries). Two agents using the identical model can have vastly different success rates and cost profiles.

#### Core Goal:
Build a framework-agnostic benchmarking platform that tests and compares agents in a target domain (e.g., coding, research, or support) on identical challenges.

#### Mandatory Requirements:
1. **Framework Independence:** Evaluate agents regardless of framework (LangChain, CrewAI, AutoGen, custom vanilla scripts) without code rewrites.
2. **Consistent Metrics:** Track task success, step count, tool call volume, token consumption, cost, and latency.
3. **Repeatability:** Run multi-iteration trials to measure statistical reliability rather than single-run luck.
4. **Failure Injection:** Test agent resilience against simulated environment faults (broken tools, rate limits, misleading prompts).
5. **Comparison & Trace UI:** Visual dashboard with step-by-step trace inspection and comparative run diffs.

---

### Problem Statement 03: Build an Agent That Pentests a Target on Its Own
* **Track:** Bifrost by Maxim AI (Security Track)  
* **Format:** Autonomous Security Agent  
* **Reference PDF:** [problem_explanation_lawn3ha165.pdf](https://hackcultureplatform.blob.core.windows.net/event-assets/hackathons/6ac5c8240037f69fb28e23ec/problem_explanation_lawn3ha165.pdf)

#### Problem Context:
Penetration testing requires adaptive reasoning, contextual interpretation of scanner output, and multi-step pivoting rather than static command execution.

#### Core Goal:
Build an autonomous penetration-testing agent capable of operating inside an isolated laboratory environment, exploring unfamiliar targets, and achieving security goals without human intervention.

#### Mandatory Requirements:
1. **Target Discovery:** Enumerate authorized hosts, ports, services, and versions using standard security tools (nmap, nikto, etc.).
2. **Autonomous Reasoning:** Parse scanner outputs, decide subsequent attack vectors, and recover from failures autonomously.
3. **Objective Execution:** Combine actions to reach defined CTF/security flags or goals within the testbed.
4. **Strict Scope Control:** Adhere rigidly to provided scope boundaries; interacting with out-of-scope targets is an automatic failure.
5. **Actionable Reporting:** Produce structured remediation reports with findings, severity scores (CVSS), technical evidence, and patch advice.

---

### Problem Statement 04: Build a Feature the Open-Source Gateway Is Missing
* **Track:** Bifrost by Maxim AI (Contributor Track)  
* **Format:** Open-Source Contribution / Extension  
* **Reference PDF:** [problem_explanation_xssoky9neyn.pdf](https://hackcultureplatform.blob.core.windows.net/event-assets/hackathons/6ac5c8240037f69fb28e23ec/problem_explanation_xssoky9neyn.pdf)

#### Problem Context:
Production AI applications rely on gateways for caching, intelligent routing, security, and observability. The open-source Bifrost gateway has extension points for developer contributions.

#### Core Goal:
Develop and test a production-grade extension or feature that solves a concrete problem for gateway operators or application developers.

#### Mandatory Requirements:
1. **Real Operator Problem:** Solve a clear developer pain point (e.g., custom provider adapter, semantic vector cache, MCP gateway integration, policy manager).
2. **Public Extension Points:** Use official Bifrost plugin, logging, routing, or MCP hooks.
3. **Reproducible Integration:** Work seamlessly on top of standard Bifrost installation with clear documentation.
4. **Upstream PR Quality:** Include unit/integration tests, clean architecture, and documentation suitable for upstream pull request consideration.

---

### Problem Statement 05: Build a Pre-Meeting Briefing Agent
* **Track:** Tavily  
* **Format:** Research Agent / Web App / Slack Bot / CLI  
* **Reference PDF:** [problem_explanation_a1nx56ua55u.pdf](https://hackcultureplatform.blob.core.windows.net/event-assets/hackathons/6ac5c8240037f69fb28e23ec/problem_explanation_a1nx56ua55u.pdf)

#### Problem Context:
Professionals spend hours manually gathering fragmented news, leadership updates, product launches, and financial reports prior to sales, investment, or partnership meetings.

#### Core Goal:
Build an AI research agent that accepts a company/person name and a meeting timestamp, executes focused research over the preceding 30 days, and produces a verified 1-page intelligence brief.

#### Mandatory Requirements:
1. **Context Ingestion:** Take company or individual name and meeting context.
2. **30-Day Temporal Research:** Filter web research to identify meaningful recent developments (funding, hiring, news, launches) within the last 30 days.
3. **Concise One-Pager:** Generate a clean, high-density briefing document.
4. **Direct Source Attribution:** Every factual claim must link to verified citations.
5. **Actionable Strategic Insights:** Provide high-impact questions and conversational hooks tailored to the meeting.

---

### Problem Statement 06: Build a Stale-Answer Detector for AI Applications
* **Track:** Tavily  
* **Theme:** AI-Powered Fact Verification & Information Freshness  
* **Format:** Verification Middleware / Web App / API  
* **Reference PDF:** [problem_explanation_urf74r9ydml.pdf](https://hackcultureplatform.blob.core.windows.net/event-assets/hackathons/6ac5c8240037f69fb28e23ec/problem_explanation_urf74r9ydml.pdf)

#### Problem Context:
LLMs hallucinate or provide obsolete answers regarding fast-moving data: pricing tables, API endpoints, regulations, executive moves, or software releases.

#### Core Goal:
Build a verification layer that inspects any LLM response, extracts time-sensitive claims, checks them against live web sources, and computes freshness/accuracy scores.

#### Mandatory Requirements:
1. **Claim Extraction:** Parse an AI answer to detect verifiable, time-sensitive factual propositions.
2. **Staleness Risk Detection:** Classify claims sensitive to deprecation (pricing, API methods, laws, leadership).
3. **Live Web Verification:** Query live web sources using Tavily to find authoritative, current ground truth.
4. **Freshness Scoring & Diffing:** Score claim veracity and freshness; highlight outdated information alongside updated current data.

---

## 6. Strategic Comparison & Selection Matrix

With the submission deadline on **November 15, 2026**, here is an analysis to help you decide which problem statement to build:

| Problem Statement | Build Speed & Time-to-MVP | Bifrost + Tavily Synergy | Demo Visual Impact | Recommended For |
| :--- | :---: | :---: | :---: | :--- |
| **PS 05: Pre-Meeting Briefing Agent** | ⚡⚡⚡⚡ *(Fastest)* | 🟢 **High**: Bifrost manages routing/costs, Tavily handles 30-day temporal search | 🌟🌟🌟🌟 *(Very High)* | Solo / Rapid turnaround; immediately usable SaaS demo. |
| **PS 06: Stale-Answer Detector** | ⚡⚡⚡⚡ *(Fast)* | 🟢 **Maximum**: Bifrost handles claim extraction LLM, Tavily executes live fact-checking | 🌟🌟🌟🌟🌟 *(Highest)* | Clear evaluation rubric, strong developer pain point, high judge appeal. |
| **PS 01: Low-Token Coding Agent** | ⚡⚡⚡ *(Medium)* | 🟡 **Medium**: Bifrost handles gateway routing/caching; Tavily can search docs | 🌟🌟🌟 *(Good CLI/IDE)* | Developers strong in LLM tooling, local LLMs, and prompt caching. |
| **PS 02: Agent Benchmarking Platform** | ⚡⚡ *(Medium-Heavy)* | 🟢 **High**: Benchmark Bifrost/Tavily agent pipelines with failure injection | 🌟🌟🌟🌟 *(Impressive UI)* | Teams with full-stack UI skills wanting a developer tool/dashboard. |
| **PS 03: Autonomous Pentest Agent** | ⚡ *(Complex)* | 🟡 **Lower**: Requires isolated lab setup, tool execution harness, strict safety checks | 🌟🌟🌟🌟 *(High)* | Cybersecurity specialists with pre-built scanning harnesses. |
| **PS 04: Open-Source Bifrost Feature** | ⚡⚡ *(Codebase Dependent)* | 🟡 **Bifrost-Only**: Requires deep familiarity with Bifrost Go/TypeScript code | 🌟🌟🌟 *(Code Review)* | Open-source contributors comfortable with upstream PR workflows. |

> [!TIP]
> **Top Recommendation for High Scoring:**  
> **Problem Statement 06 (Stale-Answer Detector)** or **Problem Statement 05 (Pre-Meeting Briefing Agent)**.
> - Both naturally combine **Bifrost** (for efficient model calls, caching, cost limits) and **Tavily** (for live search & source retrieval).
> - They meet all mandatory criteria, are realistic to build and polish within 24 hours, and have immediate visual demo appeal for judges.
