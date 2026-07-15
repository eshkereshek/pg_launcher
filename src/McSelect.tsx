import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import './McSelect.css';

export interface McSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface McSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: McSelectOption[];
  style?: React.CSSProperties;
  disabled?: boolean;
}

export function McSelect({ value, onChange, options, style, disabled }: McSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value) || options[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div 
      className={`mc-custom-select ${disabled ? 'disabled' : ''} ${isOpen ? 'open' : ''}`} 
      style={style} 
      ref={containerRef}
    >
      <div 
        className="mc-custom-select-trigger" 
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="mc-custom-select-value">
          {selectedOption?.icon && <div className="mc-select-icon-wrapper">{selectedOption.icon}</div>}
          <span>{selectedOption?.label}</span>
        </div>
        <ChevronDown size={16} color="#aaa" />
      </div>

      {isOpen && (
        <div className="mc-custom-select-dropdown">
          {options.map((option) => (
            <div 
              key={option.value}
              className={`mc-custom-select-option ${option.disabled ? 'disabled' : ''} ${option.value === value ? 'selected' : ''}`}
              onClick={() => {
                if (!option.disabled) {
                  onChange(option.value);
                  setIsOpen(false);
                }
              }}
            >
              {option.icon && <div className="mc-select-icon-wrapper">{option.icon}</div>}
              <span>{option.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
