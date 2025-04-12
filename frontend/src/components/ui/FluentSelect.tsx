import React from 'react';

interface FluentSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string | number; label: string }[];
}

const FluentSelect: React.FC<FluentSelectProps> = ({ label, options, id, className, ...props }) => {
  const selectId = id || props.name; // Use name as fallback id
  // 确保基础样式强制使用白色背景，移除hover时的灰色背景
  const baseStyle = "block w-full pl-4 pr-10 py-2.5 border border-gray-300 rounded-md text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ease-in-out appearance-none bg-no-repeat shadow-sm hover:border-gray-400";
  const disabledStyle = "disabled:bg-gray-200 disabled:text-gray-500 disabled:border-gray-300 disabled:cursor-not-allowed opacity-70";
  // 使用更清晰的下拉箭头
  const arrowIcon = `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23404040' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`;

  return (
    <div className="mb-6 w-full">
      {label && <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
      <div className="relative">
         <select
            id={selectId}
            className={`${baseStyle} ${disabledStyle} ${className || ''}`}
            // 设置箭头位置和大小
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