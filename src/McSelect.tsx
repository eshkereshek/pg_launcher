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

export function PixelCheckmark({ size = 12, color = 'var(--pg-yellow)' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.7)}
      viewBox="0 0 12 8"
      fill={color}
      style={{ imageRendering: 'pixelated', flexShrink: 0 }}
    >
      <path d="M10 0h2v1h-2z M9 1h3v1H9z M8 2h2v1H8z M0 3h2v2H0z M7 3h2v2H7z M2 5h2v2H2z M4 6h3v1H4z M5 5h2v1H5z M3 7h2v1H3z" />
    </svg>
  );
}

export function RussianFlag({ width = 18, height = 12 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 18 12" style={{ borderRadius: '1px', flexShrink: 0, border: '1px solid rgba(0,0,0,0.5)', boxSizing: 'border-box', imageRendering: 'pixelated' }}>
      <rect width="18" height="4" y="0" fill="#ffffff" />
      <rect width="18" height="4" y="4" fill="#0039a6" />
      <rect width="18" height="4" y="8" fill="#d52b1e" />
    </svg>
  );
}

export function AmericanFlag({ width = 18, height = 12 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 18 12" style={{ borderRadius: '1px', flexShrink: 0, border: '1px solid rgba(0,0,0,0.5)', boxSizing: 'border-box', imageRendering: 'pixelated' }}>
      <rect width="18" height="1.71" y="0" fill="#b22234" />
      <rect width="18" height="1.71" y="1.71" fill="#ffffff" />
      <rect width="18" height="1.71" y="3.42" fill="#b22234" />
      <rect width="18" height="1.71" y="5.13" fill="#ffffff" />
      <rect width="18" height="1.71" y="6.84" fill="#b22234" />
      <rect width="18" height="1.71" y="8.55" fill="#ffffff" />
      <rect width="18" height="1.74" y="10.26" fill="#b22234" />
      <rect width="7.5" height="6.84" y="0" fill="#3c3b6e" />
      <circle cx="2" cy="1.8" r="0.6" fill="#ffffff" />
      <circle cx="4" cy="1.8" r="0.6" fill="#ffffff" />
      <circle cx="6" cy="1.8" r="0.6" fill="#ffffff" />
      <circle cx="3" cy="3.4" r="0.6" fill="#ffffff" />
      <circle cx="5" cy="3.4" r="0.6" fill="#ffffff" />
      <circle cx="2" cy="5.0" r="0.6" fill="#ffffff" />
      <circle cx="4" cy="5.0" r="0.6" fill="#ffffff" />
      <circle cx="6" cy="5.0" r="0.6" fill="#ffffff" />
    </svg>
  );
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
              <div className="mc-custom-select-option-content">
                {option.icon && <div className="mc-select-icon-wrapper">{option.icon}</div>}
                <span>{option.label}</span>
              </div>
              {option.value === value && (
                <div className="mc-select-check-wrapper">
                  <PixelCheckmark color="var(--pg-yellow)" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
