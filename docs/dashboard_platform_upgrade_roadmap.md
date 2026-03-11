# Dashboard Platform Upgrade — Feature Roadmap

This roadmap is structured for a **plan → review → implement** workflow. The sequence is ordered so each step adds visible value while also laying the foundation for the next layer of the platform.

---

## 1. Dashboard Definition Schema
Create a configuration schema that defines a dashboard in data rather than hard-coded JSX.

**Goal:**  
Represent dashboard title, sections, widgets, layout, and widget bindings in a structured config object or JSON file.

**Why it matters:**  
This is the architectural pivot. Without this, everything else is still just manual page composition.

**Deliverable:**  
A `DashboardDefinition` contract with fields like:
- `id`
- `title`
- `description`
- `layout`
- `widgets`
- `filters`
- `defaults`

**Done looks like:**  
A dashboard can be described by config, even if rendering is still basic.

---

## 2. Dashboard Renderer
Build a generic renderer that reads the dashboard definition and renders widgets dynamically.

**Goal:**  
Replace page-specific JSX composition with a single rendering pipeline.

**Why it matters:**  
This turns “dashboard pages” into “dashboard instances.”

**Deliverable:**  
A `DashboardRenderer` component that:
- reads a dashboard config
- loops through widget definitions
- resolves widget type
- renders the correct component

**Done looks like:**  
At least one existing dashboard renders from config instead of custom JSX.

---

## 3. Widget Registry
Introduce a registry that maps widget types to actual React components.

**Goal:**  
Support reusable widget types like KPI cards, charts, tables, status panels, and trend blocks.

**Why it matters:**  
This creates the plugin-style architecture. New widget types become additive instead of requiring renderer rewrites.

**Deliverable:**  
A central registry such as:
- `kpi_card`
- `line_chart`
- `bar_chart`
- `data_table`
- `text_block`
- `alert_panel`

**Done looks like:**  
The renderer can resolve any registered widget type without hard-coded branching scattered across pages.

---

## 4. Reusable KPI Card Contract
Refactor KPI cards so they are driven by props/config instead of dashboard-specific logic.

**Goal:**  
Make KPI cards portable across multiple dashboards.

**Why it matters:**  
This is the first place users feel the platform becoming flexible.

**Deliverable:**  
A standard KPI card interface that supports:
- label
- primary value
- delta
- sparkline data
- status tone
- icon
- footnote
- click behavior

**Done looks like:**  
The same KPI card component is reused across at least two dashboards with different metrics.

---

## 5. Metric Catalog
Separate metric definitions from the visual KPI card component.

**Goal:**  
Define metrics in one place and bind them into widgets by metric ID.

**Why it matters:**  
This avoids duplicating labels, formatting rules, thresholds, and query mappings all over the UI.

**Deliverable:**  
A metric catalog with definitions like:
- `total_revenue`
- `active_customers`
- `failed_jobs`
- `avg_processing_time`

Each definition can include:
- label
- formatter
- semantic meaning
- threshold rules
- data source binding
- trend settings

**Done looks like:**  
A KPI widget references `"metric": "failed_jobs"` instead of hand-assembling everything inline.

---

## 6. Layout Abstraction
Move widget placement into a formal layout model.

**Goal:**  
Store layout metadata separately from widget logic.

**Why it matters:**  
This is what allows cards to be reordered, resized, and reused without rewriting pages.

**Deliverable:**  
A layout system with fields like:
- `x`
- `y`
- `w`
- `h`
- breakpoint variants
- section grouping

**Done looks like:**  
Widgets render in positions defined by layout config rather than fixed markup order.

---

## 7. Drag-and-Drop Dashboard Editing
Add the ability to move KPI cards and widgets around the dashboard.

**Goal:**  
Support interactive dashboard arrangement.

**Why it matters:**  
This is where the UI starts feeling like a real analytics product rather than a static demo.

**Deliverable:**  
Drag-and-drop and resize support, likely via a grid layout library.

**Done looks like:**  
A user can reposition cards and the layout updates correctly.

---

## 8. Persisted Layout State
Save dashboard layout changes so edits survive reloads.

**Goal:**  
Make layout customization durable.

**Why it matters:**  
Without persistence, drag-and-drop is just a toy. With persistence, it becomes a platform capability.

**Deliverable:**  
Store layout state in:
- local storage first, or
- database/user profile later

**Done looks like:**  
Move a card, refresh the page, and the dashboard opens in the updated layout.

---

## 9. Dashboard Directory / Registry
Create a central index of available dashboards.

**Goal:**  
Allow new dashboards to be registered declaratively.

**Why it matters:**  
This removes the need to manually wire routes and imports every time.

**Deliverable:**  
A `dashboardRegistry` or `dashboards/index.ts` that exposes:
- dashboard metadata
- routes
- titles
- icons
- access info

**Done looks like:**  
Adding a dashboard mostly means adding a config file and registering it once.

---

## 10. Add-New-Dashboard Workflow
Create the full developer path for adding a new dashboard quickly.

**Goal:**  
Make it easy to spin up new dashboards with minimal code.

**Why it matters:**  
This is the point of the upgrade: speed, consistency, and reuse.

**Deliverable:**  
A documented workflow and starter template for:
- dashboard config
- widget bindings
- default layout
- optional filters

**Done looks like:**  
A new dashboard can be created in minutes using mostly configuration.

---

## 11. Cross-Dashboard Widget Reuse
Allow the same widget definitions to be reused across multiple dashboards.

**Goal:**  
Promote true modularity instead of copy-paste.

**Why it matters:**  
This gives you a library of operational and commercial building blocks.

**Deliverable:**  
Shared widget presets such as:
- Revenue KPI set
- Customer health KPI set
- Operations health KPI set
- Pipeline latency KPI set

**Done looks like:**  
One widget or widget group appears on multiple dashboards with little or no duplication.

---

## 12. Dashboard Sections and Composition
Add support for grouped sections like “Executive Summary,” “Operational Health,” and “Trends.”

**Goal:**  
Structure dashboards beyond a flat list of widgets.

**Why it matters:**  
Real dashboards need narrative flow, not just a pile of cards.

**Deliverable:**  
Section definitions with titles, descriptions, and widget collections.

**Done looks like:**  
Dashboard configs can express both layout and information hierarchy.

---

## 13. Filter Bar Contract
Define dashboard-level filters that widgets can consume consistently.

**Goal:**  
Support global controls such as date range, segment, region, product, or customer.

**Why it matters:**  
A platform dashboard needs a shared filter model.

**Deliverable:**  
A filter schema and filter bar component that supports:
- defaults
- allowed values
- widget subscriptions
- query propagation

**Done looks like:**  
Changing a dashboard filter updates multiple widgets consistently.

---

## 14. Widget State Model
Standardize loading, empty, error, and stale states for every widget.

**Goal:**  
Make the dashboard feel robust and production-grade.

**Why it matters:**  
This is one of the biggest differences between prototypes and commercial products.

**Deliverable:**  
A shared widget shell or wrapper that handles:
- loading skeletons
- no-data messaging
- error display
- refresh timestamp
- retry behavior

**Done looks like:**  
All widgets behave consistently under real-world conditions.

---

## 15. Dashboard Plugin Contract
Define a clean contract for third-party or add-on dashboard modules.

**Goal:**  
Make future feature packs possible.

**Why it matters:**  
This is the “mini-Grafana” move. It signals platform thinking.

**Deliverable:**  
A plugin shape that can contribute:
- dashboards
- widgets
- metric definitions
- routes
- navigation metadata

**Done looks like:**  
A plugin folder can register a new dashboard without modifying core rendering logic much.

---

## 16. Widget Library Documentation
Document the available widget types, props, examples, and usage guidance.

**Goal:**  
Create internal developer ergonomics.

**Why it matters:**  
A system is only reusable if people know how to use it.

**Deliverable:**  
A concise design/developer guide showing:
- widget types
- configuration examples
- layout conventions
- naming standards
- dos and don’ts

**Done looks like:**  
Someone new to the project can add a dashboard or widget without reverse-engineering the whole app.

---

## 17. Dashboard Presets / Templates
Create starter dashboard templates for common use cases.

**Goal:**  
Accelerate future builds.

**Why it matters:**  
Templates make the platform feel intentional and scalable.

**Deliverable:**  
Templates like:
- executive overview
- operations monitoring
- commercial performance
- customer health
- engineering health

**Done looks like:**  
New dashboards can start from a template rather than from scratch.

---

## 18. Commercial Polish Layer
After the platform architecture is in place, add premium UX touches.

**Goal:**  
Make the dashboards feel alive rather than static.

**Why it matters:**  
This is where the platform becomes impressive visually.

**Deliverable:**  
Enhancements such as:
- animated KPI transitions
- hover states
- micro-interactions
- sparklines
- subtle depth and hierarchy
- section headers with context
- more intentional spacing and typography

**Done looks like:**  
The system feels like a modern product, not an internal admin page.

---

# Recommended Implementation Order

If sequencing for maximum leverage:

## Phase 1 — Foundation
1. Dashboard Definition Schema  
2. Dashboard Renderer  
3. Widget Registry  
4. Reusable KPI Card Contract  
5. Metric Catalog  

## Phase 2 — Layout and Flexibility
6. Layout Abstraction  
7. Dashboard Directory / Registry  
8. Add-New-Dashboard Workflow  
9. Cross-Dashboard Widget Reuse  
10. Dashboard Sections and Composition  

## Phase 3 — Interactivity
11. Drag-and-Drop Dashboard Editing  
12. Persisted Layout State  
13. Filter Bar Contract  
14. Widget State Model  

## Phase 4 — Platform Maturity
15. Dashboard Plugin Contract  
16. Widget Library Documentation  
17. Dashboard Presets / Templates  
18. Commercial Polish Layer  

---

# Highest-Leverage Starting Set

If the goal is to start with the strongest first batch for Claude, begin with:

1. **Dashboard Definition Schema**  
2. **Dashboard Renderer**  
3. **Widget Registry**  
4. **Reusable KPI Card Contract**  
5. **Metric Catalog**  

That is the real inflection point. Once those exist, the rest becomes a sequence of improvements rather than a redesign.

---

# Workflow Guidance

For each feature, use the same pattern:

- **Plan:** architecture, scope, constraints, acceptance criteria
- **Review:** challenge coupling, extensibility, naming, risks, overengineering
- **Implement:** smallest clean version that moves the platform forward

The review question to keep coming back to is:

**Does this make adding dashboards easier right now?**

That should remain the north star for the whole upgrade.

---

# Core Milestone

The most important milestone is not drag-and-drop, animation, or polish.

It is this:

**Can one existing dashboard render from a declarative config using a generic renderer and reusable KPI cards?**

Once that works, the project stops being a collection of dashboards and starts becoming a dashboard system.


---

# Claude Task Prompts — Plan / Review / Implement

**Artifact naming convention (normalized):**

All artifacts follow the exact format below:

`docs/plans/<feature_name>_plan.md`

`docs/reviews/<feature_name>_review.md`

Where `<feature_name>` uses **lowercase snake_case** and matches the feature identifier used in the prompt.

Examples:

- `dashboard_definition_schema_plan.md`
- `dashboard_renderer_plan.md`
- `widget_registry_plan.md`
- `kpi_card_contract_plan.md`
- `metric_catalog_plan.md`

This convention ensures:

• consistent artifact discovery
• predictable review file locations
• easier automation later

Language across prompts has been tightened to keep instructions concise and consistent.

---

The prompts below have been rewritten to match the project’s established Claude workflow style:
- explicit `Follow` instruction
- explicit `Stage: PLAN`
- named feature
- plan and review artifact paths
- requirement to write both artifacts to disk before returning
- clear non-goal of **no implementation yet**
- structured context, goal, requirements, output sections, verification, and deliverables

Each prompt is intended to be copied directly into Claude.

---

## 1. Dashboard Definition Schema

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Dashboard Definition Schema

Plan artifact:
docs/plans/dashboard_definition_schema_plan.md

Review artifact:
docs/reviews/dashboard_definition_schema_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

The reporting platform currently supports dashboard pages built through direct React composition.

The next architectural step is to move from page-specific JSX toward a configurable dashboard platform.

We want dashboards to be described by structured configuration rather than hard-coded layout composition.

This is the foundation for:

• reusable KPI cards  
• reusable widgets  
• easier dashboard creation  
• future drag-and-drop layout  
• future plugin-style dashboards

This feature is foundational. It should establish a clear contract without overengineering.

---

# Goal

Define a `DashboardDefinition` schema that allows a dashboard to be described entirely through configuration.

The schema should support at minimum:

• dashboard metadata  
• widget definitions  
• layout metadata  
• filter definitions  
• defaults / initial state

The result should be a clean, extensible contract that later features can build on.

---

# Requirements

The plan should cover:

• the shape of the dashboard definition  
• required vs optional fields  
• how widgets are referenced  
• how layout metadata is represented  
• how filters are attached at the dashboard level  
• how defaults are stored  
• how the schema avoids coupling to specific dashboard pages

The schema should be simple enough to implement quickly, but structured enough to support future features.

---

# Non-goals

The following must NOT be included in this feature:

• full renderer implementation  
• drag-and-drop behavior  
• persistence  
• plugin loading  
• visual redesign  
• broad refactor of all dashboards

This feature is strictly the schema / contract definition.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Current Problem / Limitation  
3. Proposed Schema Design  
4. Required Fields vs Optional Fields  
5. Example Dashboard Definition  
6. Files to Create or Modify  
7. Risks / Tradeoffs  
8. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• define one example dashboard through config  
• confirm schema supports metadata, widgets, layout, filters, and defaults  
• confirm schema does not depend on one specific dashboard page  
• confirm future widget types can be added without schema rewrite

---

# Deliverables

Write these artifacts to disk:

docs/plans/dashboard_definition_schema_plan.md  
docs/reviews/dashboard_definition_schema_review.md

---

## 2. Dashboard Renderer

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Dashboard Renderer

Plan artifact:
docs/plans/dashboard_renderer_plan.md

Review artifact:
docs/reviews/dashboard_renderer_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

The platform is moving from static, hand-composed dashboard pages toward configuration-driven dashboards.

A dashboard schema alone is not enough. The platform now needs a generic renderer that can read a dashboard definition and render the dashboard without page-specific JSX composition.

This renderer should become the central execution path for dashboard rendering.

---

# Goal

Define a `DashboardRenderer` design that can:

• read a dashboard definition  
• iterate through widget definitions  
• resolve widget types  
• render the dashboard from configuration  
• remain extensible for future widget types and layout capabilities

The first version should be minimal and clean, not overly abstract.

---

# Requirements

The plan should cover:

• renderer responsibilities  
• renderer inputs and outputs  
• how the renderer consumes dashboard config  
• how widget definitions are iterated  
• how layout metadata is respected  
• how unsupported widget types are handled  
• how to migrate one existing dashboard to validate the design

The renderer should not be tightly coupled to one dashboard or one widget type.

---

# Non-goals

The following must NOT be included in this feature:

• drag-and-drop editing  
• persisted layouts  
• plugin loading system  
• major routing redesign  
• visual polish changes

This feature is strictly the generic renderer layer.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Current Rendering Limitations  
3. Renderer Responsibilities  
4. Rendering Flow  
5. Error / Fallback Handling  
6. Files to Create or Modify  
7. Migration Strategy for One Existing Dashboard  
8. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• render one existing dashboard from config  
• confirm renderer is not hard-coded to one widget type  
• confirm unsupported widget handling is defined  
• confirm no page-specific composition is required for the migrated dashboard

---

# Deliverables

Write these artifacts to disk:

docs/plans/dashboard_renderer_plan.md  
docs/reviews/dashboard_renderer_review.md

---

## 3. Widget Registry

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Widget Registry

Plan artifact:
docs/plans/widget_registry_plan.md

Review artifact:
docs/reviews/widget_registry_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

A generic dashboard renderer will need a clean way to map widget types from configuration to real React components.

Right now, widget rendering risks becoming a chain of hard-coded conditional logic. That would create tight coupling and make the platform harder to extend.

The platform needs a registry-based approach so new widget types can be added cleanly.

---

# Goal

Define a `WidgetRegistry` pattern that maps widget type identifiers to renderable components.

This should support reusable widgets such as:

• KPI cards  
• line charts  
• bar charts  
• tables  
• text blocks  
• status panels

The design should be simple, explicit, and easy to extend.

---

# Requirements

The plan should cover:

• how widget types are named  
• how widgets are registered  
• how the renderer resolves a widget from the registry  
• how unknown widget types are handled  
• how the design supports future plugin expansion  
• where the registry should live in the project structure

---

# Non-goals

The following must NOT be included in this feature:

• plugin loader implementation  
• drag-and-drop logic  
• metric catalog logic  
• full widget redesign

This feature is strictly the registry contract and integration approach.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Current Coupling Risk  
3. Registry Design  
4. Widget Resolution Flow  
5. Unknown Widget Handling  
6. Files to Create or Modify  
7. Risks / Tradeoffs  
8. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• register at least two widget types conceptually  
• confirm renderer can resolve widgets without hard-coded branching  
• confirm unknown widget behavior is defined  
• confirm new widget types can be added with minimal code changes

---

# Deliverables

Write these artifacts to disk:

docs/plans/widget_registry_plan.md  
docs/reviews/widget_registry_review.md

---

## 4. Reusable KPI Card Contract

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Reusable KPI Card Contract

Plan artifact:
docs/plans/kpi_card_contract_plan.md

Review artifact:
docs/reviews/kpi_card_contract_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

The platform currently uses KPI cards, but they feel tied to specific dashboards and specific metrics.

We want KPI cards to become reusable dashboard primitives that can appear across multiple dashboards without custom per-page logic.

This is both an architecture and UX consistency improvement.

---

# Goal

Define a reusable KPI card contract that supports use across multiple dashboards and multiple metric types.

The KPI card contract should support at minimum:

• label  
• value  
• delta / change  
• trend / sparkline support  
• formatting  
• semantic tone / status  
• optional icon or footnote  
• optional click behavior

---

# Requirements

The plan should cover:

• required vs optional KPI card props  
• how dashboard-specific logic is removed  
• how KPI cards receive data  
• how formatting remains consistent  
• how the design supports different KPI use cases across dashboards  
• how the KPI card aligns with future metric catalog work

---

# Non-goals

The following must NOT be included in this feature:

• final visual polish pass  
• full metric catalog implementation  
• drag-and-drop layout changes  
• advanced animation system

This feature is about the reusable KPI card contract and component boundaries.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Current KPI Card Limitations  
3. Proposed KPI Contract  
4. Required vs Optional Props  
5. Example Usage Across Two Dashboards  
6. Files to Create or Modify  
7. Risks / Tradeoffs  
8. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• confirm one KPI card component can support multiple dashboards  
• confirm required props are clearly defined  
• confirm dashboard-specific logic is removed  
• confirm the contract remains compatible with future metric catalog integration

---

# Deliverables

Write these artifacts to disk:

docs/plans/kpi_card_contract_plan.md  
docs/reviews/kpi_card_contract_review.md

---

## 5. Metric Catalog

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Metric Catalog

Plan artifact:
docs/plans/metric_catalog_plan.md

Review artifact:
docs/reviews/metric_catalog_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

KPI cards and widgets should not each redefine labels, formatting rules, thresholds, and data bindings inline.

The platform needs a shared metric definition layer so dashboards can reference metrics by ID rather than duplicating metric logic in each widget.

This is an important separation-of-concerns step.

---

# Goal

Define a `MetricCatalog` structure that centralizes metric definitions.

Metric definitions should support at minimum:

• metric identifier  
• display label  
• formatting rules  
• thresholds / semantic interpretation  
• optional trend behavior  
• data source binding or query mapping

Widgets should be able to reference metrics by ID.

---

# Requirements

The plan should cover:

• metric definition shape  
• where the catalog lives in the project  
• how widgets reference a metric  
• how formatting and thresholds are centralized  
• how the design avoids coupling UI components to metric logic  
• how the system stays simple enough for current project scope

---

# Non-goals

The following must NOT be included in this feature:

• full backend query framework  
• broad data access refactor  
• dashboard plugin loader  
• visual redesign

This feature is about the metric contract and lookup model.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Current Metric Duplication Problem  
3. Proposed Metric Catalog Design  
4. Metric Definition Fields  
5. Widget Binding Model  
6. Files to Create or Modify  
7. Risks / Tradeoffs  
8. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• define at least two example metrics conceptually  
• confirm widgets can reference metrics by ID  
• confirm labels / formatting / thresholds are centralized  
• confirm UI components no longer need inline metric definitions

---

# Deliverables

Write these artifacts to disk:

docs/plans/metric_catalog_plan.md  
docs/reviews/metric_catalog_review.md

---

## 6. Layout Abstraction

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Layout Abstraction

Plan artifact:
docs/plans/layout_abstraction_plan.md

Review artifact:
docs/reviews/layout_abstraction_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

Dashboard widget placement is currently too static and too tied to page composition.

To support reusable dashboards and future drag-and-drop behavior, the platform needs a formal layout model that is stored in configuration rather than implied by JSX order.

---

# Goal

Define a layout abstraction for dashboard widgets.

The layout model should support at minimum:

• x / y position  
• width / height  
• section grouping compatibility  
• future responsive support  
• future drag-and-drop compatibility

---

# Requirements

The plan should cover:

• layout field definitions  
• how layout metadata is attached to widgets  
• how layout stays independent from widget logic  
• how responsive variants may be handled later  
• how the model supports future persistence and editing

---

# Non-goals

The following must NOT be included in this feature:

• drag-and-drop implementation  
• persisted user layouts  
• visual redesign  
• full section system implementation

This feature is about the layout contract only.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Current Layout Limitation  
3. Proposed Layout Model  
4. Integration with Dashboard Schema  
5. Future Compatibility Notes  
6. Files to Create or Modify  
7. Risks / Tradeoffs  
8. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• confirm widget placement can be described by config  
• confirm layout metadata is separate from widget component logic  
• confirm the model can support future drag-and-drop without redesign  
• confirm one dashboard could conceptually be rearranged through config only

---

# Deliverables

Write these artifacts to disk:

docs/plans/layout_abstraction_plan.md  
docs/reviews/layout_abstraction_review.md

---

## 7. Drag-and-Drop Dashboard Editing

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Drag-and-Drop Dashboard Editing

Plan artifact:
docs/plans/dashboard_drag_layout_plan.md

Review artifact:
docs/reviews/dashboard_drag_layout_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

Once layout is described by configuration, the next step is to allow dashboard widgets to be moved and resized interactively.

This will make the dashboard feel more like a commercial analytics platform and less like a fixed internal page.

The implementation should remain pragmatic and should likely rely on a mature layout library rather than custom drag behavior.

---

# Goal

Plan interactive drag-and-drop dashboard editing for widgets.

The first version should support:

• moving widgets  
• resizing widgets  
• updating layout state  
• staying compatible with the configuration-driven dashboard model

---

# Requirements

The plan should cover:

• recommended library choice  
• integration approach  
• how layout changes flow back into state  
• how widget components remain decoupled from drag logic  
• how to keep the first version minimal and stable

---

# Non-goals

The following must NOT be included in this feature:

• multi-user collaboration  
• database persistence  
• advanced permissions model  
• complete WYSIWYG editor

This feature is about basic interactive layout editing only.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Current Static Layout Limitation  
3. Library Recommendation and Rationale  
4. Proposed Interaction Model  
5. Layout State Update Flow  
6. Files to Create or Modify  
7. Risks / Tradeoffs  
8. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• confirm widgets can be moved  
• confirm widgets can be resized  
• confirm layout state updates correctly  
• confirm widget components do not need drag-specific logic embedded in them

---

# Deliverables

Write these artifacts to disk:

docs/plans/dashboard_drag_layout_plan.md  
docs/reviews/dashboard_drag_layout_review.md

---

## 8. Persisted Layout State

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Persisted Layout State

Plan artifact:
docs/plans/dashboard_layout_persistence_plan.md

Review artifact:
docs/reviews/dashboard_layout_persistence_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

Drag-and-drop editing only becomes a true platform feature if layout changes survive refresh and reopen.

The platform therefore needs a persisted layout model. The first version should likely favor a simple local persistence mechanism before expanding to server-backed persistence later.

---

# Goal

Plan persisted layout state for dashboards so user changes survive reload.

The design should:

• preserve default layouts  
• support user-modified layouts  
• remain compatible with future server-backed persistence

---

# Requirements

The plan should cover:

• recommended persistence approach for v1  
• how defaults vs saved layouts interact  
• how layout versioning or invalidation may be handled  
• how persistence integrates with drag-and-drop state updates

---

# Non-goals

The following must NOT be included in this feature:

• full account sync system  
• permissions model  
• collaborative editing  
• global preference framework

This feature is focused on layout persistence only.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Why Persistence Matters  
3. Recommended V1 Persistence Model  
4. Default Layout vs Saved Layout Rules  
5. Future Evolution Path  
6. Files to Create or Modify  
7. Risks / Tradeoffs  
8. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• move a widget and refresh the page  
• confirm saved layout is restored  
• confirm default layout still works for first-time load  
• confirm the design can evolve to server persistence later

---

# Deliverables

Write these artifacts to disk:

docs/plans/dashboard_layout_persistence_plan.md  
docs/reviews/dashboard_layout_persistence_review.md

---

## 9. Dashboard Registry

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Dashboard Registry

Plan artifact:
docs/plans/dashboard_registry_plan.md

Review artifact:
docs/reviews/dashboard_registry_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

As the number of dashboards grows, the platform needs a clean central place to register and discover them.

Without a registry, adding dashboards tends to require manual route wiring and scattered imports. That makes the system feel less platform-like and more ad hoc.

---

# Goal

Define a dashboard registry that provides a central index of dashboards.

It should support at minimum:

• dashboard identifier  
• route  
• title  
• optional icon / metadata  
• source configuration reference

---

# Requirements

The plan should cover:

• registry shape  
• where it lives in the project  
• how routes are derived or attached  
• how dashboards are added with minimal friction  
• how this fits future plugin or preset dashboards

---

# Non-goals

The following must NOT be included in this feature:

• plugin loader implementation  
• access control framework  
• full navigation redesign

This feature is about dashboard registration only.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Current Dashboard Discovery Limitation  
3. Proposed Registry Design  
4. Route / Metadata Handling  
5. Files to Create or Modify  
6. Risks / Tradeoffs  
7. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• add one dashboard through registry only  
• confirm route and metadata can be discovered centrally  
• confirm new dashboards do not require scattered manual wiring

---

# Deliverables

Write these artifacts to disk:

docs/plans/dashboard_registry_plan.md  
docs/reviews/dashboard_registry_review.md

---

## 10. Add-New-Dashboard Workflow

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Add-New-Dashboard Workflow

Plan artifact:
docs/plans/dashboard_creation_workflow_plan.md

Review artifact:
docs/reviews/dashboard_creation_workflow_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

A core goal of the platform upgrade is that adding a dashboard becomes fast, repeatable, and low-friction.

The system should make it obvious how to add a new dashboard without reverse-engineering the entire project.

---

# Goal

Define the standard workflow for creating a new dashboard.

The workflow should cover:

• required files  
• where config lives  
• where widgets are referenced  
• how registry integration works  
• naming conventions  
• how a developer validates the result

---

# Requirements

The plan should cover:

• minimal file set for a new dashboard  
• starter structure or template  
• naming and folder conventions  
• validation steps  
• how to keep the workflow simple enough for rapid iteration

---

# Non-goals

The following must NOT be included in this feature:

• full code generator / scaffolding CLI  
• plugin marketplace concept  
• documentation site implementation

This feature is about the standard project workflow only.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Current Dashboard Creation Friction  
3. Proposed Workflow  
4. Naming / Structure Standards  
5. Starter Template Recommendation  
6. Files to Create or Modify  
7. Risks / Tradeoffs  
8. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• create one new dashboard using the proposed workflow  
• confirm minimal code changes are required  
• confirm developer path is clear and repeatable

---

# Deliverables

Write these artifacts to disk:

docs/plans/dashboard_creation_workflow_plan.md  
docs/reviews/dashboard_creation_workflow_review.md

---

## 11. Cross-Dashboard Widget Reuse

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Cross-Dashboard Widget Reuse

Plan artifact:
docs/plans/widget_reuse_plan.md

Review artifact:
docs/reviews/widget_reuse_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

As dashboards expand, repeated widget definitions and repeated KPI groupings will create duplication.

The platform should support reusable widget building blocks and presets so common dashboard patterns can be composed quickly.

---

# Goal

Define an approach for cross-dashboard widget reuse.

This should support:

• reusable widget presets  
• reusable KPI groups  
• limited per-dashboard customization without copy-paste

---

# Requirements

The plan should cover:

• what should be reusable vs dashboard-specific  
• how presets or shared configs are represented  
• how dashboards override titles or bindings where needed  
• how reuse avoids brittle abstraction

---

# Non-goals

The following must NOT be included in this feature:

• full template marketplace  
• design-system overhaul  
• plugin loader implementation

This feature is about practical reuse patterns only.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Current Duplication Risk  
3. Proposed Reuse Model  
4. Presets vs Local Overrides  
5. Files to Create or Modify  
6. Risks / Tradeoffs  
7. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• reuse one widget or widget group across two dashboards  
• confirm local overrides are possible without copy-paste  
• confirm reuse model remains understandable

---

# Deliverables

Write these artifacts to disk:

docs/plans/widget_reuse_plan.md  
docs/reviews/widget_reuse_review.md

---

## 12. Dashboard Sections

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Dashboard Sections

Plan artifact:
docs/plans/dashboard_sections_plan.md

Review artifact:
docs/reviews/dashboard_sections_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

A flat list of widgets is functional but not ideal for readability.

Commercial dashboards usually have narrative structure with grouped areas such as Executive Summary, Operational Health, Trends, or Exceptions.

The platform should support section composition without making the schema too heavy.

---

# Goal

Define section support for dashboards.

Sections should support at minimum:

• section title  
• optional description  
• grouped widgets  
• compatibility with layout metadata

---

# Requirements

The plan should cover:

• section structure in the dashboard schema  
• how sections interact with layout  
• how section rendering affects hierarchy and readability  
• how to avoid unnecessary complexity

---

# Non-goals

The following must NOT be included in this feature:

• full CMS-like layout editor  
• broad redesign of existing page content  
• marketing-style landing page features

This feature is about dashboard hierarchy only.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Current Flat Layout Limitation  
3. Proposed Section Model  
4. Integration with Dashboard Schema and Layout  
5. Files to Create or Modify  
6. Risks / Tradeoffs  
7. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• define at least two conceptual sections for one dashboard  
• confirm widgets can be grouped under sections  
• confirm layout compatibility remains intact

---

# Deliverables

Write these artifacts to disk:

docs/plans/dashboard_sections_plan.md  
docs/reviews/dashboard_sections_review.md

---

## 13. Filter Bar Contract

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Filter Bar Contract

Plan artifact:
docs/plans/filter_bar_contract_plan.md

Review artifact:
docs/reviews/filter_bar_contract_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

As widgets become reusable and dashboards become configuration-driven, the platform needs a standard model for dashboard-level filters.

Without a shared filter contract, each widget risks inventing its own filter wiring.

---

# Goal

Define a dashboard-level filter bar contract.

The design should support common filters such as:

• date range  
• region  
• environment  
• client  
• segment

Widgets should be able to consume filter state consistently.

---

# Requirements

The plan should cover:

• filter definition shape  
• required metadata for filters  
• how defaults work  
• how widgets subscribe to filter state  
• how filter propagation remains clean and predictable

---

# Non-goals

The following must NOT be included in this feature:

• full query engine redesign  
• complex permissions logic  
• advanced saved search system

This feature is about the filter contract only.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Current Filter Inconsistency Risk  
3. Proposed Filter Contract  
4. Widget Subscription Model  
5. Default Value Handling  
6. Files to Create or Modify  
7. Risks / Tradeoffs  
8. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• define at least two dashboard-level filters conceptually  
• confirm multiple widgets can consume shared filter state  
• confirm defaults are well-defined  
• confirm filter handling does not require widget-specific custom wiring everywhere

---

# Deliverables

Write these artifacts to disk:

docs/plans/filter_bar_contract_plan.md  
docs/reviews/filter_bar_contract_review.md

---

## 14. Widget State Model

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Widget State Model

Plan artifact:
docs/plans/widget_state_model_plan.md

Review artifact:
docs/reviews/widget_state_model_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

Production dashboards need consistent handling for loading, empty, error, and stale states.

Without a shared state model, each widget tends to invent its own UX, which makes the product feel less polished and less reliable.

---

# Goal

Define a standard widget state model.

The design should support at minimum:

• loading state  
• empty state  
• error state  
• stale / last updated indication

---

# Requirements

The plan should cover:

• standard state definitions  
• where state handling should live  
• how widgets adopt a shared wrapper or shell  
• how the UX remains consistent across widget types

---

# Non-goals

The following must NOT be included in this feature:

• complete visual polish pass  
• retry orchestration system  
• backend caching redesign

This feature is about front-end widget state consistency.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Current Widget State Inconsistency  
3. Proposed State Model  
4. Shared Wrapper / Shell Approach  
5. Files to Create or Modify  
6. Risks / Tradeoffs  
7. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• confirm all widgets can express loading / empty / error consistently  
• confirm stale data treatment is defined  
• confirm the model reduces per-widget custom state handling

---

# Deliverables

Write these artifacts to disk:

docs/plans/widget_state_model_plan.md  
docs/reviews/widget_state_model_review.md

---

## 15. Dashboard Plugin Contract

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Dashboard Plugin Contract

Plan artifact:
docs/plans/dashboard_plugin_contract_plan.md

Review artifact:
docs/reviews/dashboard_plugin_contract_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

Once dashboards, widgets, and metrics are configuration-driven, the next maturity step is enabling modular add-on capability.

We want a clean contract that would allow future dashboard modules to contribute dashboards, widgets, and related metadata without requiring changes everywhere in core code.

---

# Goal

Define a dashboard plugin contract.

Plugins should be able to contribute some combination of:

• dashboards  
• widgets  
• metric definitions  
• navigation metadata

The design should stay intentionally lightweight.

---

# Requirements

The plan should cover:

• plugin contract shape  
• what plugins may register  
• how plugins integrate with the dashboard registry and widget registry  
• how to keep the first version simple and safe

---

# Non-goals

The following must NOT be included in this feature:

• marketplace / package distribution system  
• security sandboxing framework  
• remote plugin loading

This feature is about the contract only.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Why Pluginability Matters  
3. Proposed Plugin Contract  
4. Registry Integration Model  
5. Files to Create or Modify  
6. Risks / Tradeoffs  
7. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• define one conceptual plugin contribution  
• confirm plugin contract does not require core renderer redesign  
• confirm widgets and dashboards can be added modularly

---

# Deliverables

Write these artifacts to disk:

docs/plans/dashboard_plugin_contract_plan.md  
docs/reviews/dashboard_plugin_contract_review.md

---

## 16. Widget Library Documentation

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Widget Library Documentation

Plan artifact:
docs/plans/widget_library_docs_plan.md

Review artifact:
docs/reviews/widget_library_docs_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

A reusable widget system only becomes practical if developers can quickly understand what exists, how to use it, and when to choose one widget type over another.

The project needs lightweight but clear widget library documentation.

---

# Goal

Plan documentation for the widget library.

The documentation should cover:

• available widget types  
• key props / config fields  
• example usage  
• naming conventions  
• guardrails / best practices

---

# Requirements

The plan should cover:

• documentation structure  
• intended audience  
• where docs live in the repo  
• how examples should be presented  
• how to keep docs useful without becoming bloated

---

# Non-goals

The following must NOT be included in this feature:

• full docs website  
• Storybook adoption unless clearly justified  
• marketing documentation

This feature is about practical internal developer documentation.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Documentation Need  
3. Proposed Documentation Structure  
4. Example Coverage Recommendations  
5. Files to Create or Modify  
6. Risks / Tradeoffs  
7. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• confirm a new developer could identify available widgets  
• confirm usage examples are included conceptually  
• confirm naming / usage conventions are documented

---

# Deliverables

Write these artifacts to disk:

docs/plans/widget_library_docs_plan.md  
docs/reviews/widget_library_docs_review.md

---

## 17. Dashboard Templates

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Dashboard Templates

Plan artifact:
docs/plans/dashboard_templates_plan.md

Review artifact:
docs/reviews/dashboard_templates_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

Once the dashboard platform foundations are in place, common dashboard shapes should be reusable.

Templates or presets can accelerate creation of executive dashboards, operational dashboards, commercial dashboards, and other recurring layouts.

---

# Goal

Define a dashboard template / preset approach.

Templates should make it easier to start new dashboards with:

• common layout patterns  
• common widget groupings  
• common section structures

---

# Requirements

The plan should cover:

• what a template contains  
• how templates differ from concrete dashboards  
• how templates are customized into a real dashboard  
• how to keep the first version pragmatic

---

# Non-goals

The following must NOT be included in this feature:

• full scaffolding generator  
• UI-based dashboard builder  
• template marketplace

This feature is about reusable presets only.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Why Templates Matter  
3. Proposed Template Model  
4. Template vs Concrete Dashboard Rules  
5. Files to Create or Modify  
6. Risks / Tradeoffs  
7. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• define at least one conceptual template  
• confirm a new dashboard could start from the template  
• confirm templates do not overcomplicate the core system

---

# Deliverables

Write these artifacts to disk:

docs/plans/dashboard_templates_plan.md  
docs/reviews/dashboard_templates_review.md

---

## 18. Commercial UI Polish

**Prompt**

Follow:

skills/workflow/plan-review-loop.md

Stage: PLAN

Feature:
Commercial UI Polish

Plan artifact:
docs/plans/commercial_ui_polish_plan.md

Review artifact:
docs/reviews/commercial_ui_polish_review.md

Both artifacts must be written to disk before returning.

Do NOT implement code yet.

---

# Context

Once the platform architecture is in place, the dashboard experience should feel more like a production analytics product and less like a functional prototype.

This feature is about targeted polish, not a redesign.

The emphasis should be on small, high-leverage UX improvements.

---

# Goal

Define a commercial UI polish layer for the dashboard platform.

This should focus on refinements such as:

• micro-interactions  
• sparklines or trend hints  
• better spacing and typography  
• improved hierarchy  
• subtle motion where justified

---

# Requirements

The plan should cover:

• which visual improvements are highest leverage  
• how to keep changes incremental  
• how to avoid clutter or gratuitous animation  
• which shared components should absorb the improvements

---

# Non-goals

The following must NOT be included in this feature:

• complete redesign  
• route changes  
• artifact contract changes  
• framework migration

This feature is about polish only.

---

# Plan output sections

The plan should include:

1. Feature Overview  
2. Current UI Observations  
3. Recommended Polish Improvements  
4. Shared Components Likely Affected  
5. Risks / Tradeoffs  
6. Verification Checklist

---

# Verification checklist

Plan must include validation steps such as:

• confirm the UI feels more dynamic and commercial  
• confirm dashboard clarity is improved, not reduced  
• confirm architecture and contracts remain unchanged

---

# Deliverables

Write these artifacts to disk:

docs/plans/commercial_ui_polish_plan.md  
docs/reviews/commercial_ui_polish_review.md

---

# Suggested Git Commit Boundaries

Each feature should ideally map to **one branch and one pull request**. This keeps the architecture changes understandable and reviewable while allowing the platform to evolve incrementally.

Recommended naming convention:

`feature/dashboard-platform/<short-feature-name>`

Example:

`feature/dashboard-platform/dashboard-schema`

---

## Commit 1 — Dashboard Definition Schema

Branch:
`feature/dashboard-platform/dashboard-schema`

Scope:
- Introduce DashboardDefinition interface or schema
- Add example dashboard config
- No rendering changes yet

PR Goal:
Introduce the configuration model for dashboards.

---

## Commit 2 — Dashboard Renderer

Branch:
`feature/dashboard-platform/dashboard-renderer`

Scope:
- Implement DashboardRenderer
- Render dashboard from configuration
- Convert one existing dashboard to use renderer

PR Goal:
Enable config-driven dashboards.

---

## Commit 3 — Widget Registry

Branch:
`feature/dashboard-platform/widget-registry`

Scope:
- Introduce widget registry
- Register KPI card and at least one chart widget
- Update renderer to resolve widgets from registry

PR Goal:
Enable pluggable widget architecture.

---

## Commit 4 — Reusable KPI Card Contract

Branch:
`feature/dashboard-platform/kpi-card-contract`

Scope:
- Refactor KPI card component
- Introduce standardized props interface
- Replace any dashboard-specific KPI implementations

PR Goal:
Create reusable KPI card component.

---

## Commit 5 — Metric Catalog

Branch:
`feature/dashboard-platform/metric-catalog`

Scope:
- Introduce metric definition layer
- Add example metrics
- Bind KPI cards to metric IDs

PR Goal:
Separate metric logic from UI components.

---

## Commit 6 — Layout Abstraction

Branch:
`feature/dashboard-platform/layout-model`

Scope:
- Introduce layout metadata
- Update dashboard config to include layout
- Update renderer to respect layout

PR Goal:
Enable configuration-driven layout.

---

## Commit 7 — Drag-and-Drop Layout

Branch:
`feature/dashboard-platform/drag-layout`

Scope:
- Integrate grid layout library
- Enable widget dragging and resizing

PR Goal:
Interactive dashboard layout editing.

---

## Commit 8 — Persisted Layout

Branch:
`feature/dashboard-platform/layout-persistence`

Scope:
- Persist layout changes
- Restore layout on reload

PR Goal:
Layout edits survive refresh.

---

## Commit 9 — Dashboard Registry

Branch:
`feature/dashboard-platform/dashboard-registry`

Scope:
- Introduce dashboard registry
- Register dashboards and routes

PR Goal:
Central dashboard index.

---

## Commit 10 — Dashboard Creation Workflow

Branch:
`feature/dashboard-platform/dashboard-template`

Scope:
- Add dashboard template
- Document creation workflow

PR Goal:
Simplify adding dashboards.

---

## Commit 11 — Widget Reuse Library

Branch:
`feature/dashboard-platform/widget-library`

Scope:
- Create shared widget presets
- Demonstrate reuse across dashboards

PR Goal:
Reusable dashboard building blocks.

---

## Commit 12 — Dashboard Sections

Branch:
`feature/dashboard-platform/dashboard-sections`

Scope:
- Add section grouping support
- Render section headers

PR Goal:
Improve dashboard narrative structure.

---

## Commit 13 — Filter Bar

Branch:
`feature/dashboard-platform/filter-bar`

Scope:
- Introduce dashboard-level filters
- Connect widgets to filter state

PR Goal:
Shared dashboard filtering.

---

## Commit 14 — Widget State Model

Branch:
`feature/dashboard-platform/widget-states`

Scope:
- Introduce shared loading, empty, error states
- Wrap widgets with state handler

PR Goal:
Consistent widget UX.

---

## Commit 15 — Plugin Architecture

Branch:
`feature/dashboard-platform/plugin-system`

Scope:
- Define plugin contract
- Enable plugins to register widgets and dashboards

PR Goal:
Extensible platform architecture.

---

## Commit 16 — Widget Documentation

Branch:
`feature/dashboard-platform/widget-docs`

Scope:
- Document widget library
- Provide usage examples

PR Goal:
Developer onboarding support.

---

## Commit 17 — Dashboard Templates

Branch:
`feature/dashboard-platform/dashboard-presets`

Scope:
- Add preset dashboards

PR Goal:
Accelerate dashboard creation.

---

## Commit 18 — UI Polish

Branch:
`feature/dashboard-platform/ui-polish`

Scope:
- Add animations
- Improve spacing, typography, and interactions

PR Goal:
Production-grade analytics UX.

---

# Recommended Git Workflow

For each feature:

1. Create branch
2. Run Claude prompt
3. Implement minimal solution
4. Commit changes
5. Open PR
6. Review architecture before merge

Example commit message format:

```
feat(dashboard-platform): introduce widget registry
```

This keeps the evolution of the dashboard platform clean and traceable.

