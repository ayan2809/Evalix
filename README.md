# Evalix — Framework-Agnostic Agent Benchmarking & Chaos Evaluation Platform

> **Hackathon Track:** Global AI Hackathon (Geek Room) · Bifrost by Maxim AI & Tavily Tracks  
> **Problem Statement 02:** Build a Benchmarking Platform for AI Agents, Not Just Models  
> **Primary Technology Stack:** Bifrost AI Gateway, Tavily Search API, Python / FastAPI, OpenTelemetry

---

## Overview

**Evalix** is a framework-independent benchmarking and evaluation platform designed specifically for multi-turn autonomous AI agents. Unlike traditional LLM benchmarks that evaluate static model weights, Evalix evaluates agents against real tasks under normal and simulated failure conditions (chaos engineering).

### Key Features
* **Framework-Agnostic Runner:** Evaluates agents built with LangChain, AutoGen, CrewAI, or vanilla HTTP/CLI agents as black boxes without code modification.
* **Chaos / Fault Injection Engine:** Intercepts model calls and tool executions to simulate HTTP 429 rate limits, 500 tool crashes, schema mismatches, and stale/poisoned web context.
* **Multi-Pillar Telemetry:** Tracks Task Success, Cost per Successful Task, `pass^k` consistency, tool selection efficiency, and latency.
* **Side-by-Side Comparison:** Compares agent versions and baseline vs. chaos runs with step-by-step trace diffs.

---

## Project Documentation
* 💡 [thinking.md](./thinking.md) — **The Thinking Process & AI Collaboration Log** (all prompts, architectural decisions, and co-creation history).
* 📘 [HACKATHON_GUIDE.md](./HACKATHON_GUIDE.md) — Complete rules, deadlines, prizes, and official problem statements.
* 🧠 [AGENT_BENCHMARKING_AND_EVALS_GUIDE.md](./AGENT_BENCHMARKING_AND_EVALS_GUIDE.md) — Deep-dive architecture, production metric taxonomy, and chaos injection design.
* 📂 [problem_statements/](./problem_statements) — Original challenge briefs (PDFs) and raw event schema.

---

## AI Collaboration & Transparency

In the spirit of open development, the complete interactive thought process, prompt engineering, and architectural trade-offs between the engineer and the AI assistant are documented in [thinking.md](./thinking.md). This highlights:
1. How problem statement 02 was selected based on enterprise engineering experience.
2. The dual-track strategy combining Bifrost (evaluator) and Tavily (evaluated subject).
3. The shift from naive single-turn model evals to active chaos engineering and multi-trial consistency (`pass^k`).
