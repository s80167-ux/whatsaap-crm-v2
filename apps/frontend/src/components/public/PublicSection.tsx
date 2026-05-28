import type { ReactNode } from "react";

type PublicSectionProps = {
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
};

export function PublicSection({ children, className = "", eyebrow, title, description }: PublicSectionProps) {
  return (
    <section className={`px-4 py-14 sm:px-6 lg:px-8 ${className}`}>
      <div className="public-reveal mx-auto max-w-6xl">
        {(eyebrow || title || description) && (
          <div className="mx-auto mb-10 max-w-3xl text-center">
            {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#0b56d9]">{eyebrow}</p> : null}
            {title ? <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#071f52] sm:text-3xl">{title}</h2> : null}
            {description ? <p className="mt-3 text-sm leading-6 text-[#66708d] sm:text-base">{description}</p> : null}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
