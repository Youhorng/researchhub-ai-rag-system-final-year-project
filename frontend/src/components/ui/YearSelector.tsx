import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

const DEFAULT_YEARS = Array.from({ length: 17 }, (_, i) => 2010 + i);

interface YearSelectorProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (year: string) => void;
  readonly onBlur?: () => void;
  readonly touched: boolean;
  readonly hasError: boolean;
  readonly errorMessage?: string;
  readonly warningMessage?: string;
  readonly placeholder?: string;
  readonly years?: number[];
}

export default function YearSelector({
  id,
  label,
  value,
  onChange,
  onBlur,
  touched,
  hasError,
  errorMessage,
  warningMessage,
  placeholder = 'Select year',
  years = DEFAULT_YEARS,
}: YearSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: 'center' });
    }
  }, [isOpen]);

  const showError = touched && hasError;
  const borderClass = showError
    ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30'
    : 'border-[#161f33] focus-within:border-primary/50 focus-within:ring-primary/50';

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsOpen(false);
          onBlur?.();
        }
      }}
    >
      <label htmlFor={id} className="block text-sm font-medium text-zinc-100 mb-1.5">
        {label} <span className="text-red-400">*</span>
      </label>

      <button
        type="button"
        id={id}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full bg-surface_container_high border rounded-xl px-4 py-2.5 text-sm text-left flex items-center justify-between transition-colors focus:outline-none focus:ring-1 ${borderClass}`}
      >
        <span className={value ? 'text-white' : 'text-zinc-400'}>
          {value || placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto scrollbar-hide overscroll-contain bg-surface_container_high border border-[#161f33] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-30 flex flex-col py-1"
        >
          {years.map((year) => {
            const isSelected = value === String(year);
            return (
              <button
                key={year}
                ref={isSelected ? selectedRef : undefined}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(String(year));
                  setIsOpen(false);
                }}
                className={`px-4 py-2.5 text-left text-sm transition-colors ${
                  isSelected
                    ? 'bg-surface_container text-white font-medium'
                    : 'text-zinc-100 hover:bg-surface_container'
                }`}
              >
                {year}
              </button>
            );
          })}
        </div>
      )}

      {showError && errorMessage && (
        <p className="mt-1.5 text-xs text-red-400">{errorMessage}</p>
      )}
      {warningMessage && (
        <p className="mt-1.5 text-xs text-amber-400">{warningMessage}</p>
      )}
    </div>
  );
}
