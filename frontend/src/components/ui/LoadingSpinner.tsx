import React from 'react';
// import { LuLoader2 } from 'react-icons/lu'; // Using react-icons loader
import { LuLoader } from 'react-icons/lu'; // Try LuLoader instead

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
  text?: string; // Optional text next to spinner
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'medium', className, text }) => {
  const sizeClasses = {
    small: 'text-base',
    medium: 'text-xl',
    large: 'text-3xl',
  };

  return (
    <div className={`flex flex-col items-center justify-center text-neutral-secondary ${className}`}>
      {/* Use LuLoader */}
      <LuLoader className={`animate-spin ${sizeClasses[size]}`} />
      {text && <span className="mt-fluent-xs text-sm">{text}</span>}
    </div>
  );
};

export default LoadingSpinner; 