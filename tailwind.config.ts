import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211f",
        paper: "#f7f4ee",
        mint: "#2f7d68",
        coral: "#c75b4d",
        gold: "#c6973f"
      },
      boxShadow: {
        soft: "0 12px 30px rgba(23, 33, 31, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
