/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand Colors from Medics Clinic Logo
        primary: {
          50: '#E8F7F7',
          100: '#D1EFEF',
          200: '#A3DFDF',
          300: '#75CFCF',
          400: '#5BC5C8', // Main teal from "Medics" text
          500: '#4AB5B8',
          600: '#3A9A9D',
          700: '#2A7A7D',
          800: '#1A5A5D',
          900: '#0A3A3D',
        },
        secondary: {
          50: '#F5EDF4',
          100: '#EBDBE9',
          200: '#D7B7D3',
          300: '#C393BD',
          400: '#A86FA7',
          500: '#8E4585', // Purple/magenta from "Clinic" text and DNA helix
          600: '#72376B',
          700: '#562950',
          800: '#3A1B36',
          900: '#1E0D1B',
        },
        accent: {
          50: '#F7F4F9',
          100: '#EFE9F3',
          200: '#DFD3E7',
          300: '#CFBDDB',
          400: '#B8A9C9', // Soft lavender from cross outline
          500: '#A895BD',
          600: '#8A77A5',
          700: '#6C598D',
          800: '#4E3B75',
          900: '#301D5D',
        },
        // Semantic colors
        background: '#F7F9FC',
        surface: '#FFFFFF',
        'text-primary': '#1A1A2E',
        'text-secondary': '#6B7280',
        success: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },
        warning: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        danger: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
          800: '#991B1B',
          900: '#7F1D1D',
        },
        border: '#E5E7EB',
        // Dark mode colors
        dark: {
          bg: '#0F172A',
          surface: '#1E293B',
          border: '#334155',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'monospace'],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '72': '18rem',
        '84': '21rem',
        '96': '24rem',
      },
      maxWidth: {
        '8xl': '1400px',
        '9xl': '1600px',
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        'soft': '0 1px 3px rgba(0, 0, 0, 0.08)',
        'medium': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'hard': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)',
      },
      animation: {
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-in-up': 'slideInUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s infinite',
      },
      keyframes: {
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
