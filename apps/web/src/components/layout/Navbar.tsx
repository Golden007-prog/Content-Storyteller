interface NavbarProps {
  onLogoClick: () => void;
  showNewProject?: boolean;
  onNewProject?: () => void;
}

export function Navbar({ onLogoClick, showNewProject, onNewProject }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-lg">
      <div className="section-wrapper flex items-center justify-between h-16">
        {/* Logo */}
        <button
          onClick={onLogoClick}
          className="flex items-center gap-2.5 group"
          aria-label="Go to homepage"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center shadow-md shadow-brand-500/20 group-hover:shadow-lg group-hover:shadow-brand-500/30 transition-shadow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
          <span className="text-lg font-bold text-gray-900 tracking-tight">Content Storyteller</span>
        </button>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-1">
          {['Features', 'Pricing', 'Resources', 'About'].map((item) => (
            <button
              key={item}
              className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {item}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {showNewProject && onNewProject && (
            <button
              onClick={onNewProject}
              className="btn-ghost text-brand-600 hover:text-brand-700 hover:bg-brand-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              New Project
            </button>
          )}
          <button className="hidden sm:block text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            Sign In
          </button>
          <button className="btn-primary !py-2 !px-4 !text-sm !shadow-md !shadow-brand-500/20">
            Get Started
          </button>
        </div>
      </div>
    </header>
  );
}
