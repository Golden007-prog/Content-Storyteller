# Implementation Plan: Premium UI Redesign

## Overview

This plan upgrades the Content Storyteller web app from its current functional UI to a premium AI SaaS aesthetic. All changes are purely visual — zero backend changes, zero API changes, zero new dependencies. The work extends Tailwind design tokens, refines CSS component classes, integrates premium layout components (Navbar, Footer, ModeSwitcher) into the App shell, adds homepage sections to the landing page, and ensures consistent premium styling across all page and output components. Property-based tests validate 14 correctness properties and unit tests cover rendering, accessibility, and functional preservation.

## Tasks

- [x] 1. Extend Tailwind design tokens and CSS component classes
  - [x] 1.1 Add new design tokens to `apps/web/tailwind.config.js`
    - Add `colors.surface.tint` (`rgba(139, 92, 246, 0.04)`)
    - Add `boxShadow` entries: `brand-sm`, `brand-md`, `card`
    - Add `backgroundImage.gradient-nav` for subtle navbar gradient
    - Preserve all existing tokens (brand colors, navy, gradients, keyframes, animations)
    - _Requirements: 1.1, 1.2, 1.3, 1.6_

  - [x] 1.2 Refine CSS component classes in `apps/web/src/index.css`
    - Ensure `.card` base uses `shadow-card` utility
    - Ensure `.section-lavender` references the surface tint token
    - Verify all required component classes are defined: `.card`, `.card-elevated`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.pill-brand`, `.pill-neutral`, `.input-base`, `.section-wrapper`, `.section-lavender`
    - Verify typography classes `.text-display`, `.text-heading`, `.text-subheading`, `.text-label` have explicit font-size, weight, and tracking
    - _Requirements: 1.4, 1.5_

  - [x] 1.3 Write property test for design token completeness (Property 1)
    - **Property 1: Design token completeness**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.6**

  - [x] 1.4 Write property test for CSS component class completeness (Property 2)
    - **Property 2: CSS component class completeness**
    - **Validates: Requirements 1.4, 1.5**

- [x] 2. Integrate premium App Shell layout in `apps/web/src/App.tsx`
  - [x] 2.1 Replace inline header with Navbar component
    - Import and render `Navbar` from `./components/layout/Navbar`
    - Pass `onLogoClick` (navigate to landing), `showNewProject` (true when not on landing), `onNewProject` (reset to landing) props
    - Remove the existing inline `<header>` element
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.1_

  - [x] 2.2 Replace inline footer with Footer component
    - Import and render `Footer` from `./components/layout/Footer`
    - Remove the existing inline `<footer>` element
    - Apply `min-h-screen flex flex-col` layout to root div so Footer is pushed to bottom
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.3, 5.4_

  - [x] 2.3 Replace inline mode toggle with ModeSwitcher component
    - Import and render `ModeSwitcher` from `./components/layout/ModeSwitcher`
    - Render centered below Navbar on landing view only
    - Remove the existing inline mode toggle buttons (the `<div className="inline-flex rounded-lg border...">` block)
    - Pass `mode` and `onModeChange` props
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.2_

  - [x] 2.4 Apply premium layout wrapper classes
    - Ensure main content uses `section-wrapper` for consistent max-width/padding
    - Apply `bg-gradient-to-br from-gray-50 to-gray-100` to the root container
    - Ensure `flex-1` on `<main>` so content fills between Navbar and Footer
    - _Requirements: 5.4, 5.5, 5.6_

- [x] 3. Checkpoint — Verify App Shell integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Add homepage sections to Landing Page
  - [x] 4.1 Add "Three Powerful Modes" feature cards section to `apps/web/src/components/LandingPage.tsx`
    - Add a static section with three feature cards (Batch Mode, Live Agent, Trend Analyzer) below the existing "What You'll Get" section or as a new homepage section
    - Each card has an icon, title, and description
    - Use consistent card styling (rounded-2xl, border-gray-100, shadow-sm, hover:shadow-md)
    - _Requirements: 6.2, 6.6_

  - [x] 4.2 Add process steps section to `apps/web/src/components/LandingPage.tsx`
    - Add a numbered 1-2-3-4 process steps section (Upload, Configure, Generate, Export)
    - Each step has a number badge, title, and description
    - Use section-wrapper for consistent layout
    - _Requirements: 6.3, 6.7_

  - [x] 4.3 Add stats section to `apps/web/src/components/LandingPage.tsx`
    - Add a stats section with at least 3 metrics (e.g., "10K+ Creators", "500K+ Campaigns", "98% Satisfaction")
    - Use large gradient-colored numbers (bg-gradient-brand bg-clip-text text-transparent)
    - Render inside section-lavender background
    - _Requirements: 6.4_

  - [x] 4.4 Add testimonials section to `apps/web/src/components/LandingPage.tsx`
    - Add at least 3 testimonial cards with quote, author name, and role/company
    - Use consistent card styling
    - _Requirements: 6.5, 6.6_

- [x] 5. Ensure consistent premium styling across page components
  - [x] 5.1 Verify and refine Batch Mode page styling in `apps/web/src/components/LandingPage.tsx`
    - Ensure HeroSection renders inside section-lavender with section-wrapper
    - Verify two-column layout uses lg breakpoint for responsive collapse
    - Verify sticky preview card uses card-elevated
    - Verify "What You'll Get" section uses section-lavender background
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 5.2 Verify and refine Live Agent page styling in `apps/web/src/components/LiveAgentPanel.tsx`
    - Ensure HeroSection renders inside section-lavender when no session
    - Verify chat area uses card-elevated consistently
    - Verify message alignment (user right, AI left) and gradient styling
    - Verify typing indicator with bouncing dots
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 5.3 Verify and refine Trend Analyzer page styling in `apps/web/src/components/TrendAnalyzerPage.tsx`
    - Ensure HeroSection renders inside section-lavender
    - Verify two-column layout with sidebar appearing after results
    - Verify pill-style filter buttons with gradient active state
    - Verify stats section at bottom with section-lavender and gradient numbers
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [x] 5.4 Verify and refine output view styling
    - Verify GenerationTimeline color coding (green/brand-purple/gray) and pulseGlow animation in `apps/web/src/components/GenerationTimeline.tsx`
    - Verify OutputDashboard progressive reveal animations in `apps/web/src/components/OutputDashboard.tsx`
    - Verify ExportPanel card styling and button layout in `apps/web/src/components/ExportPanel.tsx`
    - Verify CreativeBriefSummary card styling with pill badges in `apps/web/src/App.tsx`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 6. Checkpoint — Verify all styling and layout changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Write property-based tests
  - [x] 7.1 Write property test for ModeSwitcher active/inactive styling (Property 3)
    - **Property 3: ModeSwitcher active/inactive styling**
    - **Validates: Requirements 4.3, 4.4**

  - [x] 7.2 Write property test for ModeSwitcher click callback (Property 4)
    - **Property 4: ModeSwitcher click callback**
    - **Validates: Requirements 4.5**

  - [x] 7.3 Write property test for chat message alignment by role (Property 5)
    - **Property 5: Chat message alignment by role**
    - **Validates: Requirements 8.4**

  - [x] 7.4 Write property test for trend filter pill active styling (Property 6)
    - **Property 6: Trend filter pill active styling**
    - **Validates: Requirements 9.3**

  - [x] 7.5 Write property test for TrendCard content completeness (Property 7)
    - **Property 7: TrendCard content completeness**
    - **Validates: Requirements 9.4**

  - [x] 7.6 Write property test for GenerationTimeline color coding (Property 8)
    - **Property 8: GenerationTimeline color coding**
    - **Validates: Requirements 10.2**

  - [x] 7.7 Write property test for OutputDashboard progressive reveal (Property 9)
    - **Property 9: OutputDashboard progressive reveal**
    - **Validates: Requirements 10.3, 10.4**

  - [x] 7.8 Write property test for ExportPanel asset row rendering (Property 10)
    - **Property 10: ExportPanel asset row rendering**
    - **Validates: Requirements 10.5**

  - [x] 7.9 Write property test for CreativeBriefSummary field rendering (Property 11)
    - **Property 11: CreativeBriefSummary field rendering**
    - **Validates: Requirements 10.6**

  - [x] 7.10 Write property test for mode switching preserves behavior (Property 12)
    - **Property 12: Mode switching preserves behavior**
    - **Validates: Requirements 13.2**

  - [x] 7.11 Write property test for form submission parameter preservation (Property 13)
    - **Property 13: Form submission parameter preservation**
    - **Validates: Requirements 13.3**

  - [x] 7.12 Write property test for ExportPanel download functionality preservation (Property 14)
    - **Property 14: ExportPanel download functionality preservation**
    - **Validates: Requirements 13.7**

- [x] 8. Write unit tests
  - [x] 8.1 Write unit tests for Navbar rendering and accessibility
    - Verify Navbar renders logo, nav links, Sign In, Get Started
    - Verify Navbar uses `<header>` and `<nav>` semantic elements
    - Verify "New Project" button appears when `showNewProject=true`
    - Verify nav links hidden on small screens (md breakpoint class)
    - Test file: `apps/web/src/__tests__/premium-ui.unit.test.tsx`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 11.3_

  - [x] 8.2 Write unit tests for Footer rendering and accessibility
    - Verify Footer renders 4-column link grid, social icons, copyright
    - Verify Footer uses `<footer>` semantic element
    - Verify responsive grid classes (2 cols mobile, 4 cols md+)
    - Test file: `apps/web/src/__tests__/premium-ui.unit.test.tsx`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 11.4, 12.6_

  - [x] 8.3 Write unit tests for homepage sections
    - Verify Landing Page renders hero, modes cards, process steps, stats, testimonials
    - Verify consistent card styling classes
    - Verify section-wrapper usage
    - Test file: `apps/web/src/__tests__/premium-ui.unit.test.tsx`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 8.4 Write unit tests for accessibility attributes
    - Verify UploadForm drop zone has `role="button"`, `tabIndex=0`, `aria-label`
    - Verify GenerationTimeline has `role="list"` / `role="listitem"` and `aria-label`
    - Verify focus indicators on interactive elements
    - Test file: `apps/web/src/__tests__/premium-ui.unit.test.tsx`
    - _Requirements: 11.1, 11.2, 11.5, 11.6, 11.7_

  - [x] 8.5 Write unit tests for functional preservation
    - Verify mode switching renders correct page components
    - Verify trend-to-batch flow and creative direction flow
    - Verify no external font imports in index.css
    - Test file: `apps/web/src/__tests__/premium-ui.unit.test.tsx`
    - _Requirements: 12.7, 13.1, 13.2, 13.4, 13.5, 13.6_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests go in `apps/web/src/__tests__/premium-ui.property.test.tsx`
- Unit tests go in `apps/web/src/__tests__/premium-ui.unit.test.tsx`
- Test framework: Vitest + @testing-library/react + fast-check
- Checkpoints ensure incremental validation
- All existing components (Navbar, Footer, ModeSwitcher, HeroSection) are already implemented with premium styling — the main work is integration and consistency
