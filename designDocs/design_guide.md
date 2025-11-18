# 🤖 Dot Compliance Coding and Design Style Guide

This guide translates the Dot Compliance Brand Book (2025) into actionable technical specifications for writing **Python** code, **Lightning Web Components (LWC)**, and associated documentation. Adherence to these standards ensures consistency, clarity, and brand compliance across all technical assets, reinforcing our position as innovators in life sciences quality management.

---

### 1. 🎨 Brand Identity Overview

[cite_start]The Dot Compliance brand is defined by **consistency, relevancy, and distinction**[cite: 11]. [cite_start]Our tone is **confident with brevity**, **credible with precise terminology**, and **genuine**[cite: 642, 646, 654].

* **Core Colors:** Deep Purple (Primary) and Pink (Accent/CTA).
* [cite_start]**Key Attributes:** Bold, Innovative, Passionate, Helpful, Genuine[cite: 81].
* [cite_start]**Mission:** Become the industry standard in the life sciences for data-driven quality and compliance[cite: 45, 51].
* [cite_start]**Mascot:** **Dottie AI** (she/her), an integral, cutting-edge, autonomous agent (not a "chatbot")[cite: 631, 633, 638].

---

### 2. 💻 Code & Documentation Style Guidelines

#### Naming Conventions

[cite_start]All naming must be **precise** and avoid vague or fluffy language (e.g., avoid "leverage," "revolutionize," "transform")[cite: 627, 655].

| Language/Asset | Element | Convention | Example |
| :--- | :--- | :--- | :--- |
| **Python** | Modules, Variables, Functions | `snake_case` | `calculate_quality_risk()` |
| **Python** | Classes | `CamelCase` | `DeviationController` |
| **LWC (JS)** | Component Name, Methods, Properties | `camelCase` | `changeControlHistory` |
| **LWC (HTML)** | Custom Elements | `kebab-case` | `<c-workflow-chart>` |
| **CSS Variables** | Custom Properties | `kebab-case` | `--brand-color-primary` |
| **Product Names** | Code/Comments | [cite_start]**Title Case** (Xpress, Xact, Xpand) [cite: 620] | `eQMS_Xpress_Integration` |

#### Code Formatting

* **Indentation:** **4 spaces** for both Python and LWC (JS/HTML).
* **Line Length:** Max **100 characters** (for readability, especially in complex quality/compliance logic).
* [cite_start]**Acronyms:** In code comments and docstrings, introduce the full term first, followed by the acronym (e.g., "electronic Quality Management System (eQMS)")[cite: 624].
* **Commenting Style (Python):** Use Sphinx or Google style docstrings for public APIs. Use single-line comments (`#`) for inline explanations.
* [cite_start]**Dottie AI:** Refer to Dottie AI in all feature documentation as an **integral part** of the suite, not an optional add-on or a chatbot[cite: 635, 638].

---

### 3. 🌈 Color Palette Implementation

[cite_start]The color palette is inspired by the lab environment[cite: 185]. [cite_start]**Purple** is the primary brand color[cite: 184].

#### Primary & Extended Palette (HEX Values)

| Color Name | Weight | HEX Value | Usage in Code (CSS Variable) | Intended Use |
| :--- | :--- | :--- | :--- | :--- |
| **Deep Purple** | 500 | [cite_start]`#270648` [cite: 163, 206] | `--brand-color-primary` | Backgrounds, dark text, primary buttons. |
| **Purple** | 300 | [cite_start]`#7D32C7` [cite: 206, 248] | `--brand-color-secondary` | Wordmark, main headings, accents. |
| **Pink** | 500 | [cite_start]`#DD0087` [cite: 206, 226] | `--brand-color-cta` | [cite_start]**Calls to Action (CTAs)**, links, icons[cite: 202, 326, 562]. |
| **Pink** | 100 | [cite_start]`#FFE1FB` [cite: 282] | `--brand-color-link-bg` | Subtle accents, light link backgrounds. |
| **Gray-Purple** | 300 | [cite_start]`#ABA1B5` [cite: 250] | `--brand-color-neutral-med` | Supporting text, inactive states, borders. |
| **Gray-Purple** | 20 | [cite_start]`#F5F3FB` [cite: 307] | `--brand-color-neutral-light` | Light backgrounds, separation layers. |
| **Black** | 500 | `#270646` (assumed similar to 500) | `--brand-color-text-dark` | Standard body text, major outlines. |
| **White** | N/A | `#FFFFFF` | `--brand-color-text-light` | Text on dark backgrounds. |

#### Accent Colors (Product-Specific)

[cite_start]These should be used sparingly for product-level highlighting and infographics[cite: 208].

* [cite_start]**Blue 400:** `#54C3F4` [cite: 210, 239]
* [cite_start]**Green 400:** `#5EDBBB` [cite: 211, 244]
* [cite_start]**Gold 400:** `#FFBB60` [cite: 212, 245]

---

### 4. 🔤 Typography & Font Usage

#### Font Families

* [cite_start]**Primary Font:** **Quicksand** (Used for all headlines and short-form copy)[cite: 157].
* [cite_start]**Secondary Font:** **PT Serif** (Used for long-form text or "body copy")[cite: 175, 177].

#### Web Implementation (LWC/CSS)

Use the following CSS font stacks for web implementations to ensure browser compatibility:

| Usage | Font Stack | Weights |
| :--- | :--- | :--- |
| **Headlines** | `Quicksand, 'Helvetica Neue', sans-serif` | [cite_start]**Bold (700)**, Medium (500) [cite: 166, 167] |
| **Body Copy** | `'PT Serif', Georgia, serif` | [cite_start]Normal (400), Bold (700) [cite: 179, 180] |

| Element | Font Family | Weight | Color (Default) | Size (Recommended) |
| :--- | :--- | :--- | :--- | :--- |
| `<h1>` (Large Headlines) | Quicksand | Medium (500) | [cite_start]Deep Purple 500 [cite: 165] | `2.5rem` |
| `<h2>`, `<h3>` (Headlines) | Quicksand | Bold (700) | Deep Purple 500 | `1.5rem` to `2.0rem` |
| `<p>` (Body Text) | PT Serif | Normal (400) | Black 500 | `1.0rem` |
| **Buttons/Nav** | Quicksand | Bold (700) | Deep Purple 500 | `1.1rem` |

[cite_start]**Rule:** Use **Title Case** for all headlines (except blog/whitepaper titles) and buttons[cite: 616].

---

### 5. ✨ Design Elements & Components (LWC Focus)

#### Button & Call to Action (CTA) Styles

[cite_start]All CTAs (buttons, links) must be **Pink 500** or **White**[cite: 562].

* **Primary CTA (Button):**
    * Background: `--brand-color-cta` (Pink 500)
    * Text: White
    * Hover: Darken Pink 500 slightly.
* **Secondary/Tertiary (Link):**
    * Text: `--brand-color-cta` (Pink 500)
    * Underline: None or subtle on hover.

#### Iconography

* [cite_start]**Library:** Google Material Design library, specifically the **Material Symbols > Rounded collection**[cite: 310, 311].
* [cite_start]**Color:** **Dot Pink** (`--brand-color-cta`) whenever possible[cite: 326].
* [cite_start]**Style:** Avoid using **filled** or **"sharp"** icons; adhere to the same line weight and square structure as the Material Design collection[cite: 327, 329].

#### Layout & Spacing

To maintain consistency and scannability, all components must use a modular spacing scale based on an **8-pixel base unit**.

| Scale Value | Pixels | Use Case (LWC) |
| :--- | :--- | :--- |
| **Small** | `8px` | Padding within small elements (e.g., input field text). |
| **Medium** | `16px` | Standard padding for component edges; vertical spacing between paragraphs/small components. |
| **Large** | `24px` | Spacing between major sections or component groups. |
| **X-Large** | `32px` | [cite_start]Outer perimeter padding for full pages/containers[cite: 553]. |

---

### 6. 📝 Documentation & README Example

This example demonstrates the application of branding principles: **Title Case** for headlines, **precise terminology**, and proper **acronym introduction**.

```markdown
# 🚀 Dot Compliance: eQMS Xpress Core Module

[cite_start]The **eQMS Xpress** module sets a comprehensive foundation for essential quality processes[cite: 139, 620]. [cite_start]This component provides a ready-to-deploy interface, accelerating time-to-market for life sciences organizations[cite: 61, 56].

## Key Features

* [cite_start]**Document Management:** Streamlined control and access for all critical quality documentation[cite: 648].
* **Deviation Handling:** Proactive identification and tracking of quality deviations.
* [cite_start]**AI-Guided Workflows:** Supported by **Dottie AI (Agent)** for reliable decision guidance and recommendations on processes such as Corrective and Preventive Action (CAPA) and Change Control[cite: 633, 648].

## Technical Implementation (LWC)

This component uses the following design standards:

* **Primary Font:** Quicksand (Bold)
* **Button Styling:** Pink 500 (`--brand-color-cta`) for all 'Submit' and 'Approve' actions.
* **Iconography:** Material Symbols > Rounded (e.g., `check_circle_outline` icon for process completion).

## Getting Started

To install, clone the repository and deploy the module to your Salesforce instance. [cite_start]Ensure all necessary permissions for the electronic Quality Management System (eQMS) are configured[cite: 625].