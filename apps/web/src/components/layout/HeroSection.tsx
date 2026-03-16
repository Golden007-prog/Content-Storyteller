interface HeroSectionProps {
  icon: React.ReactNode;
  badge?: string;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}

export function HeroSection({ icon, badge, title, subtitle, children }: HeroSectionProps) {
  return (
    <div className="text-center py-12 sm:py-16">
      {/* Icon */}
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-brand text-white shadow-lg shadow-brand-500/25 mb-6">
        {icon}
      </div>

      {/* Badge */}
      {badge && (
        <div className="mb-4">
          <span className="pill-brand">{badge}</span>
        </div>
      )}

      {/* Title */}
      <h1 className="text-display mb-4 max-w-3xl mx-auto">{title}</h1>

      {/* Subtitle */}
      <p className="text-subheading max-w-2xl mx-auto mb-8">{subtitle}</p>

      {/* CTA or children */}
      {children}
    </div>
  );
}
