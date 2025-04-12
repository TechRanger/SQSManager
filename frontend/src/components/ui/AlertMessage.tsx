import React from 'react';

interface AlertMessageProps {
  type: 'error' | 'success' | 'warning' | 'info';
  message: string | React.ReactNode;
  className?: string;
  title?: string; // Optional title
}

const alertStyles = {
  error: {
    bg: 'bg-red-50',
    border: 'border-red-300',
    text: 'text-red-700',
    title: 'text-red-800 font-semibold',
    defaultTitle: '错误'
  },
  success: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    text: 'text-green-700',
    title: 'text-green-800 font-semibold',
    defaultTitle: '成功'
  },
  warning: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-300',
    text: 'text-yellow-700',
    title: 'text-yellow-800 font-semibold',
    defaultTitle: '警告'
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-700',
    title: 'text-blue-800 font-semibold',
    defaultTitle: '信息'
  },
};

const AlertMessage: React.FC<AlertMessageProps> = ({ type, message, className, title }) => {
  const styles = alertStyles[type];
  const displayTitle = title ?? styles.defaultTitle;

  return (
    <div 
      className={`p-4 rounded-md border shadow-sm ${styles.bg} ${styles.border} ${styles.text} ${className}`}
      role="alert"
    >
      <p className={`${styles.title} text-sm`}>{displayTitle}</p>
      <div className="mt-1.5 text-sm">{message}</div>
    </div>
  );
};

export default AlertMessage; 