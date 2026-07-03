// 인라인 SVG 아이콘 (외부 라이브러리 없음). currentColor 상속.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

export const IcHome = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
);
export const IcCompass = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5z" />
  </svg>
);
export const IcCrown = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 8l4 3 5-6 5 6 4-3-2 11H5z" />
  </svg>
);
export const IcChatBubble = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z" />
  </svg>
);
export const IcHeart = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 20s-7-4.5-9.5-9A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9.5 5c-2.5 4.5-9.5 9-9.5 9Z" />
  </svg>
);
export const IcImage = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m3 17 5-4 4 3 3-2 6 5" />
  </svg>
);
export const IcPaw = (p: P) => (
  <svg {...base(p)}>
    <circle cx="5.5" cy="11" r="1.6" />
    <circle cx="9.5" cy="7.5" r="1.6" />
    <circle cx="14.5" cy="7.5" r="1.6" />
    <circle cx="18.5" cy="11" r="1.6" />
    <path d="M8 16.5c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5-1.8 3.2-4 3.2-4-1.2-4-3.2Z" />
  </svg>
);
export const IcGear = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 2.6a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 2.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);
export const IcSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4-4" />
  </svg>
);
export const IcCoin = (p: P) => (
  <svg {...base({ ...p, fill: "currentColor", stroke: "none" })}>
    <circle cx="12" cy="12" r="9" opacity="0.25" />
    <circle cx="12" cy="12" r="7" />
  </svg>
);
export const IcChart = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 17l5-5 4 3 6-7" />
    <path d="M18 8h3v3" />
  </svg>
);
export const IcBack = (p: P) => (
  <svg {...base(p)}>
    <path d="m15 5-7 7 7 7" />
  </svg>
);
export const IcRefresh = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-2.6-6.3" />
    <path d="M21 4v5h-5" />
  </svg>
);
export const IcShare = (p: P) => (
  <svg {...base(p)}>
    <circle cx="18" cy="5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="19" r="2.5" />
    <path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" />
  </svg>
);
export const IcEye = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
);
export const IcPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IcExpand = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
  </svg>
);
export const IcPin = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);
export const IcSpark = (p: P) => (
  <svg {...base({ ...p, fill: "currentColor", stroke: "none" })}>
    <path d="M12 2l1.8 5.6L19.5 9l-4.6 3.4L16.5 18 12 14.7 7.5 18l1.6-5.6L4.5 9l5.7-1.4z" />
  </svg>
);
export const IcVoice = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 10v4M10 6v12M14 8v8M18 10v4" />
  </svg>
);
export const IcCollapse = (p: P) => (
  <svg {...base(p)}>
    <path d="m13 5-7 7 7 7M20 5l-7 7 7 7" />
  </svg>
);
