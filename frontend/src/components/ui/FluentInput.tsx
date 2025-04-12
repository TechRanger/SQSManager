import React from 'react';

// FluentInput Component
interface FluentInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const FluentInput: React.FC<FluentInputProps> = ({ label, id, className, ...props }) => {
  const inputId = id || props.name; // Use name as fallback id
  return (
    <div className="mb-4 w-full"> {/* 使用固定尺寸替代fluent-md */}
      {label && <label htmlFor={inputId} className="block text-sm font-medium text-gray-600 mb-1.5">{label}</label>}
      <input
        id={inputId}
        className={`w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 placeholder-gray-400 shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:border-gray-400 ${className}`}
        {...props}
      />
    </div>
  );
};

export default FluentInput; 