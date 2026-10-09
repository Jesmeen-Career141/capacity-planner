/**
 * Centralized salary formatting, validation, and parsing utility.
 * Used across backend services and migration scripts.
 */

const SUPPORTED_CURRENCIES = ['USD', 'LKR', 'SAR', 'BDT', 'AED', 'EUR', 'GBP', 'QAR', 'Other'];
const SUPPORTED_SALARY_TYPES = ['range', 'fixed', 'negotiable', 'confidential', 'tbc'];
const SUPPORTED_PERIODS = ['monthly', 'annual', 'hourly', 'other'];
const SUPPORTED_BASES = ['gross', 'net', 'basic', 'totalPackage', 'unspecified'];

/**
 * Format a number with commas (e.g. 5500 -> "5,500", 400000 -> "400,000")
 */
function formatNumberWithCommas(num) {
  if (num === null || num === undefined || num === '' || isNaN(num)) return '';
  return Number(num).toLocaleString('en-US');
}

/**
 * Format structured salary data into a clean, human-readable string.
 * Falls back to fallbackText if structured salary is absent.
 *
 * Examples:
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
function formatSalary(salary, fallbackText = '', options = {}) {
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
        // En-dash (–) with spaces matching requirements: "USD 5,500 – 6,500"
        amountStr = `${currPrefix}${formatNumberWithCommas(minAmount)} \u2013 ${formatNumberWithCommas(maxAmount)}`;
      }
    } else if (hasMin) {
      amountStr = `${currPrefix}${formatNumberWithCommas(minAmount)}+`;
    } else if (hasMax) {
      amountStr = `Up to ${currPrefix}${formatNumberWithCommas(maxAmount)}`;
    }
  }

  // If no amount was generated, fall back
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
 * Validates a structured salary payload.
 *
 * @param {Object} salary
 * @returns {{ valid: boolean, errors: string[], sanitized: Object }}
 */
