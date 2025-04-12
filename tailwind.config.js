/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Scan src directory for classes
  ],
  theme: {
    extend: {
      // --- Fluent 2 Design Inspired Colors ---
      colors: {
        // Brand/Accent Color (Example: Fluent Blue)
        brand: {
          DEFAULT: '#0078D4', // Primary
          light: '#EFF6FC',   // Tint 40
          dark: '#005A9E',    // Shade 10
        },
        // Neutral Colors (Greys)
        neutral: {
          background: '#F3F3F3', // Stroke 1 / Card Background
          foreground: '#201F1E', // Foreground
          secondary: '#605E5C', // Secondary Text
          stroke: '#D1D1D1',    // Stroke 2
          disabled: '#C8C6C4', // Disabled Text
          backgroundDisabled: '#F3F3F3', // Disabled Background
        },
        // Status Colors
        success: {
          DEFAULT: '#107C10', // Green
          background: '#DFF6DD',
        },
        warning: {
          DEFAULT: '#F07F0F', // Orange
          background: '#FFF4CE',
        },
        danger: {
          DEFAULT: '#D83B01', // Red
          background: '#FDE7E9',
        },
        info: {
          DEFAULT: '#0078D4', // Blue (same as brand for info)
          background: '#EFF6FC',
        },
      },
      // --- Fluent 2 Design Inspired Fonts ---
      fontFamily: {
        sans: [
          'Segoe UI', // Preferred Fluent font
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // You might add serif or mono if needed
      },
      // --- Fluent 2 Design Inspired Spacing & Sizing (Examples) ---
      spacing: {
        'fluent-xs': '4px',
        'fluent-sm': '8px',
        'fluent-md': '12px',
        'fluent-lg': '16px',
        'fluent-xl': '20px',
        'fluent-2xl': '24px',
        'fluent-3xl': '32px',
      },
      // --- Fluent 2 Design Inspired Rounded Corners ---
      borderRadius: {
        'fluent-sm': '4px',
        'fluent-md': '6px',
        'fluent-lg': '8px',
      },
      // --- Fluent 2 Design Inspired Shadows ---
      boxShadow: {
        'fluent-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)', // Low elevation
        'fluent-md': '0 4px 8px 0 rgba(0, 0, 0, 0.1)',  // Medium elevation
        'fluent-lg': '0 8px 16px 0 rgba(0, 0, 0, 0.14)', // High elevation
      },
    },
  },
  plugins: [],
}; 