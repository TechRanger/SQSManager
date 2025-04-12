import React from 'react';

// FluentButton Component
interface FluentButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
    icon?: React.ReactNode;
    size?: 'small' | 'medium'; 
}

const FluentButton: React.FC<FluentButtonProps> = ({ variant = 'secondary', icon, children, className, size = 'medium', ...props }) => {
    const baseStyle = "rounded-md font-medium flex items-center justify-center space-x-2 transition-all duration-200 focus:outline-none shadow-none hover:shadow-sm";
    const sizeStyles = {
      small: "px-3 py-1.5 text-xs", 
      medium: "px-4 py-2 text-sm",
    };
    const variantStyles = {
      primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
      secondary: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
      danger: "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 focus:ring-2 focus:ring-red-500 focus:ring-offset-1",
      success: "bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 focus:ring-2 focus:ring-green-500 focus:ring-offset-1",
      warning: "bg-yellow-50 text-yellow-600 border border-yellow-200 hover:bg-yellow-100 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-1",
    };
    const disabledStyle = "disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none";
  
    return (
      <button
        className={`${baseStyle} ${sizeStyles[size]} ${variantStyles[variant]} ${disabledStyle} ${className}`}
        {...props}
      >
        {icon && <span className={`${size === 'small' ? 'text-sm' : 'text-base'} transition-transform group-hover:scale-105`}>{icon}</span>}
        {children && <span>{children}</span>}
      </button>
    );
  };

export default FluentButton; 