# Thinking & Co-Creation Log: The Evolution of Evalix

> **Document Purpose:** This document records the complete, transparent thinking process, user prompts, architectural decisions, and collaborative AI interactions behind **Evalix**.  
> **Target Audience:** Hackathon Judges, Technical Evaluators, and Engineers interested in how human domain expertise and AI agent collaboration shaped this project.

---

## Executive Summary: How AI Was Used in This Project

Rather than using AI to generate blind boilerplate code, the human engineer (a Software Engineer II specializing in high-scale enterprise RAG systems, multi-agent operating memory, and internal evaluation platforms) used the AI assistant as a **research partner, architectural sounding board, and domain synthesizer**:

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
│ 4. Domain Alignment: Enterprise Evaluation Systems in Tier-1 Banking        │
│    ▼                                                                        │
│ 5. Dual-Track Strategy: Testing a Tavily Agent on the Benchmark Platform    │
│    ▼                                                                        │
│ 6. Production Metrics Research: Beyond naive evals (Chaos, pass^k)          │
│    ▼                                                                        │
│ 7. Naming & Brand Identity: The Genesis of "Evalix"                         │
│    ▼                                                                        │
│ 8. Landscape Mapping: Maxim Observability vs. Arize Phoenix                 │
│    ▼                                                                        │
│ 9. Enterprise Journey Simulation (Tier-1 Banking Systems) & Eval Taxonomies │
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
│    ▼                                                                        │
│ 15. Strategic Goals: Instant Agent Builder & Pre-Built Tavily Workflows     │
│    ▼                                                                        │
│ 16. Implementation Plan Prompt: Stack, Maxim AI SDK, Google ADK & Determinism│
│    ▼                                                                        │
│ 17. Plan Archiving (`docs/plan.md`) & Gitignoring Working Plans             │
│    ▼                                                                        │
│ 18. Chaos Engine Mechanics: Active Fault Injection & Self-Healing Testing   │
│    ▼                                                                        │
│ 19. Architecture Deepening: Maxim AI Stack (`maxim-py`) & Bifrost Gateway   │
│    ▼                                                                        │
│ 20. End-to-End Setup Guide: Bifrost Gateway & Maxim AI Platform SDK         │
│    ▼                                                                        │
│ 21. Economic Analysis: Zero-Cost Demo Architecture & Free-Tier Limits       │
│    ▼                                                                        │
│ 22. Plan Gap Analysis: Auditing `docs/plan.md` Before Implementation        │
│    ▼                                                                        │
│ 23. Plan v2: Rewriting `docs/plan.md` to Close All 29 Gaps in Plain Language│
│    ▼                                                                        │
│ 24. Deconstructing the "Research" Category & Target Domains                 │
│    ▼                                                                        │
│ 25. Full Branch Synchronization & Working Tree Verification                 │
│    ▼                                                                        │
│ 26. Architectural Alignment: Two-Tier Hybrid Grading & LLM-as-a-Judge      │
│    ▼                                                                        │
│ 27. Primary Model Provider Decision: Google AI Studio (Gemini Class)        │
│    ▼                                                                        │
│ 28. Resume-Driven Domain Personalization: Banking, Cloud & RAG Systems      │
│    ▼                                                                        │
│ 29. Privacy Directive: Complete Employer Anonymization & Tech Reframing     │
│    ▼                                                                        │
│ 30. Category vs. Domain Synthesis: Autonomous Research Capability Archetype │
│    ▼                                                                        │
│ 31. Deep Integration of Two-Tier Hybrid Grading in Master Build Plan        │
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
> *"How much does Maxim AI pay its engineers? I am an SDE-II at a Tier-1 financial institution and you can fetch my resume from Resume as Code and check that.*  
> *Also is it in person, hybrid, or remote? I want to understand what they do, how they hire, and related details but keep it brief and short only"*

#### User Prompt 6
> *"I also want to understand the Omni Dimension Voice AI: what is that and how can we use it? Do we have access to get those credits as well or is it something I have to build in the Voice AI domain to get these credits?"*