function validateSalary(salary) {
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
    errors.push(`Invalid currency: ${sanitized.currency}. Must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`);
  }

  if (!SUPPORTED_SALARY_TYPES.includes(sanitized.salaryType)) {
    errors.push(`Invalid salaryType: ${sanitized.salaryType}. Must be one of: ${SUPPORTED_SALARY_TYPES.join(', ')}`);
  }

  if (!SUPPORTED_PERIODS.includes(sanitized.period)) {
    errors.push(`Invalid period: ${sanitized.period}. Must be one of: ${SUPPORTED_PERIODS.join(', ')}`);
  }

  if (!SUPPORTED_BASES.includes(sanitized.basis)) {
    errors.push(`Invalid basis: ${sanitized.basis}. Must be one of: ${SUPPORTED_BASES.join(', ')}`);
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

/**
 * Confidently parses an unstructured or legacy salary string into a structured salary object.
 * Returns null if the string is ambiguous or cannot be parsed with high confidence.
 *
 * @param {string} raw - Raw package range string
 * @returns {Object|null} Structured salary object or null if unparseable
 */
function parseSalaryString(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();
  if (!str) return null;

  // 1. Direct keyword match
  if (/^negotiable$/i.test(str)) {
    return {
      currency: 'USD',
      salaryType: 'negotiable',
      minAmount: null,
      maxAmount: null,
      period: 'monthly',
      basis: 'unspecified',
      notes: ''
    };
  }
  if (/^confidential$/i.test(str)) {
    return {
      currency: 'USD',
      salaryType: 'confidential',
      minAmount: null,
      maxAmount: null,
      period: 'monthly',
      basis: 'unspecified',
      notes: ''
    };
  }
  if (/^(tbc|to be confirmed)$/i.test(str)) {
    return {
      currency: 'USD',
      salaryType: 'tbc',
      minAmount: null,
      maxAmount: null,
      period: 'monthly',
      basis: 'unspecified',
      notes: ''
    };
  }

  // Ambiguous text like "Open To Discuss" or standalone text without digits -> do NOT guess
  if (!/\d/.test(str)) {
    return null;
  }

  // 2. Identify currency unambiguously
  let currency = null;
  const currencyMatches = [];
  if (/\bUSD\b|\$/i.test(str)) currencyMatches.push('USD');
  if (/\bLKR\b/i.test(str)) currencyMatches.push('LKR');
  if (/\bSAR\b/i.test(str)) currencyMatches.push('SAR');
  if (/\bBDT\b/i.test(str)) currencyMatches.push('BDT');
  if (/\bAED\b/i.test(str)) currencyMatches.push('AED');
  if (/\bEUR\b|€/i.test(str)) currencyMatches.push('EUR');
  if (/\bGBP\b|£/i.test(str)) currencyMatches.push('GBP');
  if (/\bQAR\b/i.test(str)) currencyMatches.push('QAR');

  // If no currency found, or conflicting currencies found, do not guess
  if (currencyMatches.length !== 1) {
    return null;
  }
  currency = currencyMatches[0];

  // 3. Identify basis
  let basis = 'unspecified';
  if (/\bnet\b/i.test(str)) basis = 'net';
  else if (/\bgross\b/i.test(str)) basis = 'gross';
  else if (/\bbasic\b/i.test(str)) basis = 'basic';
  else if (/\btotal\s*package\b/i.test(str)) basis = 'totalPackage';

  // 4. Identify period
  let period = 'monthly';
  if (/\b(per annum|per year|annual|\/yr|\/year)\b/i.test(str)) period = 'annual';
  else if (/\b(per hour|hourly|\/hr)\b/i.test(str)) period = 'hourly';

  // 5. Identify notes (e.g. "+ Veh + Fuel", "+ 250K", "+ Ben", "++")
  let notes = '';
  const notesMatch = str.match(/\+\s*(Veh.*|Fuel.*|Ben.*|\d+\s*K.*|\+.*)/i);
  if (notesMatch) {
    notes = notesMatch[0].trim();
  }

  // 6. Clean amount string to extract numbers and multipliers
  // Remove currency, basis, period, and notes tokens
  let cleaned = str
    .replace(/\b(USD|LKR|SAR|BDT|AED|EUR|GBP|QAR|\$|€|£)\b/gi, '')
    .replace(/\b(Net|Gross|Basic|Total Package)\b/gi, '')
    .replace(/\b(per annum|per year|annual|\/yr|\/year|per hour|hourly|\/hr)\b/gi, '');

  if (notes) {
    cleaned = cleaned.replace(notes, '');
  }

  // Check for range with dash or 'to'
  // Handles:
  // "3000 - 4500", "5,000–7,000", "400K - 500K", "1.5 - 2Mn", "150 - 250K", "400,000 – 500.000"
  // Normalize dashes (hyphen, en-dash, em-dash)
  cleaned = cleaned.replace(/[\u2010-\u2015]/g, '-').trim();

  // Pattern matching for range: (numA [K|MN]) - (numB [K|MN])
  const rangeMatch = cleaned.match(/([\d.,]+)\s*(k|mn|m|million)?\s*(?:-|to)\s*([\d.,]+)\s*(k|mn|m|million)?/i);

  if (rangeMatch) {
    const rawA = rangeMatch[1].replace(/,/g, '');
    const multA = rangeMatch[2]?.toLowerCase();
    const rawB = rangeMatch[3].replace(/,/g, '');
    const multB = rangeMatch[4]?.toLowerCase();

    let numA = parseFloat(rawA);
    let numB = parseFloat(rawB);

    if (isNaN(numA) || isNaN(numB)) return null;

    // Resolve multiplier: if only second has multiplier (e.g. 150 - 250K or 1.5 - 2Mn), apply to first
    const effectiveMultB = (multB === 'mn' || multB === 'm' || multB === 'million') ? 1_000_000 : (multB === 'k' ? 1_000 : 1);
    const effectiveMultA = multA ? ((multA === 'mn' || multA === 'm' || multA === 'million') ? 1_000_000 : (multA === 'k' ? 1_000 : 1)) : effectiveMultB;

    let minAmount = Math.round(numA * effectiveMultA);
    let maxAmount = Math.round(numB * effectiveMultB);

    // If maxAmount looks corrupted (e.g. typo where min > max), do not guess
    if (minAmount > maxAmount) {
      return null;
    }

    return {
      currency,
      salaryType: minAmount === maxAmount ? 'fixed' : 'range',
      minAmount,
      maxAmount,
      period,
      basis,
      notes
    };
  }

  // Pattern matching for single amount: (num [K|MN])
  const singleMatch = cleaned.match(/([\d.,]+)\s*(k|mn|m|million)?/i);
  if (singleMatch) {
    const rawNum = singleMatch[1].replace(/,/g, '');
    const mult = singleMatch[2]?.toLowerCase();
    let num = parseFloat(rawNum);
    if (isNaN(num)) return null;

    const multiplier = (mult === 'mn' || mult === 'm' || mult === 'million') ? 1_000_000 : (mult === 'k' ? 1_000 : 1);
    const amount = Math.round(num * multiplier);

    // If amount is suspiciously small without multiplier and currency is LKR (e.g. "500"), ambiguous
    if (amount < 1000 && !mult && currency === 'LKR') {
      return null;
    }

    return {
      currency,
      salaryType: 'fixed',
      minAmount: amount,
      maxAmount: amount,
      period,
      basis,
      notes
    };
  }

  return null;
}

module.exports = {
  SUPPORTED_CURRENCIES,
  SUPPORTED_SALARY_TYPES,
  SUPPORTED_PERIODS,
  SUPPORTED_BASES,
  formatNumberWithCommas,
  formatSalary,
  validateSalary,
  parseSalaryString
};
