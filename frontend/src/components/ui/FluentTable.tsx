import React from 'react';

interface FluentTableProps {
  headers: string[];
  children: React.ReactNode; // Allow children to be passed directly for flexibility
  className?: string;
}

const FluentTable: React.FC<FluentTableProps> = ({ headers, children, className }) => {
  return (
    <div className={`overflow-x-auto rounded-lg shadow-sm border border-gray-200 ${className}`}>
      <table className="min-w-full border-separate" style={{ borderSpacing: '0 0.75rem' }}>
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {headers.map((header, index) => (
              <th
                key={index}
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children}
        </tbody>
      </table>
    </div>
  );
};

export default FluentTable; 