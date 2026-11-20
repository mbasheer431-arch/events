import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#ecf8fa", 100: "#cfeef3", 200: "#a3dde7", 300: "#6cc4d4", 400: "#34a8bd", 500: "#168aa2", 600: "#127489", 700: "#115d6e", 800: "#124d5b", 900: "#12404c" },
        ink: "#0b0b0b",
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
