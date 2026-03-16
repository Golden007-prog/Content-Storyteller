# Requirements Document

## Introduction

This specification covers a premium UI/UX redesign of the existing Content Storyteller web application. The redesign upgrades the visual presentation to a modern, premium AI SaaS product aesthetic featuring soft lavender/purple gradients, generous whitespace, refined card-based layouts, and strong typography hierarchy. All existing functionality (Batch Mode, Live Agent, Trend Analyzer) is preserved with zero backend or API contract changes. The redesign targets four key surfaces: the global layout shell (Navbar, Footer, ModeSwitcher), the Landing/Home page, the Batch Mode page, the Live Agent page, and the Trend Analyzer page.

## Glossary

- **App_Shell**: The top-level layout wrapper in App.tsx that renders the Navbar, ModeSwitcher, main content area, and Footer across all views.
- **Navbar**: The persistent top navigation bar component (Navbar.tsx) containing the logo, navigation links, Sign In button, and Get Started CTA.
- **Footer**: The bottom-of-page component (Footer.tsx) with a 4-column link grid, social icons, and copyright bar.
- **ModeSwitcher**: The pill-style toggle component (ModeSwitcher.tsx) that switches between Batch Mode, Live Agent, and Trend Analyzer.
- **Landing_Page**: The Batch Mode entry view (LandingPage.tsx) with upload form, configuration, preview card, and "What You'll Get" section.
- **Live_Agent_Page**: The Live Agent chat interface (LiveAgentPanel.tsx) with hero section, chat area, sidebar, and input bar.
- **Trend_Analyzer_Page**: The trend discovery interface (TrendAnalyzerPage.tsx) with filters, trend cards, AI insights sidebar, and stats section.
- **HeroSection**: The reusable hero banner component (HeroSection.tsx) used at the top of each mode page.
- **Design_System**: The shared set of Tailwind utility classes, CSS component classes, and design tokens defined in index.css and tailwind.config.js.
- **Tailwind_Config**: The Tailwind CSS configuration file (tailwind.config.js) that defines custom colors, animations, gradients, and theme extensions.
- **Premium_Theme**: The target visual language characterized by soft lavender/purple gradients, white/light surfaces, rounded-2xl corners, refined shadows, generous whitespace, and strong typography hierarchy.

## Requirements

### Requirement 1: Tailwind Design System Upgrade

**User Story:** As a developer, I want a unified premium design token system in Tailwind, so that all components share consistent colors, spacing, shadows, and typography.

#### Acceptance Criteria

1. THE Tailwind_Config SHALL define an extended color palette including brand-50 through brand-900 (lavender/purple), navy-800 and navy-900 (dark footer), and surface tint colors (brand-50/60 for tinted backgrounds).
2. THE Tailwind_Config SHALL define custom gradient utilities for `gradient-brand`, `gradient-hero`, `gradient-cta`, and a new `gradient-nav` (subtle top-bar gradient).
3. THE Tailwind_Config SHALL define custom shadow utilities including `shadow-brand-sm`, `shadow-brand-md`, and `shadow-card` for refined elevation levels.
4. THE Design_System SHALL define reusable CSS component classes for `.card`, `.card-elevated`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.pill-brand`, `.pill-neutral`, `.input-base`, `.section-wrapper`, and `.section-lavender` in index.css using Tailwind @apply directives.
5. THE Design_System SHALL define typography classes `.text-display`, `.text-heading`, `.text-subheading`, and `.text-label` with explicit font-size, font-weight, and tracking values.
6. THE Design_System SHALL define animation keyframes and utilities for `fadeIn`, `fadeInUp`, `slideIn`, `shimmer`, and `pulseGlow` in the Tailwind_Config.

### Requirement 2: Premium Navbar Redesign

**User Story:** As a user, I want a polished, sticky top navigation bar with clear branding and navigation, so that I can easily orient myself and access key actions.

#### Acceptance Criteria

1. THE Navbar SHALL render as a sticky top-0 element with a white/translucent background (bg-white/80), backdrop-blur-lg, and a subtle bottom border (border-gray-100).
2. THE Navbar SHALL display the Content Storyteller logo (gradient icon + bold text) on the left side, functioning as a home navigation button.
3. THE Navbar SHALL display horizontal navigation links (Features, Pricing, Resources, About) in the center, hidden on screens smaller than md breakpoint.
4. THE Navbar SHALL display a "Sign In" text button and a "Get Started" primary CTA button on the right side.
5. WHEN the user is viewing generated results, THE Navbar SHALL display a "New Project" back-navigation button on the right side.
6. THE Navbar SHALL maintain a fixed height of 64px (h-16) with vertically centered content.
7. THE Navbar SHALL use the section-wrapper class for consistent horizontal padding and max-width alignment with page content.

### Requirement 3: Premium Footer Redesign

**User Story:** As a user, I want a professional dark footer with organized links and branding, so that I can find additional resources and trust the product.

#### Acceptance Criteria

1. THE Footer SHALL render with a dark navy background (bg-navy-900) and white text.
2. THE Footer SHALL display a 4-column link grid (Product, Company, Resources, Legal) with category headings and link items, using responsive grid layout (2 columns on mobile, 4 on md+).
3. THE Footer SHALL display a bottom bar separated by a border-t border-white/10, containing the Content Storyteller logo, a "Built with" attribution line, and social media icon buttons (LinkedIn, Twitter, Instagram).
4. THE Footer SHALL display a copyright notice at the bottom center.
5. WHEN a user hovers over a footer link, THE Footer SHALL transition the link text color from gray-400 to white.
6. WHEN a user hovers over a social icon, THE Footer SHALL transition the icon color from gray-500 to white.

### Requirement 4: Pill-Style Mode Switcher

**User Story:** As a user, I want a visually distinct pill-style toggle to switch between app modes, so that I can clearly see which mode is active and switch effortlessly.

#### Acceptance Criteria

1. THE ModeSwitcher SHALL render as a horizontally centered inline-flex container with a rounded-full shape and a light gray background (bg-gray-100) with 4px internal padding.
2. THE ModeSwitcher SHALL display three mode buttons: "Batch Mode", "Live Agent", and "Trend Analyzer", each with an icon and label.
3. WHEN a mode button is active, THE ModeSwitcher SHALL style the active button with a gradient background (bg-gradient-brand), white text, and a shadow (shadow-md shadow-brand-500/25).
4. WHEN a mode button is inactive, THE ModeSwitcher SHALL style the button with gray text (text-gray-500) and a transparent background, transitioning to hover states on interaction.
5. WHEN the user clicks a mode button, THE ModeSwitcher SHALL invoke the onModeChange callback with the selected mode key and update the visual active state.

### Requirement 5: App Shell Premium Layout Integration

**User Story:** As a user, I want the overall app layout to use the premium Navbar, ModeSwitcher, and Footer consistently, so that the experience feels cohesive across all views.

#### Acceptance Criteria

1. THE App_Shell SHALL replace the existing inline header with the Navbar component, passing onLogoClick, showNewProject, and onNewProject props.
2. THE App_Shell SHALL render the ModeSwitcher component (centered, below the Navbar) when the user is on the landing view, replacing the existing inline mode toggle buttons.
3. THE App_Shell SHALL render the Footer component at the bottom of every view, replacing the existing inline footer element.
4. THE App_Shell SHALL use a min-h-screen flex flex-col layout so the Footer is pushed to the bottom of the viewport on short-content pages.
5. THE App_Shell SHALL apply a subtle background gradient (bg-gradient-to-br from-gray-50 to-gray-100 or equivalent) to the main content area.
6. WHEN the user navigates between modes, THE App_Shell SHALL preserve the premium layout shell (Navbar + Footer) without re-mounting.

### Requirement 6: Premium Landing / Home Page

**User Story:** As a visitor, I want a premium homepage that showcases the product's three modes, process steps, social proof stats, and testimonials, so that I understand the product value and feel confident using it.

#### Acceptance Criteria

1. THE Landing_Page SHALL display a hero section with a gradient background (section-lavender), a large display title, a subtitle, and a primary CTA button.
2. THE Landing_Page SHALL display a "Three Powerful Modes" section with three feature cards (Batch Mode, Live Agent, Trend Analyzer), each containing an icon, title, and description.
3. THE Landing_Page SHALL display a numbered process steps section (1-2-3-4 flow) explaining how the product works (e.g., Upload, Configure, Generate, Export).
4. THE Landing_Page SHALL display a stats section with at least three metrics (e.g., "10K+ Creators", "500K+ Campaigns", "98% Satisfaction") using large gradient-colored numbers and descriptive labels.
5. THE Landing_Page SHALL display a testimonials section with at least three testimonial cards, each containing a quote, author name, and role/company.
6. THE Landing_Page SHALL use consistent card styling (rounded-2xl, border-gray-100, shadow-sm, hover:shadow-md) for all card elements.
7. THE Landing_Page SHALL use the section-wrapper class for all content sections to maintain consistent max-width and horizontal padding.

### Requirement 7: Premium Batch Mode Page

**User Story:** As a content creator, I want the Batch Mode page to have a premium layout with a hero heading, a clear upload area, configuration controls, and a live preview, so that the content creation workflow feels polished and intuitive.

#### Acceptance Criteria

1. THE Landing_Page SHALL display a HeroSection at the top with a mode-specific icon, "Batch Mode Creator" title, and a descriptive subtitle, rendered inside a section-lavender background.
2. THE Landing_Page SHALL display a two-column layout (main content left, preview/CTA right) on large screens (lg breakpoint), collapsing to single column on smaller screens.
3. THE Landing_Page SHALL display numbered step sections (1: Upload Assets, 2: Describe Your Content, 3: Configure Output) in the left column, each with a step number badge, title, and description.
4. THE Landing_Page SHALL display the UploadForm component with a rounded-2xl dashed-border drop zone, drag-and-drop support, file thumbnails with hover-to-remove, and an "Add more" button.
5. THE Landing_Page SHALL display a sticky preview card (card-elevated) in the right column showing uploaded file thumbnails, prompt preview, and configuration summary pills.
6. THE Landing_Page SHALL display a full-width "Generate Package" primary CTA button below the preview card with loading spinner state.
7. THE Landing_Page SHALL display a "What You'll Get" section below the main content with three deliverable cards (Social Media Copy, Visual Storyboards, Ready-to-Publish Assets) in a section-lavender background.
8. IF a form submission fails, THEN THE Landing_Page SHALL display an error message in a rounded-xl red-tinted alert box with a dismiss icon.

### Requirement 8: Premium Live Agent Page

**User Story:** As a content creator, I want the Live Agent page to have a premium chat interface with a hero section, quick actions sidebar, and polished input bar, so that brainstorming with the AI Creative Director feels like a high-end experience.

#### Acceptance Criteria

1. WHILE no session is active, THE Live_Agent_Page SHALL display a HeroSection with a microphone icon, "Live Agent Mode" title, descriptive subtitle, and a "Start Creative Session" primary CTA button inside a section-lavender background.
2. WHILE a session is active, THE Live_Agent_Page SHALL display a two-column layout: a chat area (card-elevated) on the left and a sidebar on the right.
3. THE Live_Agent_Page SHALL display a chat header with an AI avatar (gradient icon), "AI Creative Director" label, online/offline status indicator (green pulse dot or gray dot), and an "End Session" button.
4. THE Live_Agent_Page SHALL display chat messages with user messages right-aligned (gradient background, white text, rounded-br-md) and AI messages left-aligned (gray-50 background, border, rounded-bl-md) with an AI avatar icon.
5. WHILE the AI is processing a response, THE Live_Agent_Page SHALL display a typing indicator with three animated bouncing dots.
6. THE Live_Agent_Page SHALL display a premium input bar at the bottom with a microphone toggle button, a text input field, and a gradient send button.
7. THE Live_Agent_Page SHALL display a sidebar containing a "Quick Actions" card with styled action buttons and a "Pro Tips" card with checkmark-icon tip items.
8. WHEN the session ends and creative direction is extracted, THE Live_Agent_Page SHALL display an "Extracted Creative Direction" card (card-elevated, brand-tinted border) with prompt, platform, tone, key themes, and a "Generate Content Package" CTA.

### Requirement 9: Premium Trend Analyzer Page

**User Story:** As a marketer, I want the Trend Analyzer page to have premium filter chips, visually rich trend cards, an AI insights sidebar, and a stats section, so that discovering trends feels powerful and visually engaging.

#### Acceptance Criteria

1. THE Trend_Analyzer_Page SHALL display a HeroSection with a trend-line icon, "Trend Analyzer Mode" title, descriptive subtitle, and a "Start Analyzing Trends" CTA button inside a section-lavender background.
2. THE Trend_Analyzer_Page SHALL display a two-column layout: main content (filters + results) on the left and a sidebar on the right (visible after results load).
3. THE Trend_Analyzer_Page SHALL display filter controls using pill-style buttons (rounded-full) for Platform, Time, Category, and Region, with active pills styled using bg-gradient-brand and white text.
4. THE Trend_Analyzer_Page SHALL display trend results as a grid of card-elevated trend cards, each containing a title, freshness badge (color-coded by label), description, momentum metrics, a momentum progress bar (gradient fill), hashtag pills, platform/region badges, and a "Use in Content Storyteller" CTA button.
5. THE Trend_Analyzer_Page SHALL display an AI Insights sidebar card with checkmark-icon insight items parsed from the analysis summary.
6. THE Trend_Analyzer_Page SHALL display a "Generate Ideas" sidebar card with a niche input field, a generate button, and keyword pills from trending topics.
7. THE Trend_Analyzer_Page SHALL display a "Quick Export" sidebar card with export options (CSV, PDF, Share Link) as icon-labeled action rows.
8. THE Trend_Analyzer_Page SHALL display a stats section at the bottom with a section-lavender background, showing metrics (e.g., "2.5M+ Topics Analyzed", "50+ Platforms", "Real-time Updates", "98% Accuracy") with large gradient-colored numbers.
9. IF no trends are found, THEN THE Trend_Analyzer_Page SHALL display an empty state card with a search icon and "No trends found" message.

### Requirement 10: Premium Output & Results Views

**User Story:** As a content creator, I want the generation progress and results views to use premium card layouts, smooth animations, and polished export controls, so that the output feels valuable and professional.

#### Acceptance Criteria

1. THE App_Shell SHALL display the generating view with a two-column layout: a sticky pipeline timeline (card with rounded-2xl) on the left and the OutputDashboard on the right.
2. THE App_Shell SHALL display the GenerationTimeline with numbered step indicators (rounded-xl badges), color-coded states (green for completed, brand-purple for active with pulseGlow animation, gray for pending), and connecting vertical lines.
3. THE App_Shell SHALL display the OutputDashboard with progressive reveal animations (fadeIn, translate-y transitions) as each content section (CopyCards, VoiceoverView, StoryboardView, VisualDirection, VideoBriefView) becomes available.
4. THE App_Shell SHALL display skeleton loading placeholders (shimmer animation, rounded-xl) for content sections that have not yet loaded.
5. THE App_Shell SHALL display the ExportPanel with an "Export Assets" header, a "Download All" primary button, and individual asset rows (card styling) with copy and download action buttons.
6. WHEN the creative brief is available, THE App_Shell SHALL display a CreativeBriefSummary card with platform/tone badges (pill styling), campaign angle, pacing, and visual style fields.

### Requirement 11: Accessibility and Interaction Quality

**User Story:** As a user with accessibility needs, I want the redesigned UI to maintain keyboard navigation, focus indicators, semantic HTML, and ARIA attributes, so that the premium experience is inclusive.

#### Acceptance Criteria

1. THE Design_System SHALL ensure all interactive elements (buttons, links, inputs, mode switcher pills) are keyboard-focusable and operable via Enter and Space keys.
2. THE Design_System SHALL display visible focus indicators (focus:ring-2 focus:ring-brand-100 or equivalent) on all focusable elements when navigated via keyboard.
3. THE Navbar SHALL use a `<header>` element with a `<nav>` element for navigation links.
4. THE Footer SHALL use a `<footer>` semantic element.
5. THE UploadForm drop zone SHALL have role="button", tabIndex=0, and an aria-label for the hidden file input.
6. THE GenerationTimeline SHALL use role="list" and role="listitem" for pipeline stage items with an aria-label on the container.
7. WHEN a user interacts with hover-dependent UI (remove buttons on file thumbnails, card hover shadows), THE Design_System SHALL ensure the interactive element is also accessible via keyboard focus and screen reader announcement.

### Requirement 12: Responsive Layout and Performance

**User Story:** As a user on different devices, I want the premium UI to be desktop-first but responsive, and to load quickly without layout shifts, so that the experience is smooth on any screen.

#### Acceptance Criteria

1. THE App_Shell SHALL use a desktop-first responsive approach where the full premium layout renders at lg breakpoint (1024px+) and gracefully collapses to single-column layouts on smaller screens.
2. THE Navbar SHALL hide the center navigation links on screens smaller than md breakpoint (768px).
3. THE Landing_Page two-column layout (upload + preview) SHALL collapse to a single stacked column on screens smaller than lg breakpoint.
4. THE Live_Agent_Page two-column layout (chat + sidebar) SHALL collapse to a single stacked column on screens smaller than lg breakpoint.
5. THE Trend_Analyzer_Page two-column layout (filters/results + sidebar) SHALL collapse to a single stacked column on screens smaller than lg breakpoint.
6. THE Footer link grid SHALL display as 2 columns on mobile and 4 columns on md+ screens.
7. THE Design_System SHALL avoid importing external font files or heavy image assets that would increase initial page load time beyond the current baseline.

### Requirement 13: Functional Preservation

**User Story:** As a product owner, I want the redesign to preserve all existing functionality without breaking API contracts or removing features, so that the upgrade is purely visual.

#### Acceptance Criteria

1. THE App_Shell SHALL preserve all existing state management logic (useJob, useSSE hooks, SSE callbacks, view/mode state) without modification to data flow or API calls.
2. THE App_Shell SHALL preserve the existing mode switching behavior (batch, live, trends) and view transitions (landing, generating, results).
3. THE Landing_Page SHALL preserve the existing form submission flow (file upload, prompt text, platform selection, tone selection) and pass identical parameters to the startJob function.
4. THE Live_Agent_Page SHALL preserve the existing session lifecycle (start, send text, toggle mic, stop, extract direction) and the onUseCreativeDirection callback.
5. THE Trend_Analyzer_Page SHALL preserve the existing filter submission, trend analysis API call, result display, and "Use in Content Storyteller" trend-to-batch-mode flow.
6. THE App_Shell SHALL preserve the existing trend-to-batch prefill behavior (trendPrompt, trendPlatform state) and the live-agent-to-batch creative direction flow.
7. THE ExportPanel SHALL preserve the existing download-all (ZIP with JSON fallback) and individual asset download/copy functionality.
