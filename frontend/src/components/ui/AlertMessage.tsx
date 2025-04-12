import React from 'react';

interface AlertMessageProps {
  type: 'error' | 'success' | 'warning' | 'info';
  message: string | React.ReactNode;
  className?: string;
  title?: string; // Optional title
}

const alertStyles = {
  error: {
    bg: 'bg-danger-background',
    border: 'border-danger-stroke',
    text: 'text-danger',
    defaultTitle: '错误'
  },
  success: {
    bg: 'bg-success-background',
    border: 'border-success-stroke',
    text: 'text-success',
    defaultTitle: '成功'
  },
  warning: {
    bg: 'bg-warning-background',
    border: 'border-warning-stroke',
    text: 'text-warning',
    defaultTitle: '警告'
  },
  info: {
    bg: 'bg-neutral-background-strong',
    border: 'border-neutral-stroke',
    text: 'text-neutral-foreground',
    defaultTitle: '信息'
  },
};

const AlertMessage: React.FC<AlertMessageProps> = ({ type, message, className, title }) => {
  const styles = alertStyles[type];
  const displayTitle = title ?? styles.defaultTitle;

  return (
    <div 
      className={`p-fluent-md rounded-fluent-sm border ${styles.bg} ${styles.border} ${styles.text} ${className}`}
      role="alert"
    >
      <p className="font-medium">{displayTitle}</p>
      <div className="mt-1">{message}</div>
    </div>
  );
};

export default AlertMessage; 