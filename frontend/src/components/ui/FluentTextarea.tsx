import React from 'react';

interface FluentTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

const FluentTextarea: React.FC<FluentTextareaProps> = ({ label, id, className, ...props }) => {
  const textareaId = id || props.name;
  // Use consistent styling tokens
  const baseStyle = "w-full px-4 py-3 border border-neutral-stroke rounded-fluent-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent min-h-[80px] transition duration-150 ease-in-out";
  const disabledStyle = "disabled:bg-neutral-backgroundDisabled disabled:text-neutral-disabled disabled:cursor-not-allowed opacity-60";

  return (
    <div className="mb-6 w-full"> {/* 增加边距从mb-fluent-md改为mb-6 */}
      {label && <label htmlFor={textareaId} className="block text-sm font-medium text-neutral-secondary mb-2">{label}</label>}
      <textarea
        id={textareaId}
        className={`${baseStyle} ${disabledStyle} ${className || ''}`}
        {...props}
      />
    </div>
  );
};

export default FluentTextarea; 