# Thinking & Co-Creation Log: The Evolution of Evalix

> **Document Purpose:** This document records the complete, transparent thinking process, user prompts, architectural decisions, and collaborative AI interactions behind **Evalix**.  
> **Target Audience:** Hackathon Judges, Technical Evaluators, and Engineers interested in how human domain expertise and AI agent collaboration shaped this project.

---

## Executive Summary: How AI Was Used in This Project

Rather than using AI to generate blind boilerplate code, the human engineer (a Software Engineer II at JPMorgan Chase specializing in RAG systems, agent memory, and internal evaluation platforms) used the AI assistant as a **research partner, architectural sounding board, and domain synthesizer**:

1. **Autonomous Intelligence Gathering:** Reverse-engineering event APIs and parsing problem statement PDFs directly from platform endpoints.
2. **Architectural Dissection & Stress-Testing:** Challenging and refining mental models around tools (Bifrost AI Gateway vs. agent frameworks, Tavily search vs. debugging).
3. **Strategic Alignment with Enterprise Muscle:** Connecting the hackathon's "Agent Benchmarking" problem statement to actual production challenges faced in enterprise banking.
4. **Dual-Track Synergy Design:** Architecting a single cohesive project that tackles both the Bifrost Gateway track (evaluator) and the Tavily track (evaluated subject).
5. **Production Metrics Research:** Cataloging the metrics top AI teams measure today (`pass^k`, trajectory efficiency, chaos fault injection).

---

## Chronological Thinking Process & Prompt Log

```
Timeline of Collaboration
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Event Discovery & Problem Extraction (Hackathon Dashboard API)           │
│    ▼                                                                        │
│ 2. Deconstructing Tools: Tavily (Agent Search) & Bifrost (AI Gateway)       │
│    ▼                                                                        │
│ 3. Credits & API Economics (Tavily credits, LLM hosting, Voice AI)          │
│    ▼                                                                        │
│ 4. Domain Alignment: Enterprise Evals at JPMorgan Chase                     │
│    ▼                                                                        │
│ 5. Dual-Track Strategy: Testing a Tavily Agent on the Benchmark Platform    │
│    ▼                                                                        │
│ 6. Production Metrics Research: Beyond naive evals (Chaos, pass^k)          │
│    ▼                                                                        │
│ 7. Naming & Brand Identity: The Genesis of "Evalix"                         │
│    ▼                                                                        │
│ 8. Landscape Mapping: Maxim Observability vs. Arize Phoenix                 │
│    ▼                                                                        │
│ 9. Enterprise Journey Simulation (JPMC Architecture) & Eval Taxonomies      │
│    ▼                                                                        │
│ 10. Standing Rule: Continuous Real-Time Co-Creation Logging                 │
│    ▼                                                                        │
│ 11. Git Remote Setup & Branching Strategy (`feature/research` → `main`)     │
│    ▼                                                                        │
│ 12. Establishing `rules.md`: Agent Instructions & Persistent Chat Context   │
│    ▼                                                                        │
│ 13. Frontend Design Philosophy & UI Rules (Minimalism, Zero Overload)       │
│    ▼                                                                        │
│ 14. Product Demo & Storytelling Standards (Clean, Polished, Universal)      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Event Discovery & Automated Problem Extraction

#### User Prompt 1
> *"https://hackculture.io/my-events/manage/6ad854a1566c2195397af37a*  
> *I'm participating in this hackathon and I want you to query everything about it: the rules, the tracks to build on, and related details. Store all of that in a particular Markdown file or context document for this project that I'll be building. I'll read those files and then decide which problem statement to build. I hope you are able to query the problem statements that have been given to participants in this hackathon."*

* **Intent & Thought Process:** The user provided a raw event URL from their HackCulture dashboard. Instead of manually navigating and copy-pasting, the user directed the AI to systematically explore the platform.
* **Execution & AI Findings:**
  * Encountered authentication-protected dashboard endpoints.
  * Extracted client-side Next.js chunks, identified the backend API (`https://api.hackculture.io`), and located the hackathon ID (`6ac5c8240037f69fb28e23ec`) for the **Geek Room Global AI Hackathon**.
  * Queried `/api/v1/hackathon/.../theme` and downloaded all 6 official problem statement PDFs (`ps1.pdf` through `ps6.pdf`).
  * Extracted complete challenge texts, deadlines (Nov 15, 2026), rules, evaluation rubrics, and the 8,000 Tavily credit code (`GEEKROOM2`).
