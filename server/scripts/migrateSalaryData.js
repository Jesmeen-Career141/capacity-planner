/**
 * Database Migration Script: Structured Salary Data
 *
 * Requirements:
 * - DRY-RUN MODE ENABLED BY DEFAULT.
 * - Does NOT write to the database unless '--execute' is explicitly provided.
 * - Confidently parses recognizable packageRange strings.
 * - Leaves ambiguous or unrecognizable strings unset (salary: null) and retains original packageRange text.
 * - Does NOT overwrite existing packageRange text.
 *
 * Usage:
 *   Dry run:  node server/scripts/migrateSalaryData.js
 *   Live run: node server/scripts/migrateSalaryData.js --execute
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Position = require('../models/Position');
const { parseSalaryString, formatSalary } = require('../utils/salaryFormatter');

async function runMigration() {
  const isExecute = process.argv.includes('--execute');

  console.log('====================================================');
  console.log(`  Salary Data Migration — ${isExecute ? 'LIVE EXECUTION' : 'DRY RUN (Read-Only)'}`);
  console.log('====================================================\n');

  if (!process.env.MONGO_URI) {
    console.error('ERROR: MONGO_URI is not set in environment or server/.env');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.\n');

    const positions = await Position.find({}).lean();
    console.log(`Total position records retrieved: ${positions.length}\n`);

    let alreadyStructuredCount = 0;
    let proposedCount = 0;
    let skippedCount = 0;

    const proposedList = [];
    const skippedList = [];

    for (const pos of positions) {
      const rawPkg = pos.packageRange ? String(pos.packageRange).trim() : '';

      // Check if already has structured salary
      if (pos.salary && (pos.salary.minAmount != null || pos.salary.maxAmount != null || ['negotiable', 'confidential', 'tbc'].includes(pos.salary.salaryType))) {
        alreadyStructuredCount++;
        continue;
      }

      if (!rawPkg) {
        skippedCount++;
        skippedList.push({
          jobOrderId: pos.jobOrderId,
          position: pos.position,
          packageRange: rawPkg,
          reason: 'Empty / missing packageRange'
        });
        continue;
      }

      const parsed = parseSalaryString(rawPkg);

      if (!parsed) {
        skippedCount++;
        skippedList.push({
          jobOrderId: pos.jobOrderId,
          position: pos.position,
          packageRange: rawPkg,
          reason: 'Ambiguous or unparseable text — preserved unchanged'
        });
        continue;
      }

      proposedCount++;
      const formatted = formatSalary(parsed);
      proposedList.push({
        id: pos._id,
        jobOrderId: pos.jobOrderId,
        position: pos.position,
        original: rawPkg,
        parsed,
        formatted
      });
    }

    console.log(`--- PROPOSED PARSED RECORDS (${proposedList.length}) ---`);
    proposedList.forEach((item, idx) => {
      console.log(`  ${idx + 1}. [${item.jobOrderId}] "${item.original}" => "${item.formatted}" [${item.parsed.salaryType}, ${item.parsed.currency}, ${item.parsed.minAmount || ''}-${item.parsed.maxAmount || ''}${item.parsed.basis !== 'unspecified' ? `, ${item.parsed.basis}` : ''}${item.parsed.notes ? `, notes: ${item.parsed.notes}` : ''}]`);
    });

    console.log(`\n--- SKIPPED / PRESERVED UNCHANGED RECORDS (${skippedList.length}) ---`);
    skippedList.forEach((item, idx) => {
      console.log(`  ${idx + 1}. [${item.jobOrderId}] "${item.packageRange}" => SKIPPED: ${item.reason}`);
    });

    console.log('\n====================================================');
    console.log('  SUMMARY');
    console.log('====================================================');
    console.log(`  Total positions:                ${positions.length}`);
    console.log(`  Already structured:             ${alreadyStructuredCount}`);
    console.log(`  Confident parses proposed:      ${proposedCount}`);
    console.log(`  Skipped / preserved unchanged:  ${skippedCount}`);
    console.log('====================================================\n');

    if (isExecute) {
      console.log('Applying changes to MongoDB...');
      let updatedCount = 0;
      for (const item of proposedList) {
        await Position.updateOne(
          { _id: item.id },
          { $set: { salary: item.parsed } }
        );
        updatedCount++;
      }
      console.log(`SUCCESS: Successfully updated ${updatedCount} records with structured salary data.\n`);
    } else {
      console.log('DRY RUN COMPLETE:');
      console.log('  No changes were written to the database.');
      console.log('  To apply these changes, rerun with: node server/scripts/migrateSalaryData.js --execute\n');
    }

    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
