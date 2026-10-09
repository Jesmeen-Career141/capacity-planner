/**
 * Centralized client-side salary formatting utility.
 * Mirrors the server salaryFormatter logic to maintain identical formatting.
 */

export const SUPPORTED_CURRENCIES = ['USD', 'LKR', 'SAR', 'BDT', 'AED', 'EUR', 'GBP', 'QAR', 'Other'];
export const SUPPORTED_SALARY_TYPES = ['range', 'fixed', 'negotiable', 'confidential', 'tbc'];
export const SUPPORTED_PERIODS = ['monthly', 'annual', 'hourly', 'other'];
export const SUPPORTED_BASES = ['gross', 'net', 'basic', 'totalPackage', 'unspecified'];

/**
 * Format a number with commas (e.g. 5500 -> "5,500", 400000 -> "400,000")
 */
export function formatNumberWithCommas(num) {
  if (num === null || num === undefined || num === '' || isNaN(num)) return '';
  return Number(num).toLocaleString('en-US');
}

/**
 * Formats structured salary data into a clean, human-readable string.
 * Falls back to fallbackText (legacy packageRange) if structured salary is absent.
 *
 * Supported formats:
 *  - USD 5,500 – 6,500
 *  - SAR 8,000 – 9,000
 *  - LKR 400,000 – 500,000
 *  - BDT 80,000 – 100,000
 *  - USD 6,500
 *  - USD 4,000 – 4,500 net
 *  - Negotiable
 *  - Confidential
 *  - TBC
 *
 * @param {Object|null} salary - Structured salary object
 * @param {string} [fallbackText=''] - Legacy packageRange string fallback
 * @param {Object} [options={}] - Formatting options
 * @returns {string} Formatted salary string
 */
export function formatSalary(salary, fallbackText = '', options = {}) {
  if (!salary || typeof salary !== 'object') {
    return fallbackText || '';
  }

  const {
    currency = 'USD',
    salaryType = 'range',
    minAmount = null,
    maxAmount = null,
    period = 'monthly',
    basis = 'unspecified',
    notes = ''
  } = salary;

  // Non-numeric salary types
  if (salaryType === 'negotiable') return 'Negotiable';
  if (salaryType === 'confidential') return 'Confidential';
  if (salaryType === 'tbc') return 'TBC';

  let amountStr = '';
  const currPrefix = currency && currency !== 'Other' ? `${currency} ` : '';

  if (salaryType === 'fixed') {
    const amount = minAmount != null ? minAmount : maxAmount;
    if (amount != null && !isNaN(amount)) {
      amountStr = `${currPrefix}${formatNumberWithCommas(amount)}`;
    }
  } else {
    // range or default
    const hasMin = minAmount != null && !isNaN(minAmount);
    const hasMax = maxAmount != null && !isNaN(maxAmount);

    if (hasMin && hasMax) {
      if (Number(minAmount) === Number(maxAmount)) {
        amountStr = `${currPrefix}${formatNumberWithCommas(minAmount)}`;
      } else {
        // En-dash (–) with spaces matching requirements
        amountStr = `${currPrefix}${formatNumberWithCommas(minAmount)} \u2013 ${formatNumberWithCommas(maxAmount)}`;
      }
    } else if (hasMin) {
      amountStr = `${currPrefix}${formatNumberWithCommas(minAmount)}+`;
    } else if (hasMax) {
      amountStr = `Up to ${currPrefix}${formatNumberWithCommas(maxAmount)}`;
    }
  }

  // If no amount was generated, fall back to legacy text
  if (!amountStr) {
    return fallbackText || '';
  }

  // Basis distinction: e.g. "net", "basic", "total package"
  let basisStr = '';
  if (basis === 'net') {
    basisStr = ' net';
  } else if (basis === 'basic') {
    basisStr = ' basic';
  } else if (basis === 'totalPackage') {
    basisStr = ' total package';
  }

  // Period: monthly is default; add suffix for annual or hourly
  let periodStr = '';
  if (period === 'annual') {
    periodStr = ' /yr';
  } else if (period === 'hourly') {
    periodStr = ' /hr';
  }

  let result = `${amountStr}${basisStr}${periodStr}`;

  // Additional compensation notes
  if (notes && typeof notes === 'string' && notes.trim()) {
    const trimmedNotes = notes.trim();
    if (trimmedNotes.startsWith('+')) {
      result = `${result} ${trimmedNotes}`;
    } else {
      result = `${result} (${trimmedNotes})`;
    }
  }

  return result;
}

/**
 * Validates a structured salary payload on client side.
 */
export function validateSalary(salary) {
  const errors = [];
  if (!salary || typeof salary !== 'object') {
    return { valid: true, errors: [], sanitized: null };
  }

  const sanitized = {
    currency: salary.currency || 'USD',
    salaryType: salary.salaryType || 'range',
    minAmount: salary.minAmount != null && salary.minAmount !== ''
      ? Number(typeof salary.minAmount === 'string' ? salary.minAmount.replace(/,/g, '') : salary.minAmount)
      : null,
    maxAmount: salary.maxAmount != null && salary.maxAmount !== ''
      ? Number(typeof salary.maxAmount === 'string' ? salary.maxAmount.replace(/,/g, '') : salary.maxAmount)
      : null,
    period: salary.period || 'monthly',
    basis: salary.basis || 'unspecified',
    notes: typeof salary.notes === 'string' ? salary.notes.trim() : ''
  };

  if (!SUPPORTED_CURRENCIES.includes(sanitized.currency)) {
    errors.push(`Invalid currency: ${sanitized.currency}`);
  }

  if (!SUPPORTED_SALARY_TYPES.includes(sanitized.salaryType)) {
    errors.push(`Invalid salaryType: ${sanitized.salaryType}`);
  }

  if (sanitized.minAmount != null && (isNaN(sanitized.minAmount) || sanitized.minAmount < 0)) {
    errors.push('minAmount must be a non-negative number');
  }

  if (sanitized.maxAmount != null && (isNaN(sanitized.maxAmount) || sanitized.maxAmount < 0)) {
    errors.push('maxAmount must be a non-negative number');
  }

  if (sanitized.minAmount != null && sanitized.maxAmount != null) {
    if (sanitized.minAmount > sanitized.maxAmount) {
      errors.push(`minAmount (${sanitized.minAmount}) cannot exceed maxAmount (${sanitized.maxAmount})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitized : null
  };
}