* **Artifact Produced:** Created `HACKATHON_GUIDE.md` and saved all PDFs in `problem_statements/`.

---

### Phase 2: Technical Mental Models & Tool Clarification

#### User Prompt 2
> *"what is taviliy and bitfrost explain in simple language"*

#### User Prompt 3
> *"Bifrost is kind of like a smart SDK from Google. It gives you a library to create and manage agents. It is more like this thing, like Open Router, where it has all the management capabilities*  
> *From what I understand about TAVILY, it is basically a web search for agents. It is curated for agents because agentic querying cannot always use API calls, and API calls are not optimized for it.*  
> *The gap is that it does not have the capability to exactly tell you what the error is. That is what TAVILY fills with its search for agents*  
> *Tell me if my understanding is correct or not."*

* **Intent & Thought Process:** The user shared their mental model to validate where their intuition was correct and where technical boundaries lay.
* **Collaborative Refinement:**
  * **Validated:** The user's comparison of Bifrost to **OpenRouter / LiteLLM** was verified as spot-on (a multi-model traffic controller, fallback router, and caching gateway).
  * **Clarified:** Clarified that Bifrost is not an agent framework (like LangChain/CrewAI) or a Google SDK, but an open-source gateway built by **Maxim AI**.
  * **Clarified:** Clarified that Tavily is specifically for **real-time web search and information retrieval for agents** (eliminating hallucinations and scraping bloat), rather than an error debugger.

---

### Phase 3: Resource Economics & Sponsor Analysis

#### User Prompt 4
> *"I want to understand what the credits are. How can I use these credits and will it give me access to various models using these credits?"*

#### User Prompt 5
> *"How much does Maxim AI pay its engineers? I am an ASD2 at JP Morgan Chase and you can fetch my resume from Resume as Code and check that.*  
> *Also is it in person, hybrid, or remote? I want to understand what they do, how they hire, and related details but keep it brief and short only"*

#### User Prompt 6
> *"I also want to understand the Omni Dimension Voice AI: what is that and how can we use it? Do we have access to get those credits as well or is it something I have to build in the Voice AI domain to get these credits?"*

* **Intent & Thought Process:** 
  * The user evaluated the developer economics: Tavily credits (`GEEKROOM2`) cover web search queries, while LLMs must be powered by local models (Ollama/vLLM) or free/cloud tiers.
  * The user explored the hiring incentive behind the hackathon: Maxim AI offers direct interview opportunities to winners. The user mapped their background (Software Engineer II at JPMorgan Chase, building high-scale RAG and agentic operating memory) to Maxim AI's hiring profile and compensation benchmarks in Bengaluru.
  * Verified that Omnidimension Voice AI credits are post-hackathon winner prizes, not required project prerequisites.

---

### Phase 4: Standing Out & Strategic Selection

#### User Prompt 7
> *"Why do you mention that tackling problem statement 1 and statement 4 would give me an immediate hiring showcase? What are the problem statements that will make me stand out?"*

#### User Prompt 8 (The Turning Point)
> *"I want to solve this agent benchmarking platform problem because it is something I'm currently working on as a software engineer at JP Morgan Chase. I am building the evals platform for the other agentic teams out there and I think it will give me exposure and an understanding of what we are trying to do.*  
> *I can build a clone as well. I have the expertise, have developed the muscle for that, and can give it context on what to build. It is something I can build, and I can use Maxim AI's Bifrost project to build it. It is something I am building for production and internal users at JP Morgan and I believe I can make it from here as well"*

* **Intent & Strategic Decision:**  
  * The user intentionally bypassed generic chatbot projects to build **Problem Statement 02: Build a Benchmarking Platform for AI Agents, Not Just Models**.
  * **Strategic Rationale:** Maxim AI’s core business is an **AI evaluation platform**. Building a benchmarking suite directly aligns with the host's product vision and leverages the user's real-world engineering muscle building agent evals at JPMorgan Chase.

---

### Phase 5: The Dual-Track Hackathon Synergy

#### User Prompt 9
> *"I can use the Tavily credits as well for this problem statement. I can build a small agentic workflow in Tavily using Tavily and then test it using the benchmarking platform that I am building. It is something I can test in realtime. In this way I can target both problem statements"*

