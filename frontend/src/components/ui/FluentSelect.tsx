import React from 'react';

interface FluentSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string | number; label: string }[];
}

const FluentSelect: React.FC<FluentSelectProps> = ({ label, options, id, className, ...props }) => {
  const selectId = id || props.name; // Use name as fallback id
  // Consistent styling tokens, added appearance-none for custom arrow
  const baseStyle = "block w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ease-in-out appearance-none bg-white bg-no-repeat shadow-sm hover:border-gray-400";
  const disabledStyle = "disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed opacity-60";
  // SVG arrow using现代化颜色
  const arrowIcon = `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23606060' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`;

  return (
    <div className="mb-4 w-full">
      {label && <label htmlFor={selectId} className="block text-sm font-medium text-gray-600 mb-1.5">{label}</label>}
      <div className="relative">
         <select
            id={selectId}
            className={`${baseStyle} ${disabledStyle} ${className || ''}`}
            // Position the arrow correctly
            style={{ backgroundImage: arrowIcon, backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25em 1.25em' }}
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