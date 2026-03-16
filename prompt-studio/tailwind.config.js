/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'emerald-glow': '#10b981',
        'violet-glow': '#8b5cf6',
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
}