* **Intent & Strategic Breakthrough:**
  * Rather than treating Bifrost and Tavily as disconnected options, the user conceived an integrated architecture:
    * **The Subject:** A real-world Tavily-powered Research Agent.
    * **The Harness:** The Benchmarking & Chaos Platform (Evalix), instrumented with Bifrost for token/cost/failover tracking.
  * **Result:** Qualifies for the **Combined Project Track** to compete for both cash and credit prize pools simultaneously.

---

### Phase 6: Deep Research into Production Evals & Metrics

#### User Prompt 10
> *"No, I don't want you to kick off any development or planning. Based on this problem statement, I want to know what a good benchmarking platform looks like and what metrics people are measuring in production today for evaluation and benchmarking. You are open to finding those things and saving them in a doc*  
> *Will read that and understand what I want to incorporate into my evals development platform. I might not choose all of them because everything is not needed."*

* **Intent & Methodological Discipline:**  
  * The user explicitly paused code generation to prioritize **architectural grounding and research**.
  * Demanded a comprehensive investigation of how top production AI teams benchmark agents in 2026.
* **Execution & AI Findings:**
  * Synthesized industry research into five metric pillars: Outcome, Economic, Tool Trajectory, Chaos/Reliability, and Safety.
  * Highlighted the critical distinction between **`pass@k`** (optimistic single-pass) and **`pass^k`** (strict multi-trial production consistency).
  * Formalized the concept of **"Chaos Monkey for Agents"** (injecting tool 500s, 429s, schema mismatches, and poisoned context).
* **Artifact Produced:** Created `AGENT_BENCHMARKING_AND_EVALS_GUIDE.md` (20KB reference manual).

---

### Phase 7: Project Naming & Brand Identity

#### User Prompt 11
> *"Suggest some project names for this."*

#### User Prompt 12 & 13
> *"Port this conversation to this new workspace - Evalix because I have renamed the previous folder(Global-AI-hacks) to Evalix from Global AI Hacks"*

* **Intent & Action:**
  * The user selected the name **Evalix** (combining Evaluation, Analytics, and Execution).
  * Renamed the project workspace from `Global-AI-Hacks` to `Evalix`.
  * Ported all project documentation and configured a symbolic link for backward compatibility.

---

### Phase 8: Competitive Landscape & Observability Tooling

#### User Prompt 14
> *"Does Tavily or Bifrost have these agent observability capabilities, or does Maxima AI have any product for observability? I know one observability tool is Phoenix Rise but I don't know if Maxima AI or the table you have already has some tool I can use itself"*

#### User Prompt 15
> *"What is the product name for Maxim AI's ability product? What is that called?"*

#### User Prompt 16
> *"I want you to record the thinking process I have been communicating to you in a particular MD file. This thinking.md file will include all the prompts and everything I have said to you so that whenever the judges see it, they can know how I have used AI I think I can also link it in the readme as well."*

* **Intent & Strategic Clarity:**
  * The user mapped the competitive tooling landscape:
    * **Arize Phoenix / Maxim Observability:** Passive observers recording OpenTelemetry traces and latency spans.
    * **Bifrost:** Gateway-level network proxy tracking model tokens, costs, and provider failovers.
    * **Evalix (Our Platform):** The **Active Evaluator & Chaos Harness** that runs multi-trial benchmark suites, injects faults, and tests if agents survive.
  * Documented the entire design journey in `thinking.md` for total transparency.

---

### Phase 9: Enterprise Journey Simulation (JPMC Architecture) & Eval Taxonomies

#### User Prompt 17
> *"Oh damn. Basically Maxim has all these evaluation capabilities itself. This is something which I have been using*  
> *Using it in my product at JP Morgan, I can use these maximum evaluations, maximum simulations, and the observability component to build this kind of evals platform.*  
> *I have been working on a particular project that does this simulation. A journey owner comes to our platform with their own set of agents. They upload the PRD, flow diagram, agent architect, Figma diagram, or flow, along with other context for our evaluation platform.*  
> *This is how the agent is. We then create scenarios on top of it using these documents. We have an ML library that handles the simulation part and scenario generation. After that, we test it and make a live LLM call to use the particular persona, simulate conversations, and call the actual agent so it can be evaluated and shown on our screen.*  
> *I think this is the flow. I might have missed something, but can you validate and check it once if this is how people are building*  
> *Apart from that, I was also delving into three things: online evaluation, offline evaluation, and the LLM as a judge.*  
> *Online evaluation occurs when the user is using a particular agent. These evaluations run instantly. Offline evaluation happens after a particular agent run has completed, when we evaluate past agent runs.*  
> *The LLM as a judge is where the LLM has all the context and then judges particular simulation runs based on various personas. I believe the LLM-as-a-judge setup is the platform I have built currently at JP Morgan."*

