---
name: Evalix
description: An agent datasheet. Measured behaviour under stated fault conditions, drawn as marks in fixed cells and timing diagrams on a white sheet with solder-mask green bars.
colors:
  sheet-white: "#ffffff"
  quiet-fill: "#f1f3f3"
  ink: "#15181a"
  graphite: "#50585d"
  pencil: "#80878b"
  rule: "#d6d9db"
  control-rule: "#8c9397"
  divider: "#e4e9e7"
  plot-grid: "#e4e7e9"
  solder-mask: "#1f4d3a"
  solder-mask-deep: "#163a2b"
  solder-tint: "#e6efea"
  solder-wash: "#f0f5f2"
  rail-text: "#d5e3db"
  rail-line: "#6e9583"
  bar-hint: "#cfe0d7"
  slipped: "#b3261e"
  slipped-wash: "#fbe9e7"
  fault-caused: "#9a5b00"
  fault-wash: "#fbf1e0"
  fault-line: "#e6c995"
  recovered: "#1f4fa3"
  recovered-wash: "#e8eef8"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "46px"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 70"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0em"
    fontVariation: "'wdth' 70"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.2
    fontVariation: "'wdth' 78"
  answer:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum'"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 700
    lineHeight: 1.2
    fontVariation: "'wdth' 70"
  note:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  raw:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.3
  micro:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1.25
  micro-tight:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.25
  subhead:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.15
    fontVariation: "'wdth' 70"
  sheet-title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1.15
    fontVariation: "'wdth' 70"
  brand:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 72"
  brand-phone:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 72"
  display-phone:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.04
    fontVariation: "'wdth' 70"
  answer-phone:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.35
rounded:
  chip: "2px"
  control: "3px"
  sheet: "4px"
spacing:
  gutter: "16px"
  row: "10px"
  block: "24px"
  section: "30px"
  rail: "232px"
components:
  button-primary:
    backgroundColor: "{colors.solder-mask}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.solder-mask-deep}"
  button-secondary:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 16px"
  button-secondary-hover:
    backgroundColor: "{colors.quiet-fill}"
  button-quiet:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.solder-mask}"
    padding: "0 8px"
  chip:
    backgroundColor: "{colors.quiet-fill}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.chip}"
    height: "24px"
    padding: "0 8px"
  chip-slipped:
    backgroundColor: "{colors.slipped-wash}"
    textColor: "{colors.slipped}"
  chip-fault:
    backgroundColor: "{colors.fault-wash}"
    textColor: "{colors.fault-caused}"
  chip-recovered:
    backgroundColor: "{colors.recovered-wash}"
    textColor: "{colors.recovered}"
  input:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "38px"
    padding: "0 12px"
  section-bar:
    backgroundColor: "{colors.solder-mask}"
    textColor: "{colors.sheet-white}"
    typography: "{typography.headline}"
    height: "36px"
    padding: "7px 12px"
  side-rail:
    backgroundColor: "{colors.solder-mask}"
    textColor: "{colors.rail-text}"
    width: "{spacing.rail}"
  nav-item-current:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.solder-mask}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  title-block:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    padding: "9px 14px 10px"
  modal:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "22px 26px"
---

# Design System: Evalix

## Overview

**Creative North Star: "The Agent Datasheet"**

Every agent gets a datasheet, like the one that comes with an electronic part: what it did under stated fault conditions, written as a table of fixed cells and a timing diagram, not a board of number tiles. The page is a white sheet. A solder-mask green rail runs down the left edge and the same green fills every section bar. Everything else is ink on white, ruled with thin lines.

The look is plain and exact. Corners are square (2 to 4 px). Structure comes from borders, not shadows. Numbers use tabular figures so columns line up. One typeface does all the work: the page question and the table heads are set narrow and heavy, and body text is set at normal width. Colour is kept for trouble. The only colours besides ink and green say that something slipped, that we caused a fault, or that a run recovered. Getting through is ink, never green.

The system is built for an Operate mode: a builder scanning for hollow marks and a judge reading a live run. It must stay quiet so the marks and the timing diagrams carry the meaning.

