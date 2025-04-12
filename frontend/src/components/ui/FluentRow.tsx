import React from 'react';

interface FluentRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode;
  className?: string;
}

const FluentRow: React.FC<FluentRowProps> = ({ children, className, ...props }) => {
  return (
    <tr 
      className={`
        bg-white 
        shadow-sm 
        rounded-md 
        transition-all 
        duration-200
        hover:bg-blue-50
        hover:shadow
        text-sm
        ${className || ''}
      `} 
      {...props}
    >
      {React.Children.map(children, (child, index) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, {
            className: `
              px-4 
              py-3 
              ${index === 0 ? 'rounded-l-md' : ''} 
              ${index === React.Children.count(children) - 1 ? 'rounded-r-md' : ''}
              ${child.props.className || ''}
            `
          });
        }
        return child;
      })}
    </tr>
  );
};

export default FluentRow; 