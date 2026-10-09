import React, { useState, useEffect, useMemo } from 'react';
import NumberFormatInput from './NumberFormatInput';
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_SALARY_TYPES,
  SUPPORTED_PERIODS,
  SUPPORTED_BASES,
  formatSalary
} from '../utils/salaryFormatter';
import './SalaryPackagePicker.css';

const SALARY_TYPE_LABELS = {
  range: 'Salary Range',
  fixed: 'Fixed Salary',
  negotiable: 'Negotiable',
  confidential: 'Confidential',
  tbc: 'To be confirmed (TBC)'
};

const PERIOD_LABELS = {
  monthly: 'Monthly',
  annual: 'Annual',
  hourly: 'Hourly',
  other: 'Other'
};

const BASIS_LABELS = {
  unspecified: 'Unspecified',
  gross: 'Gross',
  net: 'Net',
  basic: 'Basic',
  totalPackage: 'Total Package'
};

/**
 * SalaryPackagePicker
 * Comprehensive structured salary picker component.
 *
 * Props:
 * - value: structured salary object or null
 * - legacyText: existing packageRange string fallback
 * - onChange: (updatedSalary: object | null, formattedString: string) => void
 * - disabled: boolean
 * - compact: boolean (if rendered inside a compact modal or popover)
 */
