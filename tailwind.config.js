/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
        '3xl': '1920px',
        '4xl': '2560px',
      },
    },
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
      '4xl': '2560px',
    },
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'var(--font-space-grotesk)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'var(--font-space-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          50: 'rgb(1, 30, 57)',
          100: 'rgb(2, 38, 71)',
          200: 'rgb(2, 45, 85)',
          300: 'rgb(3, 53, 99)',
          400: 'rgb(4, 75, 142)',
          500: 'rgb(4, 90, 170)',
          600: 'rgb(5, 105, 199)',
          700: 'rgb(21, 139, 249)',
          800: 'rgb(63, 160, 250)',
          900: 'rgb(191, 223, 253)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        neutral: {
          DEFAULT: 'hsl(var(--neutral))',
          0: 'rgb(10, 10, 10)',
          50: 'rgb(23, 23, 23)',
          100: 'rgb(38, 38, 38)',
          200: 'rgb(64, 64, 64)',
          300: 'rgb(82, 82, 82)',
          400: 'rgb(115, 115, 115)',
          500: 'rgb(163, 163, 163)',
          600: 'rgb(212, 212, 212)',
          700: 'rgb(229, 229, 229)',
          800: 'rgb(245, 245, 245)',
          900: 'rgb(250, 250, 250)',
          950: 'rgb(255, 255, 255)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          50: 'rgb(33, 10, 4)',
          100: 'rgb(67, 20, 8)',
          200: 'rgb(83, 24, 10)',
          300: 'rgb(116, 34, 14)',
          400: 'rgb(150, 44, 18)',
          500: 'rgb(183, 54, 21)',
          600: 'rgb(229, 69, 30)',
          700: 'rgb(234, 110, 79)',
          800: 'rgb(242, 163, 143)',
          900: 'rgb(251, 229, 223)',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          50: 'rgb(3, 13, 3)',
          100: 'rgb(5, 20, 4)',
          200: 'rgb(8, 33, 7)',
          300: 'rgb(12, 46, 10)',
          400: 'rgb(15, 59, 13)',
          500: 'rgb(19, 72, 16)',
          600: 'rgb(24, 91, 20)',
          700: 'rgb(42, 162, 36)',
          800: 'rgb(121, 224, 115)',
          900: 'rgb(210, 245, 208)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      transitionTimingFunction: {
        'fast-slow': 'cubic-bezier(0.075, 0.82, 0.165, 1)',
        'slow-slow': 'cubic-bezier(0.77, 0, 0.175, 1)',
        'slow-fast': 'cubic-bezier(0.5, 0, 0.75, 0)',
      },
      maxWidth: {
        'screen-2xl': '1536px',
        'screen-3xl': '1920px',
        'screen-4xl': '2560px',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    function ({ addUtilities }) {
      addUtilities({
        '.transition-interactive': {
          transition:
            'background-color 0.2s cubic-bezier(0.075, 0.82, 0.165, 1), outline 0.3s cubic-bezier(0.77, 0, 0.175, 1), box-shadow 0.3s cubic-bezier(0.075, 0.82, 0.165, 1), transform 0.3s cubic-bezier(0.075, 0.82, 0.165, 1)',
        },
      });
    },
  ],
};