* **Intent & Thought Process:** 
  * The user evaluated the developer economics: Tavily credits (`GEEKROOM2`) cover web search queries, while LLMs must be powered by local models (Ollama/vLLM) or free/cloud tiers.
  * The user explored the hiring incentive behind the hackathon: Maxim AI offers direct interview opportunities to winners. The user mapped their background (Software Engineer II in enterprise banking systems, building high-scale RAG and agentic operating memory) to Maxim AI's hiring profile and compensation benchmarks in Bengaluru.
  * Verified that Omnidimension Voice AI credits are post-hackathon winner prizes, not required project prerequisites.

---

### Phase 4: Standing Out & Strategic Selection

#### User Prompt 7
> *"Why do you mention that tackling problem statement 1 and statement 4 would give me an immediate hiring showcase? What are the problem statements that will make me stand out?"*

#### User Prompt 8 (The Turning Point)
> *"I want to solve this agent benchmarking platform problem because it is something I'm currently working on as an enterprise software engineer. I am building the evals platform for the other agentic teams out there and I think it will give me exposure and an understanding of what we are trying to do.*  
> *I can build a clone as well. I have the expertise, have developed the muscle for that, and can give it context on what to build. It is something I can build, and I can use Maxim AI's Bifrost project to build it. It is something I am building for production and internal users in enterprise banking and I believe I can make it from here as well"*

* **Intent & Strategic Decision:**  
  * The user intentionally bypassed generic chatbot projects to build **Problem Statement 02: Build a Benchmarking Platform for AI Agents, Not Just Models**.
  * **Strategic Rationale:** Maxim AI’s core business is an **AI evaluation platform**. Building a benchmarking suite directly aligns with the host's product vision and leverages the user's real-world engineering muscle building agent evals in high-scale enterprise systems.

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

### Phase 9: Enterprise Journey Simulation (Banking Systems Architecture) & Eval Taxonomies

#### User Prompt 17
> *"Oh damn. Basically Maxim has all these evaluation capabilities itself. This is something which I have been using*  
> *Using it in my enterprise products, I can use these maximum evaluations, maximum simulations, and the observability component to build this kind of evals platform.*  
> *I have been working on a particular project that does this simulation. A journey owner comes to our platform with their own set of agents. They upload the PRD, flow diagram, agent architect, Figma diagram, or flow, along with other context for our evaluation platform.*  
> *This is how the agent is. We then create scenarios on top of it using these documents. We have an ML library that handles the simulation part and scenario generation. After that, we test it and make a live LLM call to use the particular persona, simulate conversations, and call the actual agent so it can be evaluated and shown on our screen.*  
> *I think this is the flow. I might have missed something, but can you validate and check it once if this is how people are building*  
> *Apart from that, I was also delving into three things: online evaluation, offline evaluation, and the LLM as a judge.*  
> *Online evaluation occurs when the user is using a particular agent. These evaluations run instantly. Offline evaluation happens after a particular agent run has completed, when we evaluate past agent runs.*  
> *The LLM as a judge is where the LLM has all the context and then judges particular simulation runs based on various personas. I believe the LLM-as-a-judge setup is the platform I have built currently in my enterprise work."*

* **Intent & Architectural Deep-Dive:**
  * The user opened up their direct production architectural experience in **high-scale banking systems**, describing their internal simulation platform:
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

### Phase 15: Strategic Goals, Instant Agent Builder & Pre-Built Workflows

#### User Prompt 23
> *"I want to also research about the various agentic workflows I can build. I want to build a couple of them so I can use them for this demo.*  
> *I believe we can use the Tavily thing for a couple of the agents we are building, which will be used by the Evalix platform for evaluation. It should be built so that whenever someone wants to onboard, they can create their own agent on the side. It should be easy to do, something like a one-prompt or zero-shot approach, and the agent will then be created automatically with as minimal input. That agent creation page can ask the user clarifying questions to build a small agent which can then be used to run evaluations on our platform.*  
> *I don't know where this should be mentioned, but this is one of my goals so that it's easy to demo our product as well. You can maybe create a goal.md file for this."*

* **Intent & Strategic Product Breakthrough:**
  * Identified the primary adoption bottleneck in enterprise eval tools: onboarding an agent usually requires complex SDK integrations or lengthy YAML manifests.
  * Defined two pivotal product features for Evalix:
    1. **The Instant / Zero-Shot Agent Studio:** Enables any user (PM, developer, or judge) to create a custom agent in $<45$ seconds from a single prompt or through an interactive 2–3 question clarifying loop, instantly provisioning an agent runtime ready for evaluation.
    2. **Pre-Built Tavily Showcase Workflows:** Out-of-the-box real-world research agents (Pre-Meeting Intelligence Briefing, Stale-Answer Detection, Competitive Deep-Search) built with Tavily so evaluators can run live chaos benchmarks immediately.
  * Formalized the complete product and demo roadmap into `goal.md`.