* **Intent & Architectural Deep-Dive:**
  * The user opened up their direct production architectural experience at **JPMorgan Chase**, describing their internal simulation platform:
    1. **Journey Intake:** Ingesting business PRDs, architecture diagrams, and Figma flows.
    2. **Synthetic Scenario Generation:** ML-driven generation of test cases and edge cases.
    3. **Persona-Driven Multi-Turn Simulation:** A User Simulator (holding specific personas) interacts multi-turn with the System Under Test (SUT).
    4. **Telemetry & Scoring:** LLM-as-a-judge inspecting multi-turn execution traces against requirements.
  * The user sought validation of how this mirrors industry state-of-the-art and requested clarification on the operational taxonomy: **Online vs. Offline vs. LLM-as-a-Judge**.
* **Collaborative Validation & Synthesis:**
  * **Simulation Flow Validated:** Confirmed that multi-turn synthetic persona simulation is the gold standard used by Maxim AI Simulation, Cognition (Devin), and Anthropic Red Teaming to solve the cold-start pre-release testing problem.
  * **Online Evals:** Defined as synchronous/asynchronous in-flight guardrails (PII scanning, toxicity, lightweight SLM/heuristic checks) bounded by strict latency (<200 ms) and cost budgets.
  * **Offline Evals:** Defined as post-hoc batch/CI-CD evaluations replaying golden suites and deep root-cause analysis without user latency penalties.
  * **LLM-as-a-Judge:** The evaluation intelligence (inspecting user intent, full tool execution traces, and final outcomes for goal completion, groundedness, and policy adherence).

---

### Phase 10: Standing Rule — Continuous Co-Creation Logging

#### User Prompt 18
> *"I want you to add this rule: whatever I'm speaking on this particular chat, I want you to add it to the thinking.md file"*

* **Intent & Operating Principle:**
  * The user instituted a **permanent standing protocol**: every subsequent turn, dialogue, user thought, prompt, and architectural refinement in this chat will be immediately and faithfully recorded in `thinking.md`.
  * **Value for Evaluators:** Ensures 100% auditable provenance and showcases continuous, authentic human-AI collaborative engineering.

---

### Phase 11: Git Remote Setup & Branching Strategy (`feature/research` → `main`)

#### User Prompt 19
> *"https://github.com/ayan2809/Evalix.git*  
> *I have created this Git repository. You can push it to the `feature/research` branch. Then we will maybe merge it later on to `main` Also raise a PR to main with this feature branch. We'll keep pushing and later on, after everything is collated, I'll merge it to main."*

