import {
  siBluesky,
  siDiscord,
  siFacebook,
  siInstagram,
  siMastodon,
  siTelegram,
  siThreads,
  siTiktok,
  siX,
  siYoutube,
  type SimpleIcon,
} from "simple-icons";

// Official brand marks from Simple Icons (CC0), used to show which platforms
// PostGoblins publishes to. LinkedIn asked Simple Icons to remove its logo,
// so that one is drawn below.
const ICONS: Record<string, SimpleIcon> = {
  x: siX,
  bluesky: siBluesky,
  mastodon: siMastodon,
  threads: siThreads,
  facebook: siFacebook,
  instagram: siInstagram,
  youtube: siYoutube,
  tiktok: siTiktok,
  discord: siDiscord,
  telegram: siTelegram,
};

/** Black marks follow the text colour so they stay visible in dark mode. */
const MONOCHROME = new Set(["x", "threads", "tiktok"]);

export default function BrandIcon({ provider, size = 24, className = "" }: { provider: string; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", role: "img", className: `shrink-0 ${className}` };

  if (provider === "linkedin") {
    return (
      <svg {...common} aria-label="LinkedIn">
        <rect width="24" height="24" rx="4" fill="#0A66C2" />
        <circle cx="6.6" cy="6.5" r="1.8" fill="#fff" />
        <rect x="5" y="9.4" width="3.2" height="9.6" rx="0.4" fill="#fff" />
        <path
          fill="#fff"
          d="M10.4 9.4h3v1.4c.6-1 1.8-1.7 3.4-1.7 2.9 0 3.8 1.9 3.8 4.6V19h-3.2v-5c0-1.3-.3-2.3-1.7-2.3s-2.1 1-2.1 2.4V19h-3.2z"
        />
      </svg>
    );
  }

  const icon = ICONS[provider];
  if (!icon) return null;

  if (provider === "instagram") {
    const id = "pg-ig-gradient";
    return (
      <svg {...common} aria-label={icon.title}>
        <defs>
          <radialGradient id={id} cx="30%" cy="107%" r="150%">
            <stop offset="0%" stopColor="#fdf497" />
            <stop offset="5%" stopColor="#fdf497" />
            <stop offset="45%" stopColor="#fd5949" />
            <stop offset="60%" stopColor="#d6249f" />
            <stop offset="90%" stopColor="#285AEB" />
          </radialGradient>
        </defs>
        <path d={icon.path} fill={`url(#${id})`} />
      </svg>
    );
  }

  return (
    <svg {...common} aria-label={icon.title}>
      <path d={icon.path} fill={MONOCHROME.has(provider) ? "currentColor" : `#${icon.hex}`} />
    </svg>
  );
}