---

### Phase 16: Master Implementation Planning, Framework Independence & Deterministic Evals

#### User Prompt 24
> *"Now I want you to write a plan prompt that I will use to start the implementation of this project. Keep the language simple and easy for me to understand.*  
> *I want to use the following tech stack:*  
> *- React with TypeScript for the frontend*  
> *- FastAPI in Python for the backend*  
> *For the framework I want to understand and work with Maxim AI's text agent for observability, simulation, and related tasks.*  
> *I want to build three things:*  
> *1. An agent studio where the user can easily build one agent, then proceed to the evals platform to benchmark and evaluate their agents*  
> *2. Support for both online and offline processing*  
> *3. A UI that is as clear, intuitive, and easy to understand as possible*  
> *These are some of the rules. I also want to look at the, based on based on the hackathon rules, I notice that they want the framework to be framework-independent. Our evals platform should also support that and be framework-independent. If it is framework-independent, let us also create one more fourth agent for the demo, which will be written in Google ADK. I also want to understand what domain I can use the agents in, such as what domain I can build these agents for. That is something I am not very clear about and it should be in the plan. Give me two to three hints on what kind of agentic workflows I can build so they can be tested on the evals platform. and the evaluation should be as much deteministic as possible.*  
> *like check the problem statement2 pdf and check what they need and design the plan according to that."*

* **Intent & Strategic Implementation Design:**
  * Grounded the implementation plan directly in **Problem Statement 02** mandatory requirements:
    1. **Framework Independence:** Platform treats agents as black boxes. For the demo, showcases 4 distinct frameworks:
       - Agent 1: **Vanilla Python / HTTP Agent** (Native function calling)
       - Agent 2: **LangChain / CrewAI Agent** (Multi-step tool agent)
       - Agent 3: **Tavily Research Agent** (Specialized web intelligence)
       - Agent 4: **Google GenAI / ADK Agent** (Proving Google SDK neutrality)
    2. **Domain Selection with Deterministic Evaluation:** Solved the open question of agent domain by prioritizing categories from `ps2.pdf` (Customer Support & Research) where outcomes can be deterministically asserted (e.g. database side-effects, exact key-value extraction, tool schema validation, and zero false mutations) without relying solely on subjective LLM grading.
    3. **Tech Stack Locked:** React + TypeScript (frontend) + FastAPI (backend) + Maxim AI (`maxim-py` SDK / Bifrost) for tracing, simulation, and observability.
    4. **Dual Processing Modes:** Online in-flight guardrails (real-time latency/PII checks) vs. Offline batch multi-trial simulation (`pass^k` consistency).
  * Synthesized a ready-to-execute Master Implementation Plan prompt.

---

### Phase 17: Implementation Plan Archiving (`docs/plan.md`) & Gitignoring Working Plans

#### User Prompt 25
> *"save the plan in a file inside the docs diretory and keep that directory gitignored"*

* **Intent & Repository Hygiene:**
  * Saved the complete Master Implementation Plan to `docs/plan.md`.
  * Added `docs/` to `.gitignore` to maintain clean repository separation between public hackathon artifacts/documentation and local working scratchpad plans.

---

### Phase 18: Chaos Engine Architecture & Fault Injection Mechanics

#### User Prompt 26
> *"What is the chaos engine or chaos benchmark runner that we are planning to build? How does that work?"*

* **Intent & Conceptual Deep-Dive:**
  * The user paused to interrogate the inner workings of the **Chaos Engine**: how it operates architecturally, where it sits in the network stack, and how it actively tests agent resilience.
  * Formalized the "Chaos Monkey for AI Agents" paradigm:
    1. **Transparent Proxy Architecture:** Placed between the Agent and its tools/models to intercept invocations dynamically.
    2. **Fault Injection Taxonomy:** Simulating tool 500 crashes, HTTP 429 gateway throttles, schema truncations, and poisoned web snippets.
    3. **Behavioral Recovery Verification:** Differentiating brittle failure modes (infinite loops, hallucinations, silent crashes) from resilient recovery (exponential backoff, alternative query synthesis, graceful degradation).

