import { useEffect, useState } from 'react';
import { FaCheckCircle, FaInfoCircle, FaExclamationTriangle, FaTimesCircle } from 'react-icons/fa';

const StatusIndicator = ({ notifications }) => {
  const [activeToasts, setActiveToasts] = useState([]);

  useEffect(() => {
    if (notifications && notifications.length > 0) {
      const newNotifs = notifications.filter(n => !activeToasts.find(t => t.id === n.id));
      if (newNotifs.length > 0) {
        // Prepare toasts with types
        const enhancedNotifs = newNotifs.map(notif => {
          let alertType = 'alert-info';
          let Icon = FaInfoCircle;
          
          if (notif.type.includes('memory') || notif.type === 'plugin-done' || notif.type === 'success') {
            alertType = 'alert-success';
            Icon = FaCheckCircle;
          } else if (notif.type === 'plugin-executing') {
            alertType = 'alert-warning';
            Icon = FaExclamationTriangle;
          } else if (notif.type === 'error') {
            alertType = 'alert-error';
            Icon = FaTimesCircle;
          }

          return { ...notif, alertType, Icon };
        });

        setActiveToasts(prev => [...prev, ...enhancedNotifs]);
        
        enhancedNotifs.forEach(notif => {
          setTimeout(() => {
            setActiveToasts(prev => prev.filter(t => t.id !== notif.id));
          }, 3000);
        });
      }
    }
  }, [notifications]);

  if (activeToasts.length === 0) return null;

  return (
    <div className="toast toast-top toast-end z-[9999] p-4">
      {activeToasts.map(toast => (
        <div 
          key={toast.id} 
          className={`alert ${toast.alertType} shadow-lg rounded-xl flex items-center gap-3 animate-fade-in`}
        >
          <toast.Icon className="w-5 h-5" />
          <span className="text-sm font-medium pr-2">{toast.message}</span>
        </div>
      ))}
    </div>
  );
};

export default StatusIndicator;
