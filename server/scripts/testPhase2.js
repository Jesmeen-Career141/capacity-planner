const assert = require('assert');
const { formatSalary, validateSalary, parseSalaryString } = require('../utils/salaryFormatter');
const mongoose = require('mongoose');
const Position = require('../models/Position');

console.log('--- Running Phase 2 Tests ---\n');

// 1. Validation Tests
console.log('1. Testing validateSalary...');

const valid1 = validateSalary({
  currency: 'USD',
  salaryType: 'range',
  minAmount: 5500,
  maxAmount: 6500,
  period: 'monthly',
  basis: 'unspecified'
});
assert.strictEqual(valid1.valid, true);

const invalidCurrency = validateSalary({
  currency: 'XYZ',
  salaryType: 'range'
});
assert.strictEqual(invalidCurrency.valid, false);
assert.ok(invalidCurrency.errors[0].includes('Invalid currency'));

const invalidOrder = validateSalary({
  currency: 'USD',
  salaryType: 'range',
  minAmount: 7000,
  maxAmount: 5000
});
assert.strictEqual(invalidOrder.valid, false);
assert.ok(invalidOrder.errors[0].includes('cannot exceed maxAmount'));

const negativeAmount = validateSalary({
  currency: 'USD',
  salaryType: 'fixed',
  minAmount: -100
});
assert.strictEqual(negativeAmount.valid, false);
assert.ok(negativeAmount.errors[0].includes('non-negative'));

console.log('✓ validateSalary passed all validation checks.\n');

// 2. Format Tests
console.log('2. Testing formatSalary against prompt requirements...');

assert.strictEqual(
  formatSalary({ currency: 'USD', salaryType: 'range', minAmount: 5500, maxAmount: 6500 }),
  'USD 5,500 – 6,500'
);

assert.strictEqual(
  formatSalary({ currency: 'SAR', salaryType: 'range', minAmount: 8000, maxAmount: 9000 }),
  'SAR 8,000 – 9,000'
);

assert.strictEqual(
  formatSalary({ currency: 'LKR', salaryType: 'range', minAmount: 400000, maxAmount: 500000 }),
  'LKR 400,000 – 500,000'
);

assert.strictEqual(
  formatSalary({ currency: 'BDT', salaryType: 'range', minAmount: 80000, maxAmount: 100000 }),
  'BDT 80,000 – 100,000'
);

assert.strictEqual(
  formatSalary({ currency: 'USD', salaryType: 'fixed', minAmount: 6500 }),
  'USD 6,500'
);

assert.strictEqual(
  formatSalary({ currency: 'USD', salaryType: 'range', minAmount: 4000, maxAmount: 4500, basis: 'net' }),
  'USD 4,000 – 4,500 net'
);

assert.strictEqual(
  formatSalary({ salaryType: 'negotiable' }),
  'Negotiable'
);

assert.strictEqual(
  formatSalary({ salaryType: 'confidential' }),
  'Confidential'
);

assert.strictEqual(
  formatSalary({ salaryType: 'tbc' }),
  'TBC'
);

// Fallback test
assert.strictEqual(
  formatSalary(null, 'LKR 400K - 500K'),
  'LKR 400K - 500K'
);

// Notes test
assert.strictEqual(
  formatSalary({ currency: 'LKR', salaryType: 'range', minAmount: 500000, maxAmount: 750000, notes: '+ Veh + Fuel' }),
  'LKR 500,000 – 750,000 + Veh + Fuel'
);

console.log('✓ formatSalary passed all 9 required display formats.\n');

// 3. Parser Tests
console.log('3. Testing parseSalaryString...');

// Confident parses
const p1 = parseSalaryString('USD 3000 - 4500');
assert.strictEqual(p1.currency, 'USD');
assert.strictEqual(p1.minAmount, 3000);
assert.strictEqual(p1.maxAmount, 4500);

const p2 = parseSalaryString('LKR 400K - 500K');
assert.strictEqual(p2.currency, 'LKR');
assert.strictEqual(p2.minAmount, 400000);
assert.strictEqual(p2.maxAmount, 500000);

const p3 = parseSalaryString('USD 3500 - 4000 Net');
assert.strictEqual(p3.basis, 'net');

const p4 = parseSalaryString('LKR 800K - 900K BASIC + 250K');
assert.strictEqual(p4.basis, 'basic');
assert.strictEqual(p4.notes, '+ 250K');

// Ambiguous / must return null
assert.strictEqual(parseSalaryString('Open To Discuss'), null);
assert.strictEqual(parseSalaryString('500'), null);
assert.strictEqual(parseSalaryString('CTC 25 PER ANNUM'), null);
assert.strictEqual(parseSalaryString('Rs 150K - 250K'), null);
assert.strictEqual(parseSalaryString('LKR'), null);

console.log('✓ parseSalaryString accurately parses confident patterns and preserves ambiguous strings as null.\n');

// 4. Mongoose Schema Validation
console.log('4. Testing Mongoose Position schema validation...');
const dummyDoc1 = new Position({
  jobOrderId: 'TEST-001',
  client: new mongoose.Types.ObjectId(),
  position: 'Software Engineer',
  pLevel: 'P1',
  salary: {
    currency: 'USD',
    salaryType: 'range',
    minAmount: 10000,
    maxAmount: 5000
  }
});

dummyDoc1.validate().then(() => {
  assert.fail('Should have failed minAmount > maxAmount validation');
}).catch(err => {
  assert.ok(err.message.includes('Minimum salary amount cannot exceed maximum salary amount'));
  console.log('✓ Position schema minAmount > maxAmount validation enforced correctly.');

  // Default salary is null
  const dummyDoc2 = new Position({
    jobOrderId: 'TEST-002',
    client: new mongoose.Types.ObjectId(),
    position: 'Product Manager',
    pLevel: 'P2'
  });
  assert.strictEqual(dummyDoc2.salary, null);
  console.log('✓ Position schema salary defaults to null when not supplied.');
  console.log('\nALL PHASE 2 UNIT TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
});
