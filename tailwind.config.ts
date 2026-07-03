import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f0e13",
        surface: "#1a1822",
        surface2: "#242130",
        border: "#332f42",
        primary: "#c8508f",
        primaryHover: "#d96aa4",
        muted: "#8a8499",
        text: "#ece9f2",
      },
    },
  },
  plugins: [],
};
export default config;
