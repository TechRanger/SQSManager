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
        border-b border-gray-300
        last:border-b-0
        transition-all 
        duration-200
        hover:bg-gray-50
        hover:shadow
        text-sm
        font-medium
        ${className || ''}
      `} 
      {...props}
    >
      {React.Children.map(children, (child, _index) => {
        if (React.isValidElement(child)) {
          // 使用类型断言告诉TypeScript我们知道这个元素有className属性
          return React.cloneElement(child as React.ReactElement<any>, {
            className: `
              px-4 
              py-3.5
              ${(child as any).props.className || ''}
            `
          });
        }
        return child;
      })}
    </tr>
  );
};

export default FluentRow; 