import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17201a",
        muted: "#66736b",
        paper: "#f7f8f5",
        line: "#dce3dc",
        brand: "#176b4d",
        accent: "#315f9d",
        warn: "#a45f19"
      },
      boxShadow: {
        panel: "0 1px 2px rgb(23 32 26 / 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
