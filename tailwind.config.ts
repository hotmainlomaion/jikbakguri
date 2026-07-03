import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0d0d10",
        bg2: "#08080a",
        surface: "#17171c",
        surface2: "#1f1f26",
        surface3: "#26262e",
        border: "#2a2a33",
        line: "#1e1e25",
        text: "#f2f2f5",
        muted: "#8b8b96",
        subtle: "#5f5f6b",
        primary: "#d8557f",
        primaryHover: "#e26a92",
        gold: "#f5b301",
        badgePink: "#ff2d6f",
        badgePurple: "#8b5cf6",
        danger: "#ef4444",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeIn: "fadeIn .2s ease",
        slideUp: "slideUp .25s ease",
      },
    },
  },
  plugins: [],
};
export default config;
