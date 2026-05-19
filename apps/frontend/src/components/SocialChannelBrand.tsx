import clsx from "clsx";
import { useId, type SVGProps } from "react";

export type SocialChannelBrand = "whatsapp" | "facebook" | "instagram";

type SocialChannelBrandLogoProps = {
  channel: SocialChannelBrand;
  className?: string;
};

type SocialChannelHeaderBlockProps = {
  channel?: SocialChannelBrand;
  eyebrow: string;
  title: string;
  description: string;
  className?: string;
};

function BrandSvg({ className, children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

function WhatsAppLogo({ className }: { className?: string }) {
  return (
    <BrandSvg className={className}>
      <circle cx="16" cy="16" r="15" fill="#25D366" />
      <path
        fill="#fff"
        d="M16.05 7.2c-4.79 0-8.68 3.76-8.68 8.4 0 1.48.4 2.94 1.14 4.21l-1.17 4.39 4.61-1.19a8.84 8.84 0 0 0 4.1 1c4.79 0 8.68-3.76 8.68-8.4s-3.89-8.4-8.68-8.4Zm0 15.33c-1.31 0-2.6-.35-3.72-1.02l-.27-.16-2.71.7.71-2.62-.16-.27a7.03 7.03 0 0 1-1.13-3.76c0-3.82 3.27-6.94 7.28-6.94s7.28 3.12 7.28 6.94-3.27 6.94-7.28 6.94Z"
      />
      <path
        fill="#fff"
        d="M13.52 12.04c-.17-.38-.35-.39-.51-.4h-.44c-.15 0-.42.06-.63.28-.22.22-.83.81-.83 1.98s.85 2.29.97 2.45c.11.16 1.63 2.54 4 3.45 1.96.75 2.36.6 2.81.57.43-.05 1.38-.57 1.58-1.1.19-.54.19-1.01.13-1.1-.06-.1-.23-.16-.48-.29-.25-.11-1.45-.73-1.68-.8-.22-.08-.39-.13-.54.13-.16.23-.63.8-.77.97-.15.15-.29.18-.54.06-.25-.13-1.04-.38-1.99-1.2-.73-.64-1.24-1.43-1.38-1.67-.15-.25-.03-.39.1-.5.13-.13.25-.29.38-.44.13-.15.16-.25.25-.42.08-.16.03-.32-.03-.43-.06-.11-.55-1.34-.77-1.84Z"
      />
    </BrandSvg>
  );
}

function FacebookMessengerLogo({ className }: { className?: string }) {
  const gradientId = useId();

  return (
    <BrandSvg className={className}>
      <defs>
        <linearGradient id={gradientId} x1="5" y1="28" x2="27" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0A7CFF" />
          <stop offset="0.55" stopColor="#287CFA" />
          <stop offset="1" stopColor="#00C6FF" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M16 2.75C8.68 2.75 3 8.12 3 14.98c0 3.64 1.85 6.93 4.84 9.18v4.09l3.92-2.12c1.3.36 2.68.55 4.24.55 7.32 0 13-5.36 13-12.22S23.32 2.75 16 2.75Z"
      />
      <path
        fill="#fff"
        d="m12.96 18.96 3.05-3.24 2.43 2.6 4.79-5.14-5.78 3.16-2.43-2.6-4.79 5.22 2.73-1.49Z"
      />
    </BrandSvg>
  );
}

function InstagramLogo({ className }: { className?: string }) {
  const gradientId = useId();

  return (
    <BrandSvg className={className}>
      <defs>
        <linearGradient id={gradientId} x1="5" y1="27" x2="27" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset="0.28" stopColor="#FA7E1E" />
          <stop offset="0.55" stopColor="#D62976" />
          <stop offset="0.78" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="24" height="24" rx="7" fill={`url(#${gradientId})`} />
      <circle cx="16" cy="16" r="5.2" stroke="#fff" strokeWidth="2.2" />
      <circle cx="22.1" cy="9.9" r="1.45" fill="#fff" />
      <rect x="9.1" y="9.1" width="13.8" height="13.8" rx="4.3" stroke="#fff" strokeWidth="2.2" />
    </BrandSvg>
  );
}

export function SocialChannelBrandLogo({ channel, className }: SocialChannelBrandLogoProps) {
  switch (channel) {
    case "whatsapp":
      return <WhatsAppLogo className={className} />;
    case "facebook":
      return <FacebookMessengerLogo className={className} />;
    case "instagram":
      return <InstagramLogo className={className} />;
    default:
      return null;
  }
}

export function SocialChannelHeaderBlock({ channel, eyebrow, title, description, className }: SocialChannelHeaderBlockProps) {
  return (
    <div className={clsx("min-w-0", className)}>
      <div className="flex min-w-0 items-start gap-4">
        {channel ? (
          <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/80 bg-background/95 shadow-soft sm:h-14 sm:w-14">
            <SocialChannelBrandLogo channel={channel} className="h-7 w-7 sm:h-8 sm:w-8" />
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">{eyebrow}</p>
          <h1 className="mt-2 section-title">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">{description}</p>
        </div>
      </div>
    </div>
  );
}