---

### Phase 19: Architecture Deepening: Maxim AI Stack (`maxim-py`) & Bifrost Integration

#### User Prompt 27
> *"In the Evalix architecture that you have created, also mention Maxim AI's test stack and the Bifrost implementation within this particular architecture so that I am clear about what we are implementing"*

* **Intent & Integration Blueprinting:**
  * The user directed the architecture to explicitly detail where **Maxim AI's platform** and **Bifrost AI Gateway** sit within Evalix:
    1. **Bifrost AI Gateway (Network Proxy):** Positioned between all agent adapters and underlying LLMs. Intercepts model calls to perform prompt caching, cost calculation, and automatic model failover (rerouting to secondary models when the Chaos Engine injects 429 rate limits).
    2. **Maxim AI Platform SDK (`maxim-py`):** Positioned inside the FastAPI backend. Captures hierarchical distributed traces (Session $\rightarrow$ Trace $\rightarrow$ Span) across multi-turn reasoning steps and tool calls, synchronizing deterministic evaluation scores with Maxim’s online/offline dashboards.
  * Updated `docs/plan.md` with an expanded architecture diagram and component mapping table.

---

### Phase 20: End-to-End Setup Guide: Bifrost Gateway & Maxim AI Platform SDK

#### User Prompt 28
> *"How to set up Bifrost, like the Maxim AI platform SDK and stuff? What is the setup? Give me that entire process"*

* **Intent & Operational Clarity:**
  * The user requested the complete, step-by-step installation, configuration, and code integration process for both:
    1. **Bifrost AI Gateway:** Running locally via `npx -y @maximhq/bifrost` or Docker, setting up model routing on `http://localhost:8080`, and using it as a drop-in OpenAI-compatible proxy (`base_url="http://localhost:8080/v1"`).
    2. **Maxim AI Platform SDK (`maxim-py`):** Installing via `pip install maxim-py`, configuring `MAXIM_API_KEY` and `MAXIM_LOG_REPO_ID`, and opening hierarchical Traces & Spans (or wrapping OpenAI client with `MaximOpenAIClient`).
  * Formalized the complete setup guide for developer onboarding.

---

### Phase 21: Economic Analysis: Zero-Cost Demo Architecture & Free-Tier Limits

#### User Prompt 29
> *"How costly will it be to set up a Maxim API key and how much will it cost for this entire demo then?"*

* **Intent & Budget Optimization:**
  * The user conducted a strict cost audit before provisioning services.
  * Verified that the entire project can be run and demoed at **\$0.00 total expense**:
    1. **Maxim AI:** Provides a **Free-Forever Developer Plan** (up to 3 seats, 1 workspace, 10,000 logs/traces per month)—\$0 cost to obtain API keys.
    2. **Bifrost:** 100% Free & Open Source (Apache 2.0)—self-hosted locally on `localhost:8080`.
    3. **Tavily:** **8,000 free search credits** via hackathon coupon code `GEEKROOM2`.
    4. **Model Costs:** Can run 100% free with local Ollama (`llama3.2`) or Google Gemini Flash free tier, or $< \$0.01 if using OpenAI `gpt-4o-mini`.

---

### Phase 22: Plan Gap Analysis — Auditing `docs/plan.md` Before Implementation

#### User Prompt 30
> *"identify the gaps in this particular plan. But first go through the entire repository first to understand what we are trying to solve in this project, Evalix. After that go through the plan and identify the gaps in it*  
> *Suggest and list the gaps, as there may be many. That way we can refine the plan and then start implementation. Do not start any implementation here, but just analyze it"*

* **Intent & Methodological Discipline:**
  * The user paused again before writing any code, asking for the plan to be audited against the whole repository (`ps2.pdf`, `goal.md`, `rules.md`, the evals guide) so it can be refined first.
