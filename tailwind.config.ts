import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
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