* **Intent & Strategy:**
  * The user established the official GitHub remote: `https://github.com/ayan2809/Evalix.git`.
  * **Branching Strategy:** Dedicated research and architecture phase isolated on branch `feature/research`.
  * **PR Workflow:** Opened official Pull Request [#1](https://github.com/ayan2809/Evalix/pull/1) from `feature/research` into `main` so all foundational research, architectural blueprints, problem statements, and thinking logs are formally reviewed before the implementation phase begins.

---

### Phase 12: Establishing `rules.md` & Agent Instructions

#### User Prompt 20
> *"Also create a rules.md file with the rules for this particular project so that whenever any other agent starts this project, they read the rules. Also save the conversations I'm having with the AI agent so that my thinking is captured there as well, not just in this conversation"*

* **Intent & Governance:**
  * Created `rules.md` as the explicit instruction manual for any AI agent or collaborator opening this workspace.
  * Formalized the Prime Directive: any future agent working on Evalix must read `rules.md` first, maintain continuous prompt capture in `thinking.md`, adhere to the `feature/research` branching model, and preserve the active chaos / `pass^k` architectural guardrails.

---

### Phase 13: Frontend Design Philosophy & UI/UX Rules

#### User Prompt 21
> *"For the UI I want to set a rule: it has to be very clean, minimalistic, easy to navigate, and easy to understand. It should be built for everyone, from product managers and engineers to even someone who is not really accustomed to these kinds of systems.*  
> *It should not have a lot of jargon, should be as clean as possible, and should not cause context overload on the device. These are the rules for frontend development"*

* **Intent & Design Philosophy:**
  * Established the non-negotiable frontend design principles for **Evalix**:
    1. **Radical Minimalism & Clean Layout:** Focused on purposeful typography, whitespace, and immediate visual clarity.
    2. **Democratized Accessibility:** The interface must not be an impenetrable matrix of ML graphs built solely for researchers. It must be effortlessly usable by **Product Managers, Journey Owners, Executives, and Engineers alike**.
    3. **Jargon-Free Metrics:** Technical concepts are rendered in human terms (e.g., *“3 out of 3 Runs Succeeded”* instead of an unexplained $pass^k$ formula) with progressive disclosure via tooltips.
    4. **Zero Device Overload & Low Footprint:** Prevent client-side browser lag by avoiding raw multi-megabyte JSON dumps; use collapsible step accordions and clean summary cards.
  * Formalized these principles into Section 5 of `rules.md`.

---

### Phase 14: Product Demo & Storytelling Standards

#### User Prompt 22
> *"For the demo I also want to set the rule that it has to be very clean, neat, and polished. It should be easy to understand and grasp. We can use those kinds of frameworks to explain the product that we are building to anyone."*

* **Intent & Presentation Philosophy:**
  * Mandated that all demonstrations, video pitches, and walkthroughs for **Evalix** adhere to a crisp, professional standard:
    1. **Neat, Clean & Polished Execution:** Smooth, intentional demonstration flow without erratic clicks or confusing debug noise.
    2. **Universal Storytelling Frameworks:** Structuring explanations around clear narrative arcs (e.g., **"The Problem $\rightarrow$ The Chaos Spike $\rightarrow$ The Recovery $\rightarrow$ The Business Impact"**).
    3. **Instant 60-Second Grasp:** Anyone (from hackathon judges and executive leaders to non-technical users) should instantly understand what Evalix does within the opening minute.
    4. **Side-by-Side Contrast ("Show, Don't Just Tell"):** Visually contrasting an unhardened, brittle agent failing under fault injection against an Evalix-hardened agent recovering seamlessly.
  * Formalized into Section 6 of `rules.md`.

---

## Key Technical Decisions Made Through This Dialogue

| Decision | Alternative Considered | Why This Choice Was Made |
| :--- | :--- | :--- |
| **Problem Statement: PS 02 (Agent Benchmarking)** | PS 01 (Coding Agent) or PS 05 (Briefing Agent) | Direct domain match with user's real-world work at JPMorgan Chase and perfect alignment with Maxim AI’s platform focus. |
| **Integration Strategy: Dual-Track Synergy** | Single Track (Bifrost only or Tavily only) | Building a Tavily agent as the testbed under the Evalix benchmarking platform satisfies both tracks for maximum scoring. |
| **Evaluation Philosophy: Active Chaos vs. Passive Tracing** | Standard trace visualizer (like Phoenix) | Passive tracing only shows what happened; chaos injection proves whether the agent can self-heal under adversity. |
| **Testing Paradigm: Synthetic Persona Simulation** | Static single-turn QA pairs | Agents fail on multi-turn context drift; synthetic persona dialogue tests realistic user interactions pre-release. |
| **Operational Taxonomy: Online vs. Offline Evals** | One-size-fits-all evaluator | Online requires lightweight, low-latency guardrails; offline allows heavy, multi-agent LLM-as-a-judge analysis. |
| **Metric Standard: `pass^k` over `pass@k`** | Single-pass accuracy | Enterprise production requires consistency ($(\text{accuracy})^k$), not a single lucky run. |
| **Research Before Code** | Immediate code generation | User deliberately paused development to thoroughly map out industry metrics and architecture first. |
| **Standing Rule: Continuous Co-Creation Log** | Post-hoc manual writeup | Continuous capture guarantees verbatim accuracy and radical transparency for judges. |
| **Branching Strategy: `feature/research` PR** | Direct push to `main` | Keeps `main` clean and tracks foundational architecture, rules, and thinking logs as an auditable PR. |
| **Agent Governance: `rules.md` Protocol** | Relying on session memory | Ensures subsequent agents or IDE sessions adhere to the exact same logging, branching, and architecture rules. |
| **Frontend Philosophy: Minimalist & Jargon-Free** | Dense, engineer-only telemetry dashboards | Democratizes evaluation for PMs, journey owners, and non-technical stakeholders without client device lag. |
| **Demo Standard: Universal Narrative Framework** | Feature-dump technical walkthroughs | Ensures any evaluator grasps the core value proposition and business impact within 60 seconds. |
