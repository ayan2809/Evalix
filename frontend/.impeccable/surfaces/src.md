---
version: 1
slug: "src"
primary_target: "src"
related_targets: []
---

# Surface brief: Evalix web app (all screens)

Scope: the whole web app (Sign in, Results, Run details, Compare, Start a run with live progress, Make an agent,
Agents, Gateway test, Settings popup). Mode: Operate. Audience: agent builders first, then hackathon judges.
Job: see which agents survive which problems, find the exact step that broke, prove the gateway copes.
Memorable moment: the characteristics table where every result is a mark in a fixed cell.

## Direction contract

THESIS: Every agent gets a datasheet: measured behaviour under stated fault conditions, not a dashboard of
KPI tiles. Refuses the category default (dark eval dashboard with number tiles, line charts and a leaderboard).

OWN-WORLD: White sheet ground; solder-mask green #1F4D3A owns the left rail and every section bar (reversed
white type); ink #15181A, graphite #50585D, rule #D6D9DB, 1.5 px ink rules under table heads and around title
blocks; trouble only: slipped #B3261E, fault we caused #9A5B00, recovered #1F4FA3. One family, Archivo
(self-hosted variable): condensed 62-72 width for bars, column heads and page questions; normal width for
reading. Square corners (2-4 px), borders not shadows, tabular figures. Results are SVG marks in fixed cells:
filled ink square got through, hollow red square slipped, struck red square crashed, dashed grey setup problem.
Time is drawn as timing diagrams on one shared scale.

STORY: A builder reads the one-line answer, scans the table for hollow marks, opens a run, sees on its timing
diagram exactly where we broke it and what it did next, then compares it with an agent that got through.
A judge watches the Gateway test draw Bifrost's fallback, retries and spending cap as real timing diagrams.

FIRST VIEWPORT: Results. Green 232 px rail (brand, standard nav, "Running on" title block with gear for
Settings, account). Main: a ruled title block across the top (benchmark, date, runs, spent, graded by) with
"Start a run" at its right end; page question in condensed 46 px; answer sentence 21 px; then two columns:
left the green bar "Behaviour under fault conditions" and the characteristics table (row per problem with
its test condition, column per agent, fixed-cell marks plus a short red reason); right 330 px: "Problems
got through vs cost" characteristic plot from real data, "Limits for one run" (120 s, 15 model calls,
20 tool calls), "Test setup" (model, search, grading). Below the fold: "Who passed, and what it cost" and
the everyday-questions line. Signature interaction: hovering or focusing a mark highlights its row and
column and shows the reason; clicking opens the run. Motion grammar: one authored moment, marks ink in
(hollow to filled, clip wipe) in reading order 30 ms apart on load and as live results land; everything else
moves only in answer to a click (disclosures, dialogs, 160 ms ease-out); reduced motion shows final state.

FORM: Electronic component datasheet (title block, characteristics tables, characteristic plots, timing
diagrams), position 5 of 7 on the ordered list, seed:71bd5e0d4eea04ec. Raises: fixed-cell state marks (from
the timetable rack); one shared time scale (from the botanical folio); nothing disappears, it cancels (from
the ticket wallet); one fixed name plate per agent (from the character roster); one family, rank by width and
weight (from the type specimen).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict,
DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Whether the Sign in page keeps the example card or becomes a datasheet cover page (build decides).
