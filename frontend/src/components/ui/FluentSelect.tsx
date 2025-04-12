import React from 'react';

interface FluentSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string | number; label: string }[];
}

const FluentSelect: React.FC<FluentSelectProps> = ({ label, options, id, className, ...props }) => {
  const selectId = id || props.name; // Use name as fallback id
  // Consistent styling tokens, added appearance-none for custom arrow
  const baseStyle = "block w-full pl-fluent-sm pr-fluent-lg py-fluent-xs border border-neutral-stroke rounded-fluent-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition duration-150 ease-in-out appearance-none bg-white bg-no-repeat";
  const disabledStyle = "disabled:bg-neutral-backgroundDisabled disabled:text-neutral-disabled disabled:cursor-not-allowed opacity-60";
  // SVG arrow using Tailwind's neutral color palette
  const arrowIcon = `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23616161' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`;

  return (
    <div className="mb-fluent-md w-full"> {/* Added w-full and margin */}
      {label && <label htmlFor={selectId} className="block text-sm font-medium text-neutral-secondary mb-fluent-xs">{label}</label>}
      <div className="relative"> {/* Wrapper for positioning the arrow */}
         <select
            id={selectId}
            className={`${baseStyle} ${disabledStyle} ${className || ''}`}
            // Position the arrow correctly
            style={{ backgroundImage: arrowIcon, backgroundPosition: 'right 0.5rem center', backgroundSize: '1.5em 1.5em' }}
            {...props}
         >
            {options.map(option => (
               <option key={option.value} value={option.value}>
                  {option.label}
               </option>
            ))}
         </select>
      </div>
    </div>
  );
};

export default FluentSelect; 