import React, { useRef, useLayoutEffect, useState, useEffect } from 'react';
import { formatNumberWithCommas } from '../utils/salaryFormatter';

/**
 * NumberFormatInput
 * A controlled numeric input that displays thousands separators (commas)
 * while managing cursor positioning and emitting pure unformatted numbers.
 *
 * Props:
 * - value: number | null | undefined
 * - onChange: (val: number | null) => void
 * - placeholder: string
 * - id: string
 * - name: string
 * - disabled: boolean
 * - className: string
 * - ariaLabel: string
 * - min: number
 * - max: number
 */
export default function NumberFormatInput({
  value,
  onChange,
  placeholder = '0',
  id,
  name,
  disabled = false,
  className = '',
  ariaLabel,
  max,
  ...rest
}) {
  const inputRef = useRef(null);
  const cursorRef = useRef(null);

  // Compute display string from value prop
  const formatDisplay = (val) => {
    if (val === null || val === undefined || val === '' || isNaN(val)) return '';
    return formatNumberWithCommas(val);
  };

  const [displayValue, setDisplayValue] = useState(() => formatDisplay(value));

  // Sync external value changes
  useEffect(() => {
    const nextDisplay = formatDisplay(value);
    // If value prop changes externally, update display
    const currentClean = displayValue.replace(/[^\d]/g, '');
    const nextClean = nextDisplay.replace(/[^\d]/g, '');
    if (currentClean !== nextClean) {
      setDisplayValue(nextDisplay);
    }
  }, [value]);

  // Restore cursor after re-render/formatting
  useLayoutEffect(() => {
    if (cursorRef.current !== null && inputRef.current) {
      const { targetDigits } = cursorRef.current;
      let digitCount = 0;
      let newCursorPos = displayValue.length;

      if (targetDigits === 0) {
        newCursorPos = 0;
      } else {
        for (let i = 0; i < displayValue.length; i++) {
          if (/\d/.test(displayValue[i])) {
            digitCount++;
            if (digitCount === targetDigits) {
              newCursorPos = i + 1;
              break;
            }
          }
        }
      }

      inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      cursorRef.current = null;
    }
  }, [displayValue]);

  const handleChange = (e) => {
    const rawVal = e.target.value;
    const currentCursor = e.target.selectionStart || 0;

    // Count digits to the left of the cursor before re-formatting
    const textBeforeCursor = rawVal.slice(0, currentCursor);
    const digitsBeforeCursor = (textBeforeCursor.match(/\d/g) || []).length;

    // Strip non-digits (reject negatives, letters, symbols)
    const digitsOnly = rawVal.replace(/[^\d]/g, '');

    if (!digitsOnly) {
      setDisplayValue('');
      cursorRef.current = { targetDigits: 0 };
      if (onChange) onChange(null);
      return;
    }

    const numericVal = parseInt(digitsOnly, 10);

    // Enforce max if specified
    if (max != null && numericVal > max) {
      return;
    }

    const formatted = formatNumberWithCommas(numericVal);
    setDisplayValue(formatted);
    cursorRef.current = { targetDigits: digitsBeforeCursor };

    if (onChange) {
      onChange(numericVal);
    }
  };

  const handleKeyDown = (e) => {
    // Prevent typing '-' or '+' or 'e' or '.'
    if (['-', '+', 'e', 'E', '.'].includes(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      id={id}
      name={name}
      value={displayValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`number-format-input ${className}`}
      autoComplete="off"
      {...rest}
    />
  );
}
