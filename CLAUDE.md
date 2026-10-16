# 5-Layer Design Ecosystem — Claude Code Setup

> **Environment:** Claude Code | Last updated: 2026-09-22
> **Corrected (Sep 2026):** the original version of this file claimed Layers
> 2, 3 and parts of 5 were already installed in this project. They were not:
> `package.json` only has `motion@^12`, and no `impeccable`, `taste-skill`,
> `framer-motion`, `vaul`, or `skills/taste/`/`.claude/` folder exist in the
> repo. Only Layer 1 (this file's own rules) and Layer 4 (the `ui-ux-pro-max`
> Claude Code skill, which genuinely is available) were accurate. Statuses
> below are corrected; verify again before trusting any of them.
> This file documents the design quality stack loaded into this project.
> Claude Code reads this file automatically on every session.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 5 │ Emil Kowalski Principles — Motion & Feel     │
│  motion + vaul + framer-motion conventions              │
├─────────────────────────────────────────────────────────┤
│  LAYER 4 │ UI UX Pro Max — Design Knowledge Base        │
│  79 styles · 192 palettes · 119 UX rules · 22 stacks   │
├─────────────────────────────────────────────────────────┤
│  LAYER 3 │ Taste Skill — Visual Anti-Slop               │
│  7 skills · 7 templates · spacing/type/color discipline │
├─────────────────────────────────────────────────────────┤
│  LAYER 2 │ Impeccable — Anti-Pattern Detection          │
│  Live scan · DESIGN.md context · CI-ready               │
├─────────────────────────────────────────────────────────┤
│  LAYER 1 │ Foundation — Project Stack & Rules           │
│  This CLAUDE.md · coding standards · review gates       │
└─────────────────────────────────────────────────────────┘
```

---

## Layer 1 — Foundation (This File)

**Purpose:** Encode project-wide rules Claude Code reads before every task.

### Core Principles
- Every UI component must clear all 5 layers before shipping
- Mobile-first, accessible by default (WCAG AA minimum)
- Prefer composition over complexity
- Motion must convey meaning — decorative animation is rejected

### Coding Standards
- TypeScript strict mode
- Tailwind CSS for utility classes; CSS variables for design tokens
- No inline styles except for dynamic values
- Component props must include `className` for extension

---

## Layer 2 — Impeccable (Anti-Pattern Detection)

**Package:** `impeccable@3.6.0` | [impeccable.style](https://impeccable.style)
**Purpose:** Scans UI code and URLs for design anti-patterns in real time.
**Status: ❌ NOT set up in this project.** No `impeccable` dependency and no
`.claude/` config exist in the repo. The commands below are the tool's
documented usage, not confirmation it runs here — install and initialize it
first if you want to use it.

### Installation (Claude Code)

Run once in your project root inside Claude Code:

```
/impeccable init
```

Or via terminal, selecting the `claude` harness:

```bash
npx impeccable install
# When prompted: select "claude" → then "project"
# → Writes skills + commands into .claude/
```

### Usage

```bash
# Scan a file or directory
npx impeccable detect src/components/

# Scan a live URL (catches runtime CSS issues)
npx impeccable detect https://localhost:3000

# Scope to specific concern
npx impeccable detect src/ --scope type
npx impeccable detect src/ --scope layout

# JSON output for CI
npx impeccable detect src/ --json
```

### What It Catches
- Spacing values off a consistent scale
- Text below 4.5:1 contrast ratio
- Multiple competing accent colors
- Typography hierarchy violations
- Layout anti-patterns (horizontal scroll, fixed-px containers)

### Config
```
.impeccable/config.json   ← detector settings (already created)
DESIGN.md                 ← optional design system context for smarter scanning
```

---

## Layer 3 — Taste Skill (Visual Anti-Slop)

**Package:** `taste-skill@1.0.0` | [npm](https://www.npmjs.com/package/taste-skill)
**Purpose:** Enforces intentional design fundamentals — prevents AI-generated slop.

### Installation Status: ❌ NOT installed in this project

No `taste-skill` dependency and no `skills/taste/` or `templates/taste/`
folder exist in the repo as of Sep 2026. The command below is what
installing it would look like, not confirmation it has been run here.

```bash
npx taste-skill init
# Would output, if run:
# skills/taste/          ← 7 SKILL.md files (Hermes-compatible)
# templates/taste/       ← 7 .txt prompt templates
```

### Available Skills

| Skill | File | Use When |
|-------|------|----------|
| `default` | `skills/taste/default/SKILL.md` | Any UI task (always load this) |
| `soft-calm` | `skills/taste/soft-calm/SKILL.md` | Wellness, finance, productivity apps |
| `editorial` | `skills/taste/editorial/SKILL.md` | Content-heavy, magazine-style layouts |
| `strict-gsap` | `skills/taste/strict-gsap/SKILL.md` | GSAP animation with discipline |
| `redesign` | `skills/taste/redesign/SKILL.md` | Refactoring existing UI |
| `complete-output` | `skills/taste/complete-output/SKILL.md` | Full-page generation tasks |
| `image-gen` | `skills/taste/image-gen/SKILL.md` | AI image prompts for UI mockups |

### Quick Reference (Default Rules)

| Principle | Rule |
|-----------|------|
| Spacing | Use `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64` scale only |
| Typography | Max 2 typefaces; 3 size levels per component max |
| Color | 1 accent + neutrals; derive states from same hue |
| Hierarchy | One primary action per screen. One. |
| Borders | Prefer spacing + background shifts; borders are a last resort |

---

## Layer 4 — UI UX Pro Max (Design Knowledge Base)

**Type:** Claude Code Skill (system-level, no npm install needed)
**Location:** `.claude/skills/ui-ux-pro-max/` (managed by Claude Code)
**Purpose:** 79 searchable styles, 192 palettes, 119 UX guidelines, 17 GSAP presets, 22 stacks.

### This skill auto-activates on UI tasks. To query it manually:

```bash
# Generate full design system for a new project
python "${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py" \
  "SaaS dashboard modern minimal" --design-system -p "MyProject"

# Query specific domain
python "${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py" \
  "keyboard focus modal" --domain ux

# Stack-specific implementation guidance
python "${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py" \
  "suspense streaming" --stack nextjs

# With design dials (variance 1-10, motion 1-10, density 1-10)
python "${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py" \
  "analytics dashboard" --design-system --variance 6 --motion 5 --density 8
```

### Priority Hierarchy (Layer 4 enforces this order)

1. **Accessibility** — 4.5:1 contrast, keyboard nav, ARIA
2. **Touch & Interaction** — 44×44px min targets, loading states
3. **Performance** — WebP/AVIF, lazy load, CLS < 0.1
4. **Style Selection** — match product type, consistent system
5. **Layout & Responsive** — mobile-first, no horizontal scroll
6. **Typography & Color** — 16px base, 1.5 line-height, semantic tokens
7. **Animation** — context-aware timing, spring physics
8. **Forms & Feedback** — visible labels, inline errors
9. **Navigation** — bottom nav ≤5 items, predictable back
10. **Charts & Data** — legends, tooltips, accessible colors

---

## Layer 5 — Emil Kowalski Motion Principles (Interactions Layer)

**Inspiration:** Emil Kowalski ([@emilkowalski_](https://twitter.com/emilkowalski_)), Stripe
**npm packages actually installed in this project:** `motion@^12` only.
`framer-motion` and `vaul` are NOT installed — install them first if you
intend to follow this layer's guidance.

> **Note:** `npx skillq@latest add emilkowalski/skills` does not exist as a published
> package. Emil's contributions live in npm packages and his public GitHub. The
> motion layer is implemented via the packages above + the principles below.

### Install

```bash
npm install motion framer-motion vaul
# Only `motion` is currently installed in this project; framer-motion and
# vaul are not, despite what an earlier version of this file claimed.
```

### Core Motion Principles (Emil Kowalski Style)

**1. Spring Physics Over Cubic Bezier**
```tsx
// ✅ Feels alive
transition={{ type: "spring", stiffness: 400, damping: 30 }}

// ❌ Feels mechanical
transition={{ duration: 0.3, ease: "easeOut" }}
```

**2. Immediate Response, Delayed Completion**
```tsx
// Input responds at 0ms; settle animation takes time
// The finger/cursor never waits — the UI does
transition={{ type: "spring", stiffness: 600, damping: 35 }}
```

**3. Exit Animations Are Faster Than Entrances**
```tsx
const variants = {
  enter: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit:  { opacity: 0, y: -8, transition: { duration: 0.15 } }, // 40% faster
}
```

**4. Only Animate Transform + Opacity (compositor thread)**
```tsx
// ✅ GPU-accelerated
animate={{ x: 0, opacity: 1, scale: 1 }}

// ❌ Forces layout recalculation
animate={{ width: "100%", height: "auto", marginTop: 0 }}
```

**5. Vaul Drawer for Mobile Sheets**
```tsx
import { Drawer } from 'vaul'
// Use instead of Dialog for bottom-sheet patterns on mobile
// Handles: snap points, drag to dismiss, velocity-aware release
```

**6. Motion Conveys Spatial Relationships**
```tsx
// Elements that enter from where they "came from"
// Menus slide from the element that triggered them
// Modals scale from the trigger's position
```

### GSAP for Complex Choreography

For scroll-driven sequences, use GSAP + ScrollTrigger (see `skills/taste/strict-gsap/SKILL.md`):

```bash
npm install gsap
```

```tsx
// Stagger reveals: 0.08s between items (Emil's observed timing)
gsap.from(".card", {
  opacity: 0, y: 24,
  stagger: 0.08,
  ease: "power2.out",
  duration: 0.4
})
```

---

## Usage: How the 5 Layers Work Together

When Claude Code generates UI, it runs this mental checklist:

```
1. [LAYER 1] Does this follow project coding standards?
2. [LAYER 2] Would impeccable detect any anti-patterns here?
             → Run: npx impeccable detect <output-file>
3. [LAYER 3] Does this pass Taste Skill rules?
             → Spacing on scale? Max 2 typefaces? 1 accent color?
4. [LAYER 4] Is the design system consistent with UX Pro Max guidance?
             → Accessible? Mobile-first? Correct component pattern?
5. [LAYER 5] Does any interaction feel "instant but alive"?
             → Spring physics? Exit faster than enter? Transform-only?
```

---

## Quick Commands Reference

```bash
# Scan for design anti-patterns
npx impeccable detect src/

# Regenerate taste skill templates
npx taste-skill init --skills-only

# List taste skills
npx taste-skill list

# Generate design system (UI UX Pro Max)
# Run inside Claude Code — the skill handles this automatically

# Check impeccable for updates
npx impeccable check
```

---

## What Was Installed (Honest Status)

| Layer | Tool | Status | Method |
|-------|------|--------|--------|
| 1 | CLAUDE.md + project rules | ✅ Complete | This file |
| 2 | Impeccable CLI | ❌ Not installed | `npm install impeccable` first |
| 2 | Impeccable skills (`.claude/`) | ❌ Not set up | `/impeccable init` (untested here) |
| 3 | Taste Skill (7 skills + 7 templates) | ❌ Not installed | `npx taste-skill init` (untested here) |
| 4 | UI UX Pro Max | ✅ System skill | Managed by Claude Code |
| 5 | motion | ✅ Installed (`^12`, not `13.x`) | `npm install` |
| 5 | framer-motion, vaul | ❌ Not installed | `npm install framer-motion vaul` |
| 5 | Emil Kowalski principles | ✅ Documented (aspirational until 5's packages are installed) | This file (Layer 5 section) |

---

*Generated by Claude Code — Principal Frontend & System Architect mode*