export default function SalaryPackagePicker({
  value,
  legacyText = '',
  onChange,
  disabled = false,
  compact = false
}) {
  // If the record only has legacyText and no structured salary, track mode
  const hasStructuredInitial = Boolean(
    value &&
    (value.minAmount != null ||
     value.maxAmount != null ||
     ['negotiable', 'confidential', 'tbc'].includes(value.salaryType))
  );

  const [useStructured, setUseStructured] = useState(() => {
    if (hasStructuredInitial) return true;
    if (legacyText && !value) return false;
    return true; // Default to structured for new positions
  });

  const [salaryData, setSalaryData] = useState(() => ({
    currency: value?.currency || 'USD',
    salaryType: value?.salaryType || 'range',
    minAmount: value?.minAmount != null ? value.minAmount : null,
    maxAmount: value?.maxAmount != null ? value.maxAmount : null,
    period: value?.period || 'monthly',
    basis: value?.basis || 'unspecified',
    notes: value?.notes || ''
  }));

  // Sync internal state when external value changes
  useEffect(() => {
    if (value) {
      setSalaryData({
        currency: value.currency || 'USD',
        salaryType: value.salaryType || 'range',
        minAmount: value.minAmount != null ? value.minAmount : null,
        maxAmount: value.maxAmount != null ? value.maxAmount : null,
        period: value.period || 'monthly',
        basis: value.basis || 'unspecified',
        notes: value.notes || ''
      });
      setUseStructured(true);
    }
  }, [value]);

  // Validation
  const validationError = useMemo(() => {
    if (!useStructured) return null;
    if (salaryData.salaryType === 'range') {
      if (
        salaryData.minAmount != null &&
        salaryData.maxAmount != null &&
        salaryData.minAmount > salaryData.maxAmount
      ) {
        return 'Minimum salary amount cannot exceed maximum salary amount.';
      }
    }
    return null;
  }, [useStructured, salaryData]);

  // Live preview
  const livePreview = useMemo(() => {
    if (!useStructured) {
      return legacyText || 'Not specified';
    }
    return formatSalary(salaryData, legacyText) || 'Not specified';
  }, [useStructured, salaryData, legacyText]);

  const updateField = (field, val) => {
    const nextData = { ...salaryData, [field]: val };

    // If switching type, clean amounts if needed
    if (field === 'salaryType') {
      if (['negotiable', 'confidential', 'tbc'].includes(val)) {
        nextData.minAmount = null;
        nextData.maxAmount = null;
      } else if (val === 'fixed') {
        // If fixed, use minAmount or maxAmount as single amount
        const single = nextData.minAmount != null ? nextData.minAmount : nextData.maxAmount;
        nextData.minAmount = single;
        nextData.maxAmount = single;
      }
    }

    setSalaryData(nextData);

    if (onChange) {
      const formatted = formatSalary(nextData, '');
      onChange(nextData, formatted);
    }
  };

  const handleSwitchToStructured = () => {
    setUseStructured(true);
    if (onChange) {
      const formatted = formatSalary(salaryData, '');
      onChange(salaryData, formatted);
    }
  };

  const handleKeepLegacy = () => {
    setUseStructured(false);
    if (onChange) {
      // Emitting null for structured salary keeps legacy string as authoritative
      onChange(null, legacyText);
    }
  };

  return (
    <div className={`salary-picker ${compact ? 'salary-picker--compact' : ''}`}>
      {/* Legacy Mode Notice & Switcher */}
      {legacyText && !hasStructuredInitial && (
        <div className="salary-picker-legacy-banner">
          <div className="salary-legacy-text-row">
            <span className="salary-legacy-label">Current text:</span>
            <span className="salary-legacy-value">"{legacyText}"</span>
          </div>
          <div className="salary-legacy-actions">
            {!useStructured ? (
              <button
                type="button"
                className="btn-legacy-switch"
                onClick={handleSwitchToStructured}
                disabled={disabled}
              >
                + Convert to structured salary
              </button>
            ) : (
              <button
                type="button"
                className="btn-legacy-revert"
                onClick={handleKeepLegacy}
                disabled={disabled}
              >
                Keep original legacy text
              </button>
            )}
          </div>
        </div>
      )}

      {useStructured && (
        <div className="salary-picker-fields">
          {/* Row 1: Currency & Package Type */}
          <div className="salary-picker-row">
            <div className="salary-picker-group">
              <label htmlFor="salary-currency" className="salary-picker-label">
                Currency
              </label>
              <select
                id="salary-currency"
                className="salary-picker-select"
                value={salaryData.currency}
                onChange={(e) => updateField('currency', e.target.value)}
                disabled={disabled}
              >
                {SUPPORTED_CURRENCIES.map((curr) => (
                  <option key={curr} value={curr}>
                    {curr}
                  </option>
                ))}
              </select>
            </div>

            <div className="salary-picker-group">
              <label htmlFor="salary-type" className="salary-picker-label">
                Package Type
              </label>
              <select
                id="salary-type"
                className="salary-picker-select"
                value={salaryData.salaryType}
                onChange={(e) => updateField('salaryType', e.target.value)}
                disabled={disabled}
              >
                {SUPPORTED_SALARY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {SALARY_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Amounts (Conditional on salaryType) */}
          {salaryData.salaryType === 'range' && (
            <div className="salary-picker-row">
              <div className="salary-picker-group">
                <label htmlFor="salary-min" className="salary-picker-label">
                  Minimum Amount ({salaryData.currency})
                </label>
                <NumberFormatInput
                  id="salary-min"
                  value={salaryData.minAmount}
                  onChange={(val) => updateField('minAmount', val)}
                  placeholder="e.g. 500,000"
                  disabled={disabled}
                  ariaLabel="Minimum salary amount"
                />
              </div>

              <div className="salary-picker-group">
                <label htmlFor="salary-max" className="salary-picker-label">
                  Maximum Amount ({salaryData.currency})
                </label>
                <NumberFormatInput
                  id="salary-max"
                  value={salaryData.maxAmount}
                  onChange={(val) => updateField('maxAmount', val)}
                  placeholder="e.g. 600,000"
                  disabled={disabled}
                  ariaLabel="Maximum salary amount"
                />
              </div>
            </div>
          )}

          {salaryData.salaryType === 'fixed' && (
            <div className="salary-picker-row">
              <div className="salary-picker-group salary-picker-group--full">
                <label htmlFor="salary-fixed" className="salary-picker-label">
                  Fixed Amount ({salaryData.currency})
                </label>
                <NumberFormatInput
                  id="salary-fixed"
                  value={salaryData.minAmount != null ? salaryData.minAmount : salaryData.maxAmount}
                  onChange={(val) => {
                    updateField('minAmount', val);
                    updateField('maxAmount', val);
                  }}
                  placeholder="e.g. 500,000"
                  disabled={disabled}
                  ariaLabel="Fixed salary amount"
                />
              </div>
            </div>
          )}

          {/* Validation Error Message */}
          {validationError && (
            <div className="salary-picker-error" role="alert">
              ⚠️ {validationError}
            </div>
          )}

          {/* Row 3: Period & Basis */}
          <div className="salary-picker-row">
            <div className="salary-picker-group">
              <label htmlFor="salary-period" className="salary-picker-label">
                Pay Period
              </label>
              <select
                id="salary-period"
                className="salary-picker-select"
                value={salaryData.period}
                onChange={(e) => updateField('period', e.target.value)}
                disabled={disabled}
              >
                {SUPPORTED_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {PERIOD_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            <div className="salary-picker-group">
              <label htmlFor="salary-basis" className="salary-picker-label">
                Salary Basis
              </label>
              <select
                id="salary-basis"
                className="salary-picker-select"
                value={salaryData.basis}
                onChange={(e) => updateField('basis', e.target.value)}
                disabled={disabled}
              >
                {SUPPORTED_BASES.map((b) => (
                  <option key={b} value={b}>
                    {BASIS_LABELS[b]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 4: Additional Notes */}
          <div className="salary-picker-group salary-picker-group--full">
            <label htmlFor="salary-notes" className="salary-picker-label">
              Additional Package Notes
            </label>
            <input
              id="salary-notes"
              type="text"
              className="salary-picker-input"
              value={salaryData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="e.g. + Veh + Fuel, allowances, bonuses"
              disabled={disabled}
            />
          </div>
        </div>
      )}

      {/* Live Formatted Output Preview */}
      <div className="salary-picker-preview">
        <span className="salary-preview-label">Formatted Display:</span>
        <span className="salary-preview-value">{livePreview}</span>
      </div>
    </div>
  );
}