* **Main Gaps Found (analysis only, no implementation):**
  1. **No shared task category:** `ps2.pdf` asks for one category with identical tasks for every agent; the plan mixes financial support and live research, and lists Tavily (a tool) as if it were a framework.
  2. **Black-box observation is undefined:** the plan does not say how steps, tool calls, and tokens are captured from an agent the platform did not write, or how an external agent is registered.
  3. **Chaos placement contradiction:** if Bifrost fails over transparently on an injected 429, the agent never sees the fault, so the run measures the gateway rather than the agent.
  4. **Determinism vs. live web:** live Tavily results change between trials, and Bifrost caching would make repeat trials replay the first one.
  5. **Scope vs. deadline:** no timeline, MVP cut line, datastore, or API contract; the mandatory pitch deck and README are not in the plan; no LLM or Maxim key is provisioned yet.
  6. **Agent Studio has no tasks to run:** a freshly generated custom agent has no task suite or answer key to be benchmarked against.
* **Outcome:** Gaps listed for the user to decide on; `docs/plan.md` left unchanged until those decisions are made.

---

### Phase 23: Plan v2 — Rewriting `docs/plan.md` to Close All Gaps

#### User Prompt 31
> *"update the plan to address all the gaps you have identified in the plan and use the simplest language possible to write the plan."*

* **Intent:** Turn the gap list into a plan that can be built from directly, written so anyone can follow it.
* **Decisions Recorded in Plan v2 (AI-recommended defaults, open to change by the user):**
  1. **One category: research.** Customer support and the mock database are dropped.
  2. **Same tasks, tools, and model for every agent.** Tavily becomes the shared search tool behind Evalix instead of being listed as an agent.
  3. **Agents are separate programs reached over HTTP (`POST /run`).** Evalix owns the tool server and the model address, with the run id in the URL, so it sees and can break every tool and model call.
  4. **Saved search results are replayed** so every trial sees the same web; live Tavily is a demo switch kept out of the scoreboard.
  5. **Faults are scripted** ("fail the 2nd search call, once"), cover broken tools, a busy model, and misleading instructions, and each states whether the right outcome is an answer or an honest "blocked".
  6. **Model faults sit in front of Bifrost** so the agent faces them; Bifrost failover is a separate gateway test not counted in agent scores; caching is off for benchmark runs.
  7. **Grading is code-only:** matching answer fields, sources that were really returned, and no attempt to use the forbidden tool.
  8. **Careful vs. Careless plain-Python agents** on the same model carry the demo story; LangChain and Google ADK show framework independence.
  9. **Build order with a cut line:** everything PS 02 requires comes first; Agent Studio and Maxim export come last; the final three hours are reserved for README, deck, and video.
* **Open Items:** a model API key is still needed, and the Bifrost, Google ADK, and `maxim-py` behaviours taken from earlier chats must be checked in the first hour.

---

### Phase 24: Deconstructing the "Research" Category & Target Domains

#### User Prompt 32
> *"The plan mentions that there is only one category: research. What do we mean by research? What kind of research are we doing, and what domains are we targeting using this research category?"*

* **Intent & Domain Clarification:**
  * The user asked for a concrete explanation of what "Research" means in the context of agent benchmarking and what real-world domains Evalix targets.
  * Clarified why PS 02 specifies choosing **one category** (so all benchmarked agents face the exact same task suite under identical conditions).
  * Defined "Research Agent" not as academic paper writing, but as an **Autonomous Information Discovery & Fact-Verification Agent** (similar to OpenAI Deep Research or Perplexity Pro).
  * Detailed the three specific target domains:
    1. **Corporate & Tech Due Diligence (Fintech / Executive Intel):** Uncovering funding, leadership changes, and product updates (Workflow A from `goal.md`).
    2. **Real-Time Fact-Checking & Staleness Verification (AI App Safety):** Verifying time-sensitive pricing, API limits, and regulations against live ground truth (Workflow B from `goal.md`).
    3. **Competitive Market Intelligence (B2B SaaS / Infra):** Comparing competing tools on features, free tiers, and pricing (Workflow C from `goal.md`).
  * Emphasized how this domain allows **100% deterministic assertion** via key-value ground truth matching, citation URL verification, and scope adherence.

---

### Phase 25: Full Branch Synchronization & Working Tree Verification

#### User Prompt 33
> *"Commit all the files on this branch and push it"*

