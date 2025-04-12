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
        // Brand/Accent Color (Fluent Blue)
        brand: {
          DEFAULT: '#0078D4', // Primary
          light: '#EFF6FC',   // Tint 40
          dark: '#005A9E',    // Shade 10
        },
        // Neutral Colors (Greys)
        neutral: {
          background: '#F9F9F9', // 更浅的背景色
          foreground: '#252423', // 略微柔和的前景色
          secondary: '#605E5C', // Secondary Text
          stroke: '#E1E1E1',    // 更浅的描边
          disabled: '#C8C6C4', // Disabled Text
          backgroundDisabled: '#F5F5F5', // Disabled Background
        },
        // Status Colors - 更符合现代设计的状态颜色
        success: {
          DEFAULT: '#13A10E', // 更亮的绿色
          background: '#E6F7E6',
        },
        warning: {
          DEFAULT: '#FFB900', // 更亮的黄色
          background: '#FFF8E6',
        },
        danger: {
          DEFAULT: '#E74C3C', // 更现代的红色
          background: '#FDEDEB',
        },
        info: {
          DEFAULT: '#2196F3', // 更亮的蓝色
          background: '#E6F4FD',
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