**Key Characteristics:**
- White sheet, ink text, 1.5px ink rules under table heads and around title blocks.
- Solder-mask green only on the rail, section bars, primary actions and the current-item state.
- Results are SVG marks in fixed cells, not coloured pills or badges.
- Time is drawn as timing diagrams on one shared scale.
- One family, Archivo (variable), ranked by width and weight.
- Borders instead of shadows; the only shadow is under a dialog or a toast.
- Light only. There is no dark theme.

## Colors

A white sheet with ink and graphite for reading, one deep green for structure, and three trouble colours used sparingly.

### Primary
- **Solder-Mask Green** (#1f4d3a, oklch(38% 0.061 164)): the left rail, every section bar (with white type), primary buttons, links, focus rings, the "on" state of switches and segmented controls, model-call bars in timing diagrams, the caret and the browser theme colour. Hover goes to Deep Solder (#163a2b).
- **Solder Tint** (#e6efea): the hovered cell in the characteristics table (with a 1.5px green inset line) and row hover in the sheet tables. Wash (#f0f5f2) is a lighter version for quiet fills.

### Neutral
- **Sheet White** (#ffffff): page and surface. There is no off-white page.
- **Ink** (#15181a): body text, the 1.5px rules, the got-through mark, the answer bar in timing diagrams.
- **Graphite** (#50585d): secondary text, test conditions, hints, axis labels. All small secondary text uses graphite, not pencil.
- **Pencil** (#80878b): marks and strokes only (setup and running marks, leader lines, ticks). Never for body text.
- **Rule** (#d6d9db): 1px rules between rows and around cards. **Control Rule** (#8c9397) is the border of inputs and selects. **Divider** (#e4e9e7) and **Plot Grid** (#e4e7e9) sit inside sheets and plots.
- **Quiet Fill** (#f1f3f3): hover on buttons and rows, disabled fields, the chip background, the track behind progress.
- **Rail Text** (#d5e3db), **Rail Line** (#6e9583) and **Bar Hint** (#cfe0d7): the pale greens used for type and hairlines on top of solder green.

### Trouble only
- **Slipped Red** (#b3261e): slipped and crashed marks, the short reason beside a mark, failed steps, errors. Wash is #fbe9e7.
- **Fault-Caused Amber** (#9a5b00): a fault we caused (the tick on a timing diagram, a step that hit the fault, warnings). Wash is #fbf1e0, line is #e6c995.
- **Recovered Blue** (#1f4fa3): an agent that hit a problem and recovered. Wash is #e8eef8.

### Named Rules
**The Trouble-Only Rule.** Red, amber and blue appear only to say something went wrong, was caused, or was recovered from. A screen where everything passed is ink and green only. Never use green for "got through".

**The Pencil Rule.** Pencil (#80878b) is for strokes. Any text a person must read is Ink or Graphite.

**The Rare Green Rule.** Green is structure and action, not decoration. If a new element is not a bar, the rail, a primary action, a link or a current state, it is not green.

## Typography

**Display, headline and body font:** Archivo (self-hosted variable, weight 100 to 900, width 62% to 125%, with system-ui and sans-serif as fallback)
**Mono font:** the system monospace stack, for raw request and response bodies only

**Character:** One family doing two jobs. At 70% width and weight 700 to 800 it reads as a stamped drawing label (bars, column heads, the page question). At 100% width and weight 400 it is a calm reading face. Rank comes from width and weight, never from a second family.

### Hierarchy
- **Display, the page question** (800, 46px, line-height 1.04, width 70%, letter-spacing -0.01em; 32px under 860px): the one question each page answers, such as "Which agents hold up when things break?". Max about 20em, balanced wrapping.
- **Answer** (400, 21px, line-height 1.35; 19px under 860px, max 44em): the one-sentence result under the question.
- **Headline, section bar title** (700, 17px, width 70%): reversed white on a green bar.
- **Title** (700, 16px, width 78%): h3 and small headings, the "Running on" heading in the rail.
- **Body** (400, 15px, line-height 1.5, normal width, tabular figures on): all reading text. Table cells run 14 to 14.5px.
- **Label, column head** (700, 13.5 to 14px, width 70%): table heads, set in ink with a 1.5px ink rule below.
- **Note** (400, 12 to 13.5px, Graphite): test conditions under a problem name, hints, legends, tick labels (12px).
- **Subhead** (800, 20px, width 70%): headings inside sheets and dialogs (a made agent's name, the second-opinion card, dialog section titles). Action-sheet titles are 26px.
- **Caption** (400, 12px, Graphite): title block labels, plot labels, tick labels.
- **Micro** (600, 11.5px): the smallest labels only: plot point labels in a tight cluster, the "More agents" edge cue, chips' small counts.
- **Micro tight** (400, 11px): phone-only, for the red reasons under marks in the characteristics table, so all five agent columns fit at 390px. Never use it for anything a person must read at length.
- **Brand** (800, 26px, width 72%): the Evalix name in the rail. In dialogs the title is 800, 24px, width 70%.

### Named Rules
**The Width-Is-Rank Rule.** Narrow and heavy means "this is a heading, head or question". Normal width means "read this". Do not add a second typeface and do not use width for decoration.

**The Tabular Rule.** Tabular figures are on for the whole page. Numbers in tables are right-aligned so they compare by eye.

**The Raw-Only Mono Rule.** Monospace is only for raw request and response text. Names, numbers and timings stay in Archivo.

## Layout

A fixed 232px green rail on the left and a main sheet on the right (main padding 28px top, 44px sides, 72px bottom). Wide datasheet pages (Results, Run details, Compare) cap at 1320px; form-like pages cap at 1080px. Pages are left-aligned, never centred, and they begin with a ruled title block, then the page question, then the answer sentence.

Results is two columns: the characteristics table (flexible) beside a 330px column of plot, limits and setup, with a 24px row gap and 28px column gap. Blocks stack with 24px gaps (20px in the Results page, 30px between sections on form pages). Table rows use 9 to 10px vertical padding. Spacing is a few fixed steps, not a strict scale: 4, 8, 10, 12, 16, 18, 24, 30.

Responsive breakpoints seen in the build: 1180px (Results side column drops under the table), 1100px (Run details panels reflow), 860px (rail becomes a top bar with a scrolling nav row, gear opens Settings, page question drops to 32px), 720px (title block becomes one column of label and value rows, timing diagrams stack the lane name above its track, dialogs go full-screen), 560px (tables narrow their first columns). Under 860px the side gutter is 16px. Wide tables scroll sideways with a fading right edge and a hint, and the first column stays pinned.

Timing diagrams use a 132px name column and a flexible track, with every lane on one shared ruler.

## Elevation & Depth

Flat. Depth is made with borders, ink rules and the green bars, not with shadows or blur. Cards are a 1px Rule border on white. The characteristics table and sheet tables have no card at all, only rules.

### Shadow Vocabulary
- **Dialog and toast** (`box-shadow: 0 18px 48px rgb(21 24 26 / 24%)`): the only shadow in the system, plus the lighter one under the first-visit tour card (`0 8px 24px rgb(21 24 26 / 18%)`). It lifts a modal or a toast off the page. The modal also carries a 1.5px ink border, and a scrim of `rgb(21 24 26 / 42%)` covers the page.
- **Hot cell line** (`box-shadow: inset 0 0 0 1.5px #1f4d3a`): an inset line, not a shadow. It outlines the hovered or focused cell in the characteristics table.

### Named Rules
**The Borders-Not-Shadows Rule.** Surfaces are separated by 1px rules, 1.5px ink rules or a green bar. A drop shadow on a card, button or panel is wrong here.

## Shapes

Square datasheet geometry. Corners are 2px on chips and the switch knob, 3px on buttons, inputs, selects and segmented controls, and 4px on cards, dialogs and the toast. Section bars, title blocks, the "Running on" block, tables, the progress track and timing-diagram bars are fully square (0). Borders are 1px (Rule or Control Rule) for ordinary edges and 1.5px ink for the things that define a sheet: under table heads, around title blocks, around secondary buttons and segmented controls, on dialogs.

### The mark
Every result is a 14px square drawn in SVG (12px box, 2px stroke) and always sits in a fixed cell:
- **Got through:** filled ink square.
- **Slipped:** hollow red square.
- **Crashed:** hollow red square with a diagonal red strike.
- **Recovered:** filled blue square.
- **Setup problem:** dashed pencil square (not counted).
- **Still running:** pencil square with diagonal hatch.

A mark keeps its square shape and cell position in every table, key and chip. Words (Got through, Slipped, Crashed...) sit next to the mark or in an accessible label.

## Components

### Buttons
- **Shape:** square-ish, 3px radius, 36px tall (large 44px, small 30px), 600 weight, 14.5px text, 1.5px border.
- **Primary:** Solder-Mask Green fill and border, white text, 0 16px padding. Hover deepens to #163a2b. One primary action per area ("Start a run").
- **Secondary:** white fill, 1.5px ink border, ink text. Hover fills with Quiet Fill.
- **Quiet:** no fill or border, green text, 0 8px padding, underlined on hover.
- **States:** focus is a 2px green outline with a 2px offset (white on green surfaces, ink on the current rail item). Disabled is 50% opacity with a not-allowed cursor. Hover transitions take 120ms.

### Chips
- **Style:** 24px tall (22px small), 2px radius, 12.5px 600 text, Quiet Fill with Graphite text.
- **Variants:** slipped (red on red wash), fault (amber on amber wash), recovered (blue on blue wash), neutral. The "got through" chip has no fill: a filled ink square and plain words.

### Marks in the characteristics table
The signature cell. A row per problem (name in bold, the test condition in Graphite beneath), a column per agent, a mark in each cell with a short red reason next to a slip. Hovering or focusing a cell lights its row and column in Quiet Fill and the cell itself in Solder Tint with a green inset line; clicking opens that run. Cells are links with a 3px inset focus ring. On first load and as live results arrive, filled marks wipe in left to right, 260ms with a 30ms stagger in reading order (capped at index 60).

### Section bars
A full-width Solder-Mask Green bar, 36px minimum, with the title in reversed white (17px, 700, width 70%). A hint beside the title only reports state ("3 of 5 picked"), never explains; explanations live on the How it works page. Actions sit at the right edge as outlined white buttons or white text links. Every named block of a page is introduced by one. The bar is the heading itself, not a label above a heading.

### Title block
A ruled box (1.5px ink border) of label-over-value cells divided by 1px ink lines: label 12px Graphite, value 16px at weight 650. The last cell holds the page action, right-aligned. On phones it becomes one column of label and value rows.

### Tables
No card. 1.5px ink rule under the head row, heads in condensed bold ink, 1px Rule lines between rows, 10px by 12px cell padding. Row hover is Quiet Fill (general tables) or Solder Tint (sheet tables). Figures are right-aligned and tabular.

### Timing diagram
One lane per run or per test, all on one shared ruler (ticks at "nice" steps such as 1, 2, 5 or 10 seconds, a 1.5px ink baseline, 1px grid lines). Segments are 24px bars: model call is solder green with white text, tool call is white with a 1.5px ink border, final answer is ink, a step that hit our fault is amber on amber wash, a failed step is red on red wash, a blocked step is red-hatched. A wait is a dimension line with its length written on it. Vertical ticks mark the fault we caused (amber), a failure (red) and the point where two runs split (green, 2px). Labels hide or move above the bar when they do not fit. Each segment is a button when it can open a step.

### Inputs and selects
- **Style:** 38px tall (select small 30px), 1px Control Rule border, 3px radius, white fill, 15px 500 text. Selects are native with a custom chevron.
- **Focus:** border becomes Solder-Mask Green plus the global 2px green outline. Disabled uses Quiet Fill and Graphite text. Placeholders are Graphite.
- **Switch and segmented control:** rectangular. The switch is 42x24 with a 2px-radius white knob and turns green when on. The segmented control has a 1.5px ink border and a green fill for the chosen option.

### Navigation
The rail holds the Evalix name with its square-in-square icon, the nav list, a "Running on" block that opens Settings, and the account line. Nav items are 15px, Rail Text on green; hover adds a 10% white wash; the current page is a white pill with green bold text. The "Running on" block is a ruled title block in Rail Line colour with label and value rows. Under 860px the rail becomes a top bar with a horizontally scrolling nav row. Side tabs in dialogs use a 1.5px ink top rule and a green current row; top tabs underline the current tab with 3px ink.

### Dialogs
White, 1.5px ink border, 4px radius, up to 920px wide (520px narrow). The left nav is Quiet Fill with a 1.5px ink right rule. Opening is a 6px rise and fade over 160ms ease-out. Under 720px a dialog fills the screen.

### Plots
Characteristic plots are SVG with a 1.5px ink frame, 1px Plot Grid lines, 11.5 to 12px labels, ink points (red when the agent slipped) with thin pencil leader lines and direct labels, no legend box.

### First-run checklist
What an empty workspace shows instead of results: three ruled rows (add an agent, start a run, read the results), each with a mark (dashed while to do, filled when done), a 20px condensed heading and one line. The current step has a 3px Solder-Mask Green rule on its left and holds the only primary button. A "Read how it works" link sits under it.

### First-visit tour
A small non-modal card at the bottom right (full width at the bottom on phones): 1.5px ink frame, a 6px solder strip along the top drawn as an inner shadow, square corners. "2 of 5", a 20px condensed title, one sentence, Next and Skip. The rail item the step talks about gets a 2px white outline. Esc closes it; it shows once per browser and can be reopened from How it works.

### Choice buttons
For model-written questions: a wrapping row of rectangular buttons (34px, 1.5px Control Rule border, 3px radius, left-aligned text), radio semantics, the chosen one Solder-Mask Green with white text. "Something else" is always last and opens a text input below the row.

### Call path
The gateway's signature: one ruled strip from "Your agent" to the model, with a stop per Bifrost step on a 1.5px ink wire. Each stop is a button with a 12px square on the wire (filled once a real call passed it, dashed for stops explained but not run) and its name under it. The open stop is a Solder-Mask Green cell with white type and wire. Only one stop's panel is open at a time; inside it, a live test has a light heading on a 1.5px ink rule, never a second green bar. Under 860px the strip turns vertical with the wire down the left.

### Notices and states
A notice is a 1px bordered strip (neutral, amber or red). An empty state is an ink top rule and a rule below. An error state is a red-washed box with a 1.5px red border.

## Do's and Don'ts

### Do:
- **Do** answer in marks and timing diagrams first: a mark in a fixed cell, a bar on a shared scale. Add words beside them.
- **Do** put every named block under a Solder-Mask Green section bar with reversed white condensed type.
- **Do** rule tables with a 1.5px ink line under the head and 1px Rule lines between rows, with no card around them.
- **Do** keep colour for trouble: Slipped Red, Fault-Caused Amber, Recovered Blue. Got through is ink.
- **Do** keep corners at 2 to 4px (or 0 on bars and tables) and separate surfaces with borders.
- **Do** use Graphite (#50585d) for all secondary text and keep Pencil (#80878b) to strokes.
- **Do** give the one authored motion to marks (clip wipe, 260ms, 30ms apart). Everything else moves only in answer to a click, in 120 to 160ms ease-out. Under reduced motion, show the final state.
- **Do** write plain words in the UI: "run", "problem" (a fault we cause), "everyday question", "got through", "slipped", "crashed", "second opinion".
- **Do** keep the brand commitments in all copy and labels: never use the word "demo" (say "example" or "sample"), never name the author's employer, and only use the bank and card examples already approved.

### Don't:
- **Don't** build a dark dashboard of KPI tiles, line charts and a leaderboard. This system exists to refuse that.
- **Don't** colour "got through" green or any other colour. It is a filled ink square.
- **Don't** use drop shadows on cards, buttons or panels. The only shadow is under a dialog or toast.
- **Don't** add a second typeface, or use monospace outside raw request and response bodies.
- **Don't** use pill shapes, large radii or soft rounded cards.
- **Don't** replace a mark with a coloured badge or a coloured dot, and don't move a mark out of its fixed cell.
- **Don't** invent testimonials, customers, logos or press quotes. None exist yet.
- **Don't** add a dark theme without a new decision. The system is light only (`color-scheme: light`).
