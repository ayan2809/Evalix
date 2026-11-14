# Strategic Goals & Demo Roadmap — Evalix

> **Document Purpose:** Defines the product goals, target demo experience, built-in agent workflows, and the self-service zero-shot Agent Builder for **Evalix**.

---

## 1. Executive Demo Vision: The 2-Minute "Wow" Flow

A common problem with enterprise evaluation platforms is that onboarding a new agent requires writing complex SDK code, configuring YAML schemas, and deploying servers. 

For **Evalix**, our primary product goal is **instant, friction-free onboarding**:
> *Anyone—from a Product Manager to a non-technical judge—can create a custom agent in 30 seconds using a single prompt or guided Q&A, and immediately run a live chaos benchmark against it.*

```
                       THE EVALIX ONBOARDING & DEMO JOURNEY
                       
   ┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
   │  1. Zero-Shot Agent    │ ───► │  2. Instant Tooling    │ ───► │  3. Evalix Chaos Run   │
   │     Creation Studio    │      │     Assignment         │      │     & Metric Report    │
   │ (Prompt or 2-3 Qs)     │      │ (Tavily, Scraper, etc.)│      │ (Baseline vs. Chaos)   │
   └────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

---

## 2. Core Product Goals

### Goal 1: Zero-Shot Agent Builder (Self-Service Onboarding)
* **One-Prompt / Zero-Shot Generation:**
  * User enters a plain English prompt: e.g., *"Create an agent that investigates recent fintech funding rounds."*
  * Evalix automatically synthesizes the agent's system prompt, reasoning framework, error handling guidelines, and tool bindings.
* **Interactive Clarification Loop (For Refinement):**
  * If the user's prompt is ambiguous, the builder asks 2–3 brief, non-intimidating clarifying questions (e.g., *"Should this agent search the live web or internal docs? What time window should it prioritize?"*).
* **Instant Sandboxed Deployment:**
  * The newly minted agent is instantly assigned an endpoint inside the Evalix runtime, ready for immediate benchmarking.

---

### Goal 2: Pre-Built Tavily Agent Workflows (Out-of-the-Box Showcase)

> **Note (build):** In the hackathon build these three workflows became **task styles** inside one research category (find facts, check freshness, compare sources), not three separate agents. Every agent runs the same six Tavily-backed research tasks, so results can be compared fairly.
To ensure the platform is immediately demoable without manual setup, Evalix ships with pre-configured, high-value agentic workflows powered by **Tavily Search**:

#### Workflow A: Pre-Meeting Executive Briefing Agent (PS 05 Synergy)
* **Role:** Corporate Intelligence & Executive Research Assistant.
* **User Input:** Company name or executive profile + scheduled meeting date.
* **Tool Loop:** Queries Tavily with strict 30-day temporal bounds to extract recent launches, funding rounds, leadership hires, and controversies.
* **Benchmark Test:**
  * *Baseline:* Synthesizes a clean, 1-page source-attributed briefing.
  * *Chaos Test:* Inject a simulated `429 Rate Limit` on Tavily and a stale Wikipedia snippet. Evaluates if the agent course-corrects or hallucinates.

#### Workflow B: Real-Time Fact Verifier & Stale-Answer Detector (PS 06 Synergy)
* **Role:** Information Freshness & Groundedness Verification Agent.
* **User Input:** An AI-generated answer or draft document containing time-sensitive claims (pricing, API methods, regulations).
* **Tool Loop:** Deconstructs text into discrete factual claims, queries Tavily for current web ground truth, and computes a freshness delta score.
* **Benchmark Test:**
  * *Baseline:* Accurately flags outdated facts with direct citation URLs.
  * *Chaos Test:* Inject conflicting web sources. Evaluates if the agent highlights ambiguity or picks an unsupported answer.

#### Workflow C: Competitive Intelligence Deep-Search Agent
* **Role:** Autonomous Market Researcher.
* **User Input:** A market sector or target competitor (e.g., *"Compare Stripe and Adyen's latest European pricing models"*).
* **Tool Loop:** Multi-step autonomous research: iterative keyword planning $\rightarrow$ web query $\rightarrow$ evaluation of missing data $\rightarrow$ follow-up search $\rightarrow$ final synthesis.
* **Benchmark Test:**
  * *Baseline:* Executes a 3-step structured research path.
  * *Chaos Test:* Inject an empty search response on turn 2. Measures if the agent recovers with alternative search terms or enters an infinite loop.

---

### Goal 3: The Seamless Benchmark & Chaos Demonstration
* **Single-Click Benchmark Execution:**
  * User selects any created agent (or a pre-built Tavily agent) and clicks **"Run Benchmark"**.
* **Visual Side-by-Side Comparison:**
  * **Run 1 (Baseline):** Standard environment $\rightarrow$ 100% solve rate, clean path.
  * **Run 2 (Chaos Injection):** Intercepted tool call (simulated 500 error / 429 throttle) $\rightarrow$ Shows step-by-step trace of the agent detecting the fault, applying retry backoff, and successfully completing the goal.
* **Executive Summary Card:**
  * Plain-language metrics: Success Consistency (`pass^3`), Average Cost per Run (\$0.008), Fault Recovery Rate (100%), and Latency.

---

## 3. Success Metrics for the Demo

1. **Time-to-Agent:** A new user can create a working, testable agent in $< 45$ seconds.
2. **Cognitive Simplicity:** A Product Manager or non-technical evaluator can understand the entire demo narrative without asking technical jargon questions.
3. **Dual-Track Hackathon Proof:** Clearly demonstrates the synergy of **Bifrost** (gateway routing, cost tracking, model fallback) and **Tavily** (live web information retrieval).
