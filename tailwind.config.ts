import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bc: {
          bg: '#0B0D10',
          bgSoft: '#0F1216',
          card: '#11151B',
          cardSoft: '#151A22',
          text: '#E6EAF2',
          muted: 'rgba(230,234,242,0.65)',
          accent: '#E11D2E'
        }
      },
      borderRadius: {
        xl2: '20px'
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
      },
      boxShadow: {
        ambient: '0 0 60px rgba(225,29,46,0.08)',
        accent: '0 0 24px rgba(225,29,46,0.18)'
      }
    }
  },
  plugins: []
} satisfies Config;