* **Intent & Synchronization Protocol:**
  * The user issued an explicit command to stage, commit, and push all workspace files on the active branch (`feature/research`).
  * Verified git working tree status and confirmed that `.gitignore` properly preserves local isolation of `.env` and `docs/plan.md`.
  * Committed all co-creation logs (`thinking.md`) and pushed cleanly to remote repository `origin feature/research`.
  * Updated PR [#1](https://github.com/ayan2809/Evalix/pull/1) reflecting complete sync status.

---

### Phase 26: Architectural Alignment — Two-Tier Hybrid Grading & LLM-as-a-Judge

#### User Prompt 34 & 35
> *"Are we not planning to use an AI judge like we had planned, or can we also add an LLM as a judge for the evaluations?"*  
> *"What are the rules that we have planned for you to be used during the grading of a particular agent?"*

* **Intent & Synthesis:**
  * The user re-affirmed their core enterprise evaluation design: bridging deterministic programmatic evaluation with qualitative LLM-as-a-Judge analysis (replicating their proven setup in enterprise financial platforms).
  * Synthesized a **Two-Tier Hybrid Evaluation Engine**:
    * **Tier 1 (Deterministic / Online):** Instant, code-driven assertions on schema compliance, key-value ground truth matching, citation URL provenance verification, honeypot safety triggers (`send_email`), and execution boundaries (time $\le 120$s, model calls $\le 15$, tool calls $\le 20$, loop detection).
    * **Tier 2 (Qualitative / Offline):** LLM-as-a-Judge post-run audit inspecting trajectory efficiency, reasoning logic, hallucination nuance, and quality of failure diagnosis when blocked by chaos.
  * Ensures the platform achieves strict mathematical determinism ($\text{pass}^k$, cost-per-success) without sacrificing deep qualitative insight.

---

### Phase 27: Primary Model Provider Decision — Google AI Studio (Gemini Class)

#### User Prompt 36
> *"I think I can provide the API for Google AI Studio, which will cover, I think, all the models from the Gemini model class. That should be enough"*

* **Intent & Architectural Impact:**
  * The user provided the final critical operational dependency: a **Google AI Studio API Key**.
  * Evaluated technical compatibility:
    1. **Model Class:** `gemini-2.0-flash` (and `gemini-1.5-pro` for judging) provides sub-second latency, native tool calling, and high free-tier rate limits.
    2. **Dual-API Standard:** Google AI Studio exposes both native Gemini APIs and OpenAI-compatible endpoints (`https://generativelanguage.googleapis.com/v1beta/openai/`), allowing standard `chat.completions.create` formatting across all agents and Bifrost.
    3. **Google ADK Synergy:** The 4th benchmarked agent (built on Google GenAI / ADK) can utilize native Gemini SDK bindings without format translation.
    4. **Bifrost Support:** Bifrost natively proxies Google Gemini models with token counting and caching controls.
  * This completely closes Section 13 prerequisite checks in `docs/plan.md`.

---

### Phase 28: Resume-Driven Domain Personalization — Banking, Cloud & RAG Systems

#### User Prompt 37
> *"Curate the three target domains we're benchmarking against as domains I understand and have worked on, based on my resume and experience. You can query the resume as code repository or project on my device"*

* **Intent & Personalized Grounding:**
  * The user directed the assistant to inspect their local resume repository (`/Volumes/Projects/Resume-as-code/build/resume.json`) and align Evalix's 3 target benchmarking domains directly with their production engineering background.
  * **Resume Discovery & Core Pillars Analyzed:**
    1. **Tier-1 Retail Banking Systems:** Built high-scale RAG search services for 18M customers (1.5–2M req/day) in FastAPI with OpenSearch ETL pipelines; engineered multi-agent operating memory with PII-masked context (gRPC / Spring Boot); replaced vendor FAQ search.
    2. **Cloud & DevOps (3x AWS Certified):** AWS Certified Solutions Architect, Developer, and Machine Learning Specialist. Manages Amazon EKS, Route 53, NLB/ALB, OpenSearch, Lambda, CloudFormation, and SLA incident response.
    3. **RAG & Agentic Systems:** Built ETL pipelines scraping/embedding PDF/web data, vector search (OpenSearch/FAISS), context engineering, and LLM evaluations.
  * **Curated 3 Target Domains in `tasks.json`:**
    1. **Domain 1: Retail Banking & Fintech Regulatory Intelligence (Banking Systems):** Evaluating research agents on credit card fees (Sapphire Reserve), checking account fee waiver rules, and regulatory compliance disclosures.
    2. **Domain 2: Enterprise Cloud & Observability Systems (AWS Core):** Evaluating research agents on AWS service limits (Lambda payload/timeout under ALB), container pricing (EKS vs. ECS Fargate), and observability ingestion SLAs.
    3. **Domain 3: AI Infrastructure & Enterprise Vector Search (RAG Core):** Evaluating research agents on vector DB pricing (OpenSearch Serverless OCU vs. Pinecone), model pricing/context limits (Gemini 2.0 Flash in Google AI Studio), and embedding latency budgets.
  * **Impact:** Gives the user authentic, effortless domain authority during live presentations, code walkthroughs, and Q&A with hackathon judges.

---

### Phase 29: Privacy Directive — Complete Employer Anonymization & Tech Reframing

#### User Prompt 38
> *"Do not mention my company in anything. Instead understand the tech that I've used and curated. It can be related to banking but do not mention my company or anything in this or in the various MD files"*

* **Intent & Privacy Guardrail Enforcement:**
  * The user issued an absolute privacy constraint: scrub all employer names and company identifiers from every markdown file, co-creation log, commit message, and prompt archive in the workspace.
  * **Actions Taken:**
    1. Enforced a dedicated Privacy Guardrail in `rules.md` (Section 1.1) prohibiting employer/company mentions across the entire project lifecycle.
    2. Systematically scrubbed all historical co-creation logs (`thinking.md`) to reframe engineering experience around the underlying technologies and domains: "Tier-1 Retail Banking & Financial Services (18M+ users, 2M+ req/day)", "High-scale RAG & Agentic Operating Memory", "Enterprise AI Evaluation Platforms", and "AWS Cloud Infrastructure".
    3. Neutralized benchmark tasks in `docs/plan.md` to reference published retail banking industry products rather than proprietary identifiers.
  * **Outcome:** 100% adherence to author privacy and employer neutrality while preserving deep technical and domain authenticity.

---

### Phase 30: Category vs. Domain Synthesis — Autonomous Research Capability Archetype

#### User Prompt 39
> *"Update the decisions made in this plan because we have edited that part and it is not just research, I believe. Or is it research-based? I don't know. Answer me about that first and then update anything"*

* **Intent & Clarification:**
  * The user asked for clarification on whether the platform is still fundamentally "research-based" after curating tasks across Retail Banking, Cloud Infra, and AI Vector Systems, and directed the assistant to update the decisions in `docs/plan.md`.
  * **Clarified the Critical Distinction Between Agent Category vs. Subject Domain:**
    * **Category (Functional Archetype):** Defines *what the agent does* operationally. In PS 02, the hackathon rules mandate picking **one category** (e.g., coding, research, or customer support) so all agents face identical tool contracts. Our agents are **100% Autonomous Research & Fact-Verification Agents**: they formulate queries, call `search` and `read_page`, synthesize evidence, extract structured JSON fields, and cite source URLs. They do not write code or chat back-and-forth as customer support bots.
    * **Domain (Subject Matter):** Defines *what topics the agent investigates*. Instead of generic trivia, our research agents operate across three technical enterprise domains: Retail Banking Systems, Cloud & Distributed Systems, and AI & Vector Search Systems.
  * **Updates Made to `docs/plan.md`:**
    * **Decision 1 Refined:** Explicitly defined as *"One capability category: Autonomous Research & Fact Verification (applied across 3 technical domains)"*.
    * **Decision 8 Refined:** Explicitly updated from code-only to **Two-Tier Hybrid Grading** (Tier 1 deterministic code core for the scoreboard + Tier 2 LLM-as-a-Judge for qualitative trajectory audits).
    * **Section 6 Updated:** Documented both Tier 1 and Tier 2 grading criteria.

---

### Phase 31: Deep Integration of Two-Tier Hybrid Grading in Master Build Plan

#### User Prompt 40
> *"There is one decision: mentions are creating uses code, not an AI judge, but we recently decided to go with a hybrid approach. Can you update the plan according to that hybrid approach instead of just a deterministic grading thing?"*

* **Intent & Plan Synchronization:**
  * The user noted that while the high-level decision table had been adjusted, the rest of the plan (`docs/plan.md`) needed to be comprehensively updated to reflect the **Two-Tier Hybrid Grading Engine** everywhere.
  * **Systematic Plan Updates in `docs/plan.md`:**
    1. **Decision 8 (§2):** Formally codified as *"Two-Tier Hybrid Grading: Deterministic Code Core + LLM-as-a-Judge Audit"*.
    2. **Grading Mechanics (§6):** Articulated Tier 1 (deterministic ground-truth matching, citation provenance, trap tools, limits) and Tier 2 (LLM Judge qualitative audits for trajectory efficiency, hallucination nuance, and failure diagnosis).
    3. **Evaluation Metrics (§8):** Added Tier 2 metrics to the run-level scoreboard: AI Reasoning Score (1–5), AI Groundedness, AI Recovery Rating, and AI Diagnostic Critique.
    4. **Database & API Schema (§11):** Updated `runs` SQLite table schema to persist `judge_score`, `judge_groundedness`, and `judge_critique`.
    5. **UI Specifications (§12):** Enhanced Screen 4 (*Run details*) to prominently render the interactive **AI Judge Audit Card** alongside the step-by-step trace viewer.
    6. **Build Schedule (§14):** Scheduled `grader.py` (Tier 1) and `judge.py` (Tier 2) into the Saturday evening backend milestone.
    7. **File Tree (§17):** Added `judge.py` to `backend/app/`.

---

## Key Technical Decisions Made Through This Dialogue

| Decision | Alternative Considered | Why This Choice Was Made |
| :--- | :--- | :--- |
| **Problem Statement: PS 02 (Agent Benchmarking)** | PS 01 (Coding Agent) or PS 05 (Briefing Agent) | Direct domain match with user's real-world engineering background in enterprise banking and perfect alignment with Maxim AI’s platform focus. |
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
| **Onboarding UX: Zero-Shot Agent Studio (`goal.md`)** | Requiring external API endpoint setup | Enables instant self-service onboarding in $<45$ seconds from a single prompt or 2-3 clarifying questions. |
| **Framework Independence: 4th Agent (Google ADK)** | Single-framework demo | Demonstrates true framework neutrality by benchmarking Vanilla Python, LangChain, Tavily, and Google GenAI / ADK. |
| **Deterministic Evals Domain: Support & Fact Verification** | Open-ended conversational chat | Allows 100% deterministic assertion on database state mutations, schema validity, and exact key-value facts. |
| **Plan Isolation: Gitignoring `docs/`** | Committing internal plan files | Keeps local scratchpad implementation plans private while maintaining clean public repo documentation. |
| **Chaos Testing: Intercepting Proxy** | Modifying agent internal code | An intercepting proxy injects runtime network/tool faults without altering the agent's core source code. |
| **Bifrost & Maxim Separation** | Conflating gateway and evals | Clearly separates Bifrost (network model proxy, caching, failover) from Maxim SDK (distributed trace spans, eval telemetry). |
| **Bifrost Local Deployment** | Complex cloud-only setup | Running via `npx -y @maximhq/bifrost` on `localhost:8080` provides instant, zero-friction local developer setup. |
| **Zero-Cost Demo Strategy** | Paid cloud infrastructure | Leverages Maxim free tier (10k logs), Tavily coupon (8k credits), and Bifrost OSS to achieve $0 out-of-pocket spend. |
| **Research Scope Definition** | Academic essay writing | Anchored research to factual information retrieval (market due diligence, pricing/API verification, SaaS comparisons). |
| **Two-Tier Hybrid Grading** | Pure code or pure LLM judge | Combines instant, crash-proof deterministic assertions (Tier 1) with rich post-run LLM Judge trajectory audits (Tier 2). |
| **Model Provider: Google AI Studio** | Multi-vendor billing sprawl | Covers all benchmarked agents and LLM judging via Gemini 2.0 Flash with sub-second latency and high free-tier limits. |
| **Resume-Driven Task Domains** | Generic hypothetical trivia | Curates tasks across retail banking systems, AWS cloud infrastructure, and enterprise RAG vector search where the user has proven production mastery. |
| **Privacy Directive: Employer Anonymity** | Named company disclosure | Strictly anonymizes all employer and company names across all repo markdown files, committing 100% focus to technology architectures. |
