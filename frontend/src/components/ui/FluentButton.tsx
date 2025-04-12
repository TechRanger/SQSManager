import React from 'react';

// FluentButton Component
interface FluentButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
    icon?: React.ReactNode;
    size?: 'small' | 'medium'; 
}

const FluentButton: React.FC<FluentButtonProps> = ({ variant = 'secondary', icon, children, className, size = 'medium', ...props }) => {
    const baseStyle = "rounded-fluent-sm font-medium flex items-center justify-center space-x-fluent-xs transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 shadow-none";
    const sizeStyles = {
      small: "px-fluent-sm py-1 text-xs", 
      medium: "px-fluent-md py-fluent-xs text-sm",
    };
    const variantStyles = {
      primary: "bg-brand text-white hover:bg-brand-dark focus:ring-brand",
      secondary: "bg-neutral-background text-neutral-foreground border border-neutral-stroke hover:bg-gray-200 focus:ring-brand",
      danger: "bg-danger-background text-danger hover:bg-red-200 focus:ring-danger",
      success: "bg-success-background text-success hover:bg-green-200 focus:ring-success",
      warning: "bg-warning-background text-warning hover:bg-yellow-200 focus:ring-warning",
    };
    const disabledStyle = "disabled:bg-neutral-backgroundDisabled disabled:text-neutral-disabled disabled:border-neutral-stroke disabled:cursor-not-allowed opacity-60";
  
    return (
      <button
        className={`${baseStyle} ${sizeStyles[size]} ${variantStyles[variant]} ${disabledStyle} ${className}`}
        {...props}
      >
        {icon && <span className={`${size === 'small' ? 'text-sm' : 'text-base'}`}>{icon}</span>}
        {children && <span>{children}</span>}
      </button>
    );
  };

export default FluentButton; 