import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type DialogVariant = 'default' | 'warning' | 'danger' | 'success';

interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
}

interface PromptOptions {
  title?: string;
  message: ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  multiline?: boolean;
  required?: boolean;
}

interface AlertOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  variant?: DialogVariant;
}

interface DialogContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  alert: (options: AlertOptions) => Promise<void>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useDialog = () => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within a DialogProvider');
  return ctx;
};

type DialogKind = 'confirm' | 'prompt' | 'alert';

interface ActiveDialog {
  kind: DialogKind;
  title?: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant: DialogVariant;
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
  resolve: (value: any) => void;
}

const variantStyles: Record<DialogVariant, { btn: string; iconBg: string; iconColor: string; icon: ReactNode }> = {
  default: {
    btn: 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500',
    iconBg: 'bg-primary-100',
    iconColor: 'text-primary-600',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  warning: {
    btn: 'bg-warning-600 hover:bg-warning-700 focus:ring-warning-500',
    iconBg: 'bg-warning-100',
    iconColor: 'text-warning-600',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3l-6.93-12a2 2 0 00-3.48 0l-6.93 12a2 2 0 001.74 3z" />
      </svg>
    ),
  },
  danger: {
    btn: 'bg-danger-600 hover:bg-danger-700 focus:ring-danger-500',
    iconBg: 'bg-danger-100',
    iconColor: 'text-danger-600',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.19 16a2 2 0 001.74 3z" />
      </svg>
    ),
  },
  success: {
    btn: 'bg-success-600 hover:bg-success-700 focus:ring-success-500',
    iconBg: 'bg-success-100',
    iconColor: 'text-success-600',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
};

export const DialogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const open = useCallback((d: Omit<ActiveDialog, 'resolve'>) => {
    return new Promise<any>((resolve) => {
      setInputValue(d.defaultValue ?? '');
      setInputError(null);
      setDialog({ ...d, resolve });
    });
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      open({
        kind: 'confirm',
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        variant: opts.variant ?? 'default',
      }) as Promise<boolean>,
    [open]
  );

  const prompt = useCallback(
    (opts: PromptOptions) =>
      open({
        kind: 'prompt',
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'OK',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        variant: 'default',
        defaultValue: opts.defaultValue ?? '',
        placeholder: opts.placeholder,
        multiline: opts.multiline,
        required: opts.required,
      }) as Promise<string | null>,
    [open]
  );

  const alert = useCallback(
    (opts: AlertOptions) =>
      open({
        kind: 'alert',
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'OK',
        variant: opts.variant ?? 'default',
      }) as Promise<void>,
    [open]
  );

  // Focus input when prompt opens
  useEffect(() => {
    if (dialog?.kind === 'prompt' && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [dialog]);

  // Esc to cancel, Enter to confirm (single-line prompts only)
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter' && dialog.kind !== 'prompt') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'Enter' && dialog.kind === 'prompt' && !dialog.multiline) {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog, inputValue]);

  const handleConfirm = () => {
    if (!dialog) return;
    if (dialog.kind === 'prompt') {
      const trimmed = inputValue;
      if (dialog.required && !trimmed.trim()) {
        setInputError('This field is required.');
        return;
      }
      dialog.resolve(trimmed);
    } else if (dialog.kind === 'confirm') {
      dialog.resolve(true);
    } else {
      dialog.resolve(undefined);
    }
    setDialog(null);
  };

  const handleCancel = () => {
    if (!dialog) return;
    if (dialog.kind === 'prompt') dialog.resolve(null);
    else if (dialog.kind === 'confirm') dialog.resolve(false);
    else dialog.resolve(undefined);
    setDialog(null);
  };

  return (
    <DialogContext.Provider value={{ confirm, prompt, alert }}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={dialog.kind === 'alert' ? handleConfirm : handleCancel}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${variantStyles[dialog.variant].iconBg} ${variantStyles[dialog.variant].iconColor}`}
                >
                  {variantStyles[dialog.variant].icon}
                </div>
                <div className="min-w-0 flex-1">
                  {dialog.title && (
                    <h3 className="text-base font-semibold text-gray-900 mb-1">{dialog.title}</h3>
                  )}
                  <div className="text-sm text-gray-600 whitespace-pre-line">{dialog.message}</div>

                  {dialog.kind === 'prompt' && (
                    <div className="mt-3">
                      {dialog.multiline ? (
                        <textarea
                          ref={(el) => {
                            inputRef.current = el;
                          }}
                          value={inputValue}
                          onChange={(e) => {
                            setInputValue(e.target.value);
                            if (inputError) setInputError(null);
                          }}
                          placeholder={dialog.placeholder}
                          rows={3}
                          className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y ${
                            inputError ? 'border-danger-300' : 'border-gray-300'
                          }`}
                        />
                      ) : (
                        <input
                          ref={(el) => {
                            inputRef.current = el;
                          }}
                          type="text"
                          value={inputValue}
                          onChange={(e) => {
                            setInputValue(e.target.value);
                            if (inputError) setInputError(null);
                          }}
                          placeholder={dialog.placeholder}
                          className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                            inputError ? 'border-danger-300' : 'border-gray-300'
                          }`}
                        />
                      )}
                      {inputError && (
                        <p className="mt-1 text-xs text-danger-600">{inputError}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 rounded-b-xl">
              {dialog.kind !== 'alert' && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400"
                >
                  {dialog.cancelLabel}
                </button>
              )}
              <button
                onClick={handleConfirm}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 ${variantStyles[dialog.variant].btn}`}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};
