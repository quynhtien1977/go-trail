import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || props.name;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative rounded-xl shadow-xs">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
              {leftIcon}
            </div>
          )}
          <InputPrimitive
            ref={ref}
            id={inputId}
            type={type}
            data-slot="input"
            className={cn(
              "h-10 w-full min-w-0 rounded-xl border bg-white dark:bg-zinc-900/90 text-zinc-900 dark:text-zinc-100 text-sm transition-all outline-none placeholder:text-zinc-400 focus-visible:border-[#febb02] focus-visible:ring-3 focus-visible:ring-[#febb02]/25 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:opacity-50",
              leftIcon ? "pl-10" : "pl-3.5",
              rightIcon ? "pr-10" : "pr-3.5",
              error
                ? "border-red-400 dark:border-red-800 focus-visible:border-red-500 focus-visible:ring-red-500/20"
                : "border-zinc-300 dark:border-zinc-700/80",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
