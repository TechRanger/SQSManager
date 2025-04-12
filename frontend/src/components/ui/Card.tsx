import React from 'react';

// Card Component
interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode; // Optional slot for actions in the footer
}

const Card: React.FC<CardProps> = ({ title, children, className, actions }) => {
  return (
    <div className={`bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col overflow-hidden ${className}`}>
      {title && (
        <div className="px-6 py-4 bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        </div>
      )}
      <div className="p-6 flex-grow">
        {children}
      </div>
      {actions && (
        <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3">
          {actions}
        </div>
      )}
    </div>
  );
};

export default Card; 