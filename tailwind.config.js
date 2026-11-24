/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          dark: '#080c14',
          panel: '#0d1527',
          border: '#1e293b',
          cyan: '#06b6d4',
          gold: '#eab308',
          purple: '#a855f7',
          emerald: '#10b981',
          rose: '#f43f5e',
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
}
