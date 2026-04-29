import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: '#F5EFE2',
          deep: '#EDE3D0',
        },
        paper: '#FFFCF6',
        matcha: {
          DEFAULT: '#4A6B3D',
          deep: '#324A2A',
        },
        sage: '#B8C9A8',
        ink: {
          DEFAULT: '#2A2520',
          soft: 'rgba(42, 37, 32, 0.7)',
          faint: 'rgba(42, 37, 32, 0.6)',
        },
        muted: '#8B7E6E',
        warm: '#D89A7A',
      },
      fontFamily: {
        serif: ['var(--font-fraunces)', 'Fraunces', 'Georgia', 'serif'],
        sans: ['var(--font-dm-sans)', 'DM Sans', 'system-ui', 'sans-serif'],
        mono: ['var(--font-dm-mono)', 'DM Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '32px',
      },
      keyframes: {
        scan: {
          '0%, 100%': { top: '0%' },
          '50%': { top: '100%' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-100% 0' },
        },
        confetti: {
          '0%': { transform: 'translateY(-100px) rotate(0deg)', opacity: '0' },
          '10%': { opacity: '1' },
          '100%': { transform: 'translateY(800px) rotate(720deg)', opacity: '0' },
        },
        bounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
        rotateBg: {
          to: { transform: 'rotate(360deg)' },
        },
        blink: {
          '50%': { opacity: '0.3' },
        },
        pulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(74, 107, 61, 0.35)' },
          '50%': { boxShadow: '0 0 0 24px rgba(74, 107, 61, 0)' },
        },
      },
      animation: {
        scan: 'scan 2s ease-in-out infinite',
        shimmer: 'shimmer 2.4s ease-in-out infinite',
        confetti: 'confetti 4s linear infinite',
        bounce: 'bounce 1.4s ease-in-out infinite',
        spin: 'spin 0.8s linear infinite',
        rotateBg: 'rotateBg 8s linear infinite',
        blink: 'blink 1s ease infinite',
        pulse: 'pulse 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
