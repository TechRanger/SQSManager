import React from 'react';

interface FluentTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

const FluentTextarea: React.FC<FluentTextareaProps> = ({ label, id, className, ...props }) => {
  const textareaId = id || props.name;
  // Use consistent styling tokens
  const baseStyle = "w-full px-fluent-sm py-fluent-xs border border-neutral-stroke rounded-fluent-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent min-h-[60px] transition duration-150 ease-in-out";
  const disabledStyle = "disabled:bg-neutral-backgroundDisabled disabled:text-neutral-disabled disabled:cursor-not-allowed opacity-60";

  return (
    <div className="mb-fluent-md w-full"> {/* Added w-full and margin */}
      {label && <label htmlFor={textareaId} className="block text-sm font-medium text-neutral-secondary mb-fluent-xs">{label}</label>}
      <textarea
        id={textareaId}
        className={`${baseStyle} ${disabledStyle} ${className || ''}`}
        {...props}
      />
    </div>
  );
};

export default FluentTextarea; 