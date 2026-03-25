# Design System Strategy: The Obsidian Intellectual



## 1. Overview & Creative North Star

The Creative North Star for this design system is **"The Digital Curator."**



Moving away from the generic "SaaS Dashboard" look, this system treats digital interfaces like a high-end, dark-mode editorial publication. It is designed to feel authoritative, cerebral, and immersive. We achieve this by rejecting the standard "boxes within boxes" layout in favor of **Intentional Asymmetry** and **Tonal Depth**.



Instead of rigid grids, we use breathing room (negative space) and sophisticated typography scales to guide the eye. The aesthetic is "AI-First"—meaning it feels liquid, responsive, and intelligently layered, rather than static and mechanical.



---



## 2. Colors & Surface Architecture

The color palette is built on a foundation of "Obsidian" neutrals, punctuated by a high-energy Indigo primary.



### The "No-Line" Rule

**Strict Mandate:** Designers are prohibited from using 1px solid borders to define sections. We do not "box" our content. Boundaries must be established exclusively through:

1. **Background Shifting:** Moving from `surface` (#070e1d) to `surface_container_low` (#0b1323).

2. **Negative Space:** Using the Spacing Scale (specifically `spacing.12` or `spacing.16`) to create a cognitive break between content blocks.



### Surface Hierarchy & Nesting

Treat the UI as a series of physical layers of polished stone and frosted glass.

* **Base Layer:** `surface` (#070e1d) - The deep "void" background.

* **Secondary Sections:** `surface_container` (#11192b).

* **Elevated Components (Cards):** `surface_container_high` (#161f33) or `surface_bright` (#212c43).



### The "Glass & Gradient" Rule

To inject "soul" into the AI-focused aesthetic, use Glassmorphism for floating overlays (Modals, Tooltips, Navigation Bars).

* **Implementation:** Use `surface_container` with an opacity of 70% and a `backdrop-blur` of 20px.

* **Signature Gradients:** For primary CTAs, do not use a flat fill. Apply a subtle linear gradient from `primary` (#a7a5ff) to `primary_dim` (#645efb) at a 135-degree angle to provide a tactile, glowing quality.



---



## 3. Typography

We utilize a modern, highly readable geometric font strategy.

* **Primary Font (Poppins):** Used for all headlines, display text, body, and labels. Chosen for its geometric, friendly yet professional structure that renders exceptionally clearly across devices.
* **Headings:** Must use pure white (#FFFFFF) to pierce through the dark background.
* **Styling:** Use `display-lg` for hero sections with tight letter-spacing (-0.02em) to create a bold, modern impact.
* **Body Text:** Use `body-lg` or `body-md` in light gray (#E2E8F0 / `on_surface`). This reduces eye strain compared to pure white while maintaining high accessibility.
* **Hierarchy:** Always skip a weight or size in the scale when transitioning from headline to body to create a "dramatic" typographic contrast.

---



## 4. Elevation & Depth

Depth in this system is organic, not artificial. We mimic ambient, low-light environments.



* **The Layering Principle:** Depth is achieved by "stacking" tones. A `surface_container_highest` (#1b263b) element should sit on a `surface_container_low` (#0b1323) background. This "natural lift" replaces the need for heavy-handed shadows.

* **Ambient Shadows:** For floating elements (e.g., active dropdowns), use a shadow with a 32px blur and 6% opacity. The shadow color should be tinted with `primary` (#4F46E5) rather than black to simulate light refracting through the UI.

* **The "Ghost Border" Fallback:** If a container absolutely requires a boundary (e.g., input fields), use the `outline_variant` token at **15% opacity**. It should be felt, not seen.

* **Roundedness:** Adhere to the `lg` (0.5rem) or `md` (0.375rem) tokens for main containers. Avoid overly round borders (`xl` or `2xl`) as they conflict with the sharp, intellectual tone set by the typography.

---



## 5. Components



### Buttons

* **Primary:** Gradient fill (`primary` to `primary_dim`), `full` roundedness, white text. No shadow on rest; `primary` glow on hover.

* **Secondary:** Ghost style. No background fill. `outline_variant` at 20% opacity. Text color is `primary`.

* **Tertiary:** Purely typographic. Use `label-md` with 2px underline offset.



### Cards & Lists

* **Prohibition:** Never use divider lines (`

`).



* **List Separation:** Use a subtle background shift on hover (`surface_bright`) and `spacing.4` vertical padding to separate items.

* **Cards:** Use `surface_container_high` (#161f33). Forfeit the border in favor of a `surface_bright` subtle top-glow (a 1px inner-shadow at the top edge).



### Input Fields

* **State:** Background should be `surface_container_lowest` (#000000) to create an "etched" look into the surface.

* **Focus:** Transition the "Ghost Border" from 15% opacity to 100% `primary` opacity.



### AI-Context Chips

* **Visual:** Use `secondary_container` (#4d329b) with `on_secondary_container` (#d6c9ff) text. These should feel like "gems" embedded in the dark surface.



---



## 6. Do's and Don'ts



### Do:

* **Do** use asymmetrical layouts. Place a large headline on the left and a small body paragraph offset to the right to create editorial tension.

* **Do** use `surface_container_highest` for the most important interactive elements.

* **Do** prioritize vertical rhythm using the `spacing.8` (2rem) and `spacing.12` (3rem) increments.



### Don't:

* **Don't** use pure black (#000000) for anything other than the `surface_container_lowest` (deep input wells).

* **Don't** use 100% opaque borders. They break the "Digital Curator" immersion.

* **Don't** use standard "drop shadows." If it looks like a traditional "window" shadow, it is too heavy for this system. Use ambient, wide-spread blurs.

* **Don't** clutter the screen. If a piece of information isn't vital, hide it behind a progressive disclosure pattern or a tooltip.