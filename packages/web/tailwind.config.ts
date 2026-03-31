import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        secondary: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
        },
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: '#334155',
            p: {
              marginTop: '1.2em',
              marginBottom: '1.2em',
            },
            'h1, h2, h3': {
              color: '#1e293b',
              fontWeight: '700',
            },
            h1: {
              fontSize: '2em',
              marginTop: '1.5em',
              marginBottom: '0.8em',
            },
            h2: {
              fontSize: '1.5em',
              marginTop: '1.4em',
              marginBottom: '0.8em',
            },
            h3: {
              fontSize: '1.25em',
              marginTop: '1.3em',
              marginBottom: '0.6em',
            },
            img: {
              marginTop: '1em',
              marginBottom: '1em',
              borderRadius: '0.5rem',
            },
            a: {
              color: '#2563eb',
              textDecoration: 'none',
              '&:hover': {
                color: '#1d4ed8',
                textDecoration: 'underline',
              },
            },
            ul: {
              listStyleType: 'disc',
              marginTop: '1.2em',
              marginBottom: '1.2em',
            },
            ol: {
              listStyleType: 'decimal',
              marginTop: '1.2em',
              marginBottom: '1.2em',
            },
            'ul, ol': {
              paddingLeft: '1.5em',
            },
            'ul > li, ol > li': {
              marginTop: '0.5em',
              marginBottom: '0.5em',
            },
          },
        },
      },
    },
  },
  plugins: [
    typography,
  ],
};

export default config; 