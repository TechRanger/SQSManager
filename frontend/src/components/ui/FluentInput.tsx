import React from 'react';

// FluentInput Component
interface FluentInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const FluentInput: React.FC<FluentInputProps> = ({ label, id, className, ...props }) => {
  const inputId = id || props.name; // Use name as fallback id
  return (
    <div className="mb-fluent-md w-full"> {/* Added w-full for consistency */}
      {label && <label htmlFor={inputId} className="block text-sm font-medium text-neutral-secondary mb-fluent-xs">{label}</label>}
      <input
        id={inputId}
        className={`w-full px-fluent-sm py-fluent-xs border border-neutral-stroke rounded-fluent-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent ${className}`}
        {...props}
      />
    </div>
  );
};

export default FluentInput; 