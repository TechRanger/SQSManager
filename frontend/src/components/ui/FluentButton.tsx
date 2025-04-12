import React from 'react';

// FluentButton Component
interface FluentButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
    icon?: React.ReactNode;
    size?: 'small' | 'medium'; 
}

const FluentButton: React.FC<FluentButtonProps> = ({ variant = 'secondary', icon, children, className, size = 'medium', ...props }) => {
    const baseStyle = "rounded-md font-medium flex items-center justify-center space-x-2 transition-all duration-200 focus:outline-none shadow-sm hover:shadow-md";
    const sizeStyles = {
      small: "px-3 py-1.5 text-xs", 
      medium: "px-4 py-2.5 text-sm",
    };
    const variantStyles = {
      primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 font-bold",
      secondary: "bg-gray-50 text-gray-800 border border-gray-300 hover:bg-gray-100 hover:text-black hover:border-gray-400 focus:ring-2 focus:ring-gray-400 focus:ring-offset-1",
      danger: "bg-red-600 text-white border border-red-700 hover:bg-red-700 hover:border-red-800 focus:ring-2 focus:ring-red-500 focus:ring-offset-1 font-semibold",
      success: "bg-green-600 text-white border border-green-700 hover:bg-green-700 hover:border-green-800 focus:ring-2 focus:ring-green-500 focus:ring-offset-1 font-semibold",
      warning: "bg-amber-500 text-white border border-amber-600 hover:bg-amber-600 hover:border-amber-700 focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 font-semibold",
    };
    
    // 为每种按钮类型定义专门的禁用状态样式
    const disabledStyles = {
      primary: "disabled:bg-blue-400 disabled:text-white disabled:border-blue-400 disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-none",
      secondary: "disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
      danger: "disabled:bg-red-300 disabled:text-white disabled:border-red-300 disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-none",
      success: "disabled:bg-green-300 disabled:text-white disabled:border-green-300 disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-none", 
      warning: "disabled:bg-amber-300 disabled:text-white disabled:border-amber-300 disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-none",
    };
  
    // 使用!important确保样式不被覆盖
    let importantStyles = '';
    
    if (props.disabled) {
      importantStyles = `!${disabledStyles[variant]}`;
    } else if (variant === 'primary') {
      importantStyles = '!bg-blue-600 !text-white';
    } else if (variant === 'danger') {
      importantStyles = '!bg-red-600 !text-white';
    }
  
    return (
      <button
        className={`${baseStyle} ${sizeStyles[size]} ${variantStyles[variant]} ${disabledStyles[variant]} ${importantStyles} ${className}`}
        {...props}
      >
        {icon && <span className={`${size === 'small' ? 'text-sm' : 'text-base'} transition-transform group-hover:scale-105`}>{icon}</span>}
        {children && <span>{children}</span>}
      </button>
    );
  };

export default FluentButton; 