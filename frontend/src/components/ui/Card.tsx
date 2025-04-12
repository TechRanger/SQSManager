import React from 'react';

// Card Component
interface CardProps {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode; // Optional slot for actions in the footer
  icon?: React.ReactNode; // Optional icon to display alongside the title
}

const Card: React.FC<CardProps> = ({ title, children, className, actions, icon }) => {
  return (
    <div className={`bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col overflow-hidden ${className}`}>
      {title && (
        <div className="px-6 py-4 bg-gray-50 flex items-center">
          {icon && <span className="mr-2">{icon}</span>}
          <h3 className="text-lg font-semibold text-gray-800">{typeof title === 'string' ? title : title}</h3>
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