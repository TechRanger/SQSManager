import React from 'react';

interface FluentTableProps {
  headers: string[];
  children: React.ReactNode; // Allow children to be passed directly for flexibility
  className?: string;
}

const FluentTable: React.FC<FluentTableProps> = ({ headers, children, className }) => {
  return (
    <div className={`overflow-x-auto border border-neutral-stroke rounded-fluent-md ${className}`}>
      <table className="min-w-full divide-y divide-neutral-stroke">
        <thead className="bg-neutral-background"> {/* Use neutral-background for header */}
          <tr>
            {headers.map((header, index) => (
              <th
                key={index}
                scope="col"
                // Consistent padding and text styles from example usage
                className="px-fluent-md py-fluent-sm text-left text-xs font-medium text-neutral-secondary uppercase tracking-wider"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-neutral-stroke">
          {children}
        </tbody>
      </table>
    </div>
  );
};

export default FluentTable; 