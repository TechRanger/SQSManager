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
    <div className={`bg-white border border-neutral-stroke rounded-fluent-lg shadow-fluent-sm flex flex-col ${className}`}>
      {title && (
        <div className="p-fluent-lg border-b border-neutral-stroke">
          <h3 className="text-lg font-semibold text-neutral-foreground">{title}</h3>
        </div>
      )}
      <div className="p-fluent-lg flex-grow">
        {children}
      </div>
      {actions && (
        <div className="p-fluent-md bg-neutral-background border-t border-neutral-stroke flex justify-end space-x-fluent-sm">
          {actions}
        </div>
      )}
    </div>
  );
};

export default Card; 