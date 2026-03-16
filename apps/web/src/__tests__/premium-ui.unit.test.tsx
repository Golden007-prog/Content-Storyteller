import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { LandingPage } from '../components/LandingPage';
import { GenerationTimeline } from '../components/GenerationTimeline';
import { ExportPanel } from '../components/ExportPanel';
import { JobState } from '@content-storyteller/shared';
import fs from 'fs';
import path from 'path';

afterEach(() => {
  cleanup();
});

/* ══════════════════════════════════════════════════════════════════
   8.1 — Navbar rendering and accessibility
   Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 11.3
   ══════════════════════════════════════════════════════════════════ */

describe('Navbar rendering and accessibility', () => {
  const defaultProps = {
    onLogoClick: vi.fn(),
    showNewProject: false,
    onNewProject: vi.fn(),
  };

  it('renders logo text "Content Storyteller"', () => {
    render(<Navbar {...defaultProps} />);
    expect(screen.getByText('Content Storyteller')).toBeDefined();
  });

  it('renders nav links: Features, Pricing, Resources, About', () => {
    render(<Navbar {...defaultProps} />);
    expect(screen.getByText('Features')).toBeDefined();
    expect(screen.getByText('Pricing')).toBeDefined();
    expect(screen.getByText('Resources')).toBeDefined();
    expect(screen.getByText('About')).toBeDefined();
  });

  it('renders "Sign In" and "Get Started" buttons', () => {
    render(<Navbar {...defaultProps} />);
    expect(screen.getByText('Sign In')).toBeDefined();
    expect(screen.getByText('Get Started')).toBeDefined();
  });

  it('uses <header> semantic element', () => {
    const { container } = render(<Navbar {...defaultProps} />);
    const header = container.querySelector('header');
    expect(header).not.toBeNull();
  });

  it('contains <nav> element', () => {
    const { container } = render(<Navbar {...defaultProps} />);
    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
  });

  it('"New Project" button appears when showNewProject=true and onNewProject is provided', () => {
    render(<Navbar {...defaultProps} showNewProject={true} onNewProject={vi.fn()} />);
    expect(screen.getByText('New Project')).toBeDefined();
  });

  it('"New Project" button does NOT appear when showNewProject=false', () => {
    render(<Navbar {...defaultProps} showNewProject={false} />);
    expect(screen.queryByText('New Project')).toBeNull();
  });

  it('nav links have hidden md:flex class (hidden on small screens)', () => {
    const { container } = render(<Navbar {...defaultProps} />);
    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    expect(nav!.className).toContain('hidden');
    expect(nav!.className).toContain('md:flex');
  });
});

/* ══════════════════════════════════════════════════════════════════
   8.2 — Footer rendering and accessibility
   Validates: Requirements 3.1, 3.2, 3.3, 3.4, 11.4, 12.6
   ══════════════════════════════════════════════════════════════════ */

describe('Footer rendering and accessibility', () => {
  it('renders 4 column categories: Product, Company, Resources, Legal', () => {
    render(<Footer />);
    expect(screen.getByText('Product')).toBeDefined();
    expect(screen.getByText('Company')).toBeDefined();
    expect(screen.getByText('Resources')).toBeDefined();
    expect(screen.getByText('Legal')).toBeDefined();
  });

  it('renders social icons with aria-labels (LinkedIn, Twitter, Instagram)', () => {
    render(<Footer />);
    expect(screen.getByLabelText('LinkedIn')).toBeDefined();
    expect(screen.getByLabelText('Twitter')).toBeDefined();
    expect(screen.getByLabelText('Instagram')).toBeDefined();
  });

  it('renders copyright text "© 2024 Content Storyteller"', () => {
    render(<Footer />);
    expect(screen.getByText(/© 2024 Content Storyteller/)).toBeDefined();
  });

  it('uses <footer> semantic element', () => {
    const { container } = render(<Footer />);
    const footer = container.querySelector('footer');
    expect(footer).not.toBeNull();
  });

  it('renders "Built with Gemini 2.0 Flash" attribution', () => {
    render(<Footer />);
    expect(screen.getByText(/Built with Gemini 2\.0 Flash/)).toBeDefined();
  });

  it('uses responsive grid classes: grid-cols-2 md:grid-cols-4', () => {
    const { container } = render(<Footer />);
    const grid = container.querySelector('.grid');
    expect(grid).not.toBeNull();
    expect(grid!.className).toContain('grid-cols-2');
    expect(grid!.className).toContain('md:grid-cols-4');
  });
});

/* ══════════════════════════════════════════════════════════════════
   8.3 — Homepage sections
   Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
   ══════════════════════════════════════════════════════════════════ */

describe('LandingPage homepage sections', () => {
  const defaultProps = {
    onStartJob: vi.fn().mockResolvedValue('job-123'),
    error: null as string | null,
    isSubmitting: false,
  };

  it('renders "Three Powerful Modes" section with 3 cards (Batch Mode, Live Agent, Trend Analyzer)', () => {
    render(<LandingPage {...defaultProps} />);
    expect(screen.getByText('Three Powerful Modes')).toBeDefined();
    // The modes cards section should have all three mode titles
    expect(screen.getByText('Batch Mode')).toBeDefined();
    expect(screen.getByText('Live Agent')).toBeDefined();
    expect(screen.getByText('Trend Analyzer')).toBeDefined();
  });

  it('renders "How It Works" process steps (Upload, Configure, Generate, Export)', () => {
    render(<LandingPage {...defaultProps} />);
    expect(screen.getByText('How It Works')).toBeDefined();
    // Process step titles
    expect(screen.getByText('Upload')).toBeDefined();
    expect(screen.getByText('Configure')).toBeDefined();
    expect(screen.getByText('Generate')).toBeDefined();
    expect(screen.getByText('Export')).toBeDefined();
  });

  it('renders stats section with gradient numbers (10K+, 500K+, 98%)', () => {
    render(<LandingPage {...defaultProps} />);
    expect(screen.getByText('10K+')).toBeDefined();
    expect(screen.getByText('500K+')).toBeDefined();
    expect(screen.getByText('98%')).toBeDefined();
  });

  it('renders testimonials section with 3 testimonials', () => {
    render(<LandingPage {...defaultProps} />);
    expect(screen.getByText('What Creators Say')).toBeDefined();
    expect(screen.getByText('Sarah Chen')).toBeDefined();
    expect(screen.getByText('Marcus Rivera')).toBeDefined();
    expect(screen.getByText('Aisha Patel')).toBeDefined();
  });

  it('renders "What You\'ll Get" section', () => {
    render(<LandingPage {...defaultProps} />);
    expect(screen.getByText("What You'll Get")).toBeDefined();
  });

  it('uses section-wrapper class in sections', () => {
    const { container } = render(<LandingPage {...defaultProps} />);
    const sectionWrappers = container.querySelectorAll('.section-wrapper');
    // Multiple sections should use section-wrapper
    expect(sectionWrappers.length).toBeGreaterThanOrEqual(3);
  });
});

/* ══════════════════════════════════════════════════════════════════
   8.4 — Accessibility attributes
   Validates: Requirements 11.1, 11.2, 11.5, 11.6, 11.7
   ══════════════════════════════════════════════════════════════════ */

describe('GenerationTimeline accessibility attributes', () => {
  it('has role="list" on the container', () => {
    render(<GenerationTimeline currentState={JobState.Queued} />);
    const list = screen.getByRole('list');
    expect(list).toBeDefined();
  });

  it('has role="listitem" on each stage', () => {
    render(<GenerationTimeline currentState={JobState.Queued} />);
    const items = screen.getAllByRole('listitem');
    // There are 6 pipeline stages
    expect(items.length).toBe(6);
  });

  it('has aria-label attribute on the container', () => {
    render(<GenerationTimeline currentState={JobState.Queued} />);
    const list = screen.getByRole('list');
    expect(list.getAttribute('aria-label')).toBeTruthy();
    expect(list.getAttribute('aria-label')).toContain('pipeline');
  });
});

/* ══════════════════════════════════════════════════════════════════
   8.5 — Functional preservation
   Validates: Requirements 12.7, 13.1, 13.2
   ══════════════════════════════════════════════════════════════════ */

describe('Functional preservation', () => {
  it('no external font imports in index.css', () => {
    const cssPath = path.resolve(__dirname, '../index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    // Check for @import with external font URLs (Google Fonts, Adobe Fonts, etc.)
    const fontImportRegex = /@import\s+(?:url\()?['"]?https?:\/\/[^'")\s]*fonts[^'")\s]*/gi;
    const matches = cssContent.match(fontImportRegex);
    expect(matches).toBeNull();
  });

  it('ExportPanel shows empty state message when assets array is empty', () => {
    render(<ExportPanel jobId="test-job" assets={[]} />);
    expect(screen.getByText(/No assets available for download yet/i)).toBeDefined();
  });
});
