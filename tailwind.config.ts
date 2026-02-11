import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // The Void (Dark Mode)
        void: {
          bg: '#0a0a0f',
          surface: '#12121a',
          border: '#1e293b',
        },
        // The Archive (Light Mode)
        archive: {
          bg: '#faf9f7',
          surface: '#ffffff',
          border: '#e2e0dc',
        },
        // Shared accent colors
        primary: {
          light: '#6d28d9',
          dark: '#7c3aed',
        },
        secondary: {
          light: '#0891b2',
          dark: '#06b6d4',
        },
        accent: {
          light: '#d97706',
          dark: '#f59e0b',
        },
        text: {
          light: '#1e1b2e',
          'light-muted': '#64748b',
          dark: '#e2e8f0',
          'dark-muted': '#94a3b8',
        },
      },
      fontFamily: {
        serif: ['var(--font-crimson)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
