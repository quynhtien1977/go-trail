import type { ReactNode } from "react";

type AlertType = "error" | "warning" | "success" | "info";

export function Alert({
  type = "info",
  title,
  children,
  className = "",
}: {
  type?: AlertType;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const styles: Record<AlertType, { container: string; icon: ReactNode; text: string; titleColor: string }> = {
    error: {
      container: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-200",
      titleColor: "text-red-900 dark:text-red-100",
      text: "text-red-700 dark:text-red-300",
      icon: (
        <svg className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    warning: {
      container: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200",
      titleColor: "text-amber-900 dark:text-amber-100",
      text: "text-amber-700 dark:text-amber-300",
      icon: (
        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    success: {
      container: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200",
      titleColor: "text-emerald-900 dark:text-emerald-100",
      text: "text-emerald-700 dark:text-emerald-300",
      icon: (
        <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    info: {
      container: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60 text-blue-800 dark:text-blue-200",
      titleColor: "text-blue-900 dark:text-blue-100",
      text: "text-blue-700 dark:text-blue-300",
      icon: (
        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  };

  const current = styles[type];

  return (
    <div className={`p-4 rounded-xl border text-sm flex gap-3 ${current.container} ${className}`} role="alert">
      {current.icon}
      <div className="flex-1 space-y-1">
        {title && <h5 className={`font-semibold ${current.titleColor}`}>{title}</h5>}
        <div className={current.text}>{children}</div>
      </div>
    </div>
  );
}
