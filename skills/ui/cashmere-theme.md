# Claude Skill: Cashmere UI Theme

## Purpose

This skill applies a consistent **Cashmere-inspired design system** to user interfaces.

It ensures dashboards, portals, and visualizations follow a professional enterprise design language with:

- consistent colors
- clear semantic meaning
- accessible contrast
- restrained visual styling
- executive-ready presentation

This skill is used for **presentation-layer improvements only**.

It must **not modify data logic, architecture, or business rules**.

---

# When To Use This Skill

Use this skill when Claude is asked to:

- style a React dashboard
- improve UI consistency
- update chart color palettes
- add a system health banner
- standardize KPI cards
- improve dashboard visual polish
- style tables, panels, or navigation
- apply a consistent theme to diagrams

Do **not** use this skill for:

- backend logic
- publisher code
- SQL metric definitions
- artifact schemas
- architecture changes

---

# Design Principles

When applying the Cashmere theme, follow these principles.

### 1. Clarity First
Visual styling should improve readability and comprehension.

Avoid decorative colors that distract from the data.

### 2. Consistency
The same visual pattern must represent the same meaning everywhere.

Example:

```
Green = success
Red = failure
Amber = warning
```

### 3. Minimal Palette
Use a small number of colors intentionally.

Prefer neutral surfaces with selective accent colors.

### 4. Accessibility
Text and UI elements must maintain strong contrast.

Avoid low contrast color combinations.

### 5. Data First
Charts and KPIs must highlight data, not visual effects.

---

# Cashmere Color Tokens

Claude should use the following tokens when styling UI.

## Primary Brand Colors

Primary Blue

```
#1D4ED8
```

Primary Dark

```
#1E3A8A
```

Accent Teal

```
#0F766E
```

Accent Light

```
#CCFBF1
```

---

## Neutral UI Colors

Background

```
#F8FAFC
```

Surface (cards)

```
#FFFFFF
```

Border

```
#CBD5E1
```

Divider

```
#E2E8F0
```

---

## Typography Colors

Primary Text

```
#0F172A
```

Secondary Text

```
#475569
```

Muted Text

```
#94A3B8
```

---

## Semantic Colors

Success

```
#16A34A
```

Warning

```
#D97706
```

Error

```
#DC2626
```

Info

```
#2563EB
```

---

# Layout Styling Rules

## Page Background

Use a neutral background.

```
background: #F8FAFC
```

Avoid dark backgrounds unless explicitly requested.

---

## Cards

Cards are the primary container for dashboard content.

Card style:

```
background: white
border: 1px solid #CBD5E1
border-radius: 8px
padding: 16–24px
box-shadow: very subtle
```

Cards should appear clean and lightweight.

---

## KPI Cards

KPI cards display headline metrics.

Example layout:

```
Failures — Last 24h
        13
```

Rules:

- Label uses muted or secondary text
- Value uses strong emphasis
- Color only when meaningful

Example:

```
Failures → red
Success rate → green
Neutral counts → primary text
```

Avoid assigning arbitrary colors to KPIs.

---

## Tables

Tables should be simple and readable.

Header style:

```
font-weight: 600
background: #F8FAFC
border-bottom: 1px solid #CBD5E1
```

Row styling:

- subtle row separators
- no heavy striping
- use color only for badges or status indicators

---

## Charts

Charts should use restrained color palettes.

Primary metric color:

```
#1D4ED8
```

Secondary series (optional):

```
#0F766E
```

Gridlines:

```
#E2E8F0
```

Axis text:

```
#475569
```

Avoid multi-color charts unless multiple series require it.

---

# System Health Banner

System health indicators are important in operational dashboards.

Use semantic color blocks.

## Success Banner

```
background: #DCFCE7
text: #166534
```

Example message:

```
Status: SUCCESS
Data updated: 2026-03-07 16:41
Artifact version: 1.0.0
```

---

## Warning Banner

```
background: #FEF3C7
text: #92400E
```

Used for:

- stale data
- partial updates

---

## Error Banner

```
background: #FEE2E2
text: #991B1B
```

Used for:

- publisher failures
- missing artifacts

---

# Buttons

Primary button

```
background: #1D4ED8
color: white
```

Secondary button

```
background: white
border: 1px solid #CBD5E1
```

Danger button

```
background: #DC2626
color: white
```

Danger buttons should only be used for destructive actions.

---

# Mermaid Diagram Styling

When styling Mermaid architecture diagrams:

- Use strong color contrast
- Assign color groups to architecture layers
- Avoid pastel colors

Recommended layer colors:

| Layer | Color |
|-----|-----|
| Systems | #1D4ED8 |
| Data Pipelines | #2563EB |
| Storage | #0F766E |
| Metrics | #0D9488 |
| Publisher | #7C3AED |
| Artifacts | #9333EA |
| Delivery | #EA580C |
| UI | #DC2626 |

---

# Guardrails

Claude must **not**:

- change layout unless requested
- change data logic
- alter metric definitions
- mix multiple color themes
- reduce contrast
- use decorative gradients or flashy effects

The goal is **professional, restrained enterprise UI**.

---

# Example Instructions

Example 1

```
Use the Cashmere theme skill.

Apply consistent styling to this React dashboard:
- KPI cards
- system health banner
- tables
- charts

Do not modify layout or logic.
```

---

Example 2

```
Apply the Cashmere theme to this Mermaid architecture diagram.

Use strong color grouping for layers.
Maintain high readability.
```

---

# Future Extensions

Possible future enhancements:

- dark mode theme
- Tailwind token mapping
- chart palette standards
- component library tokens
- brand overrides per client

