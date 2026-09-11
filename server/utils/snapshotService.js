const cron = require('node-cron');
const mongoose = require('mongoose');
const ArchiveSnapshot = require('../models/ArchiveSnapshot');
const Position = require('../models/Position');
const PositionHistory = require('../models/PositionHistory');
const TA = require('../models/TA');
const Client = require('../models/Client');
const SnapshotLog = require('../models/SnapshotLog');
const liveEvents = require('./liveEvents');

// ---- Helper Date Functions (UTC based) ----
function getMondayOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getSundayOfWeek(date = new Date()) {
  const monday = getMondayOfWeek(date);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  return sunday;
}

/**
 * Capture current live positions as a snapshot for a given week (defaults to current week)
 */
async function captureCurrentSnapshot(triggerType = 'manual', customWeekStart = null, customWeekEnd = null) {
  const now = new Date();
  const weekStart = customWeekStart ? new Date(customWeekStart) : getMondayOfWeek(now);
  const weekEnd = customWeekEnd ? new Date(customWeekEnd) : getSundayOfWeek(now);

  console.log(`[SNAPSHOT JOB] [${triggerType.toUpperCase()}] Starting snapshot capture for week ${weekStart.toISOString().split('T')[0]} - ${weekEnd.toISOString().split('T')[0]}`);

  try {
    const positions = await Position.find()
      .populate('client', 'clientName')
      .populate('assignee', 'name')
      .lean();

    const snapshotItems = positions.map(p => ({
      positionId: p._id,
      taName: p.assignee ? p.assignee.name : 'Unassigned',
      position: p.position,
      clientName: p.client ? p.client.clientName : 'Unknown',
      pLevel: p.pLevel,
      status: p.status,
      thisWeekFocus: p.thisWeekFocus || ''
    }));

    // Find if a snapshot already exists for this weekStart
    let snapshotDoc = await ArchiveSnapshot.findOne({
      weekStart: {
        $gte: new Date(weekStart.getTime() - 12 * 60 * 60 * 1000),
        $lte: new Date(weekStart.getTime() + 12 * 60 * 60 * 1000)
      }
    });

    if (snapshotDoc) {
      snapshotDoc.weekStart = weekStart;
      snapshotDoc.weekEnd = weekEnd;
      snapshotDoc.snapshot = snapshotItems;
      snapshotDoc.positionCount = snapshotItems.length;
      await snapshotDoc.save();
      console.log(`[SNAPSHOT JOB] Updated existing snapshot (${snapshotDoc._id}) with ${snapshotItems.length} positions`);
    } else {
      snapshotDoc = await ArchiveSnapshot.create({
        weekStart,
        weekEnd,
        positionCount: snapshotItems.length,
        snapshot: snapshotItems
      });
      console.log(`[SNAPSHOT JOB] Created new snapshot (${snapshotDoc._id}) with ${snapshotItems.length} positions`);
    }

    // Log success
    const logDoc = await SnapshotLog.create({
      triggerType,
      status: 'SUCCESS',
      weekStart,
      weekEnd,
      snapshotId: snapshotDoc._id,
      positionsCount: snapshotItems.length,
      message: `Snapshot captured successfully with ${snapshotItems.length} positions for week ${weekStart.toISOString().split('T')[0]} - ${weekEnd.toISOString().split('T')[0]}`
    });

    try {
      liveEvents.emit('archive:changed');
    } catch {
      // ignore
    }

    return { success: true, snapshot: snapshotDoc, log: logDoc };
  } catch (err) {
    console.error(`[SNAPSHOT JOB] ERROR during snapshot capture:`, err);
    await SnapshotLog.create({
      triggerType,
      status: 'FAILED',
      weekStart,
      weekEnd,
      error: err.message,
      message: `Snapshot capture failed: ${err.message}`
    });
    throw err;
  }
}

/**
 * Reconstruct a historical snapshot at the end of a given past week
 */
async function reconstructHistoricalSnapshot(weekStart, weekEnd) {
  const targetDate = new Date(weekEnd);
  console.log(`[SNAPSHOT BACKFILL] Reconstructing historical state for ${weekStart.toISOString().split('T')[0]} - ${weekEnd.toISOString().split('T')[0]}`);

  try {
    const allPositions = await Position.find({ createdAt: { $lte: targetDate } })
      .populate('client', 'clientName')
      .populate('assignee', 'name')
      .lean();

    const reconstructed = [];
    for (const pos of allPositions) {
      const changesAfter = await PositionHistory.find({
        position: pos._id,
        changedAt: { $gt: targetDate }
      }).sort({ changedAt: 1 }).lean();

      const fieldRollbacks = {};
      for (const change of changesAfter) {
        if (!(change.field in fieldRollbacks)) {
          fieldRollbacks[change.field] = change.oldValue;
        }
      }

      let status = fieldRollbacks['status'] !== undefined ? fieldRollbacks['status'] : pos.status;
      let pLevel = fieldRollbacks['pLevel'] !== undefined ? fieldRollbacks['pLevel'] : pos.pLevel;
      let positionName = fieldRollbacks['position'] !== undefined ? fieldRollbacks['position'] : pos.position;
      
      let taName = pos.assignee ? pos.assignee.name : 'Unassigned';
      if (fieldRollbacks['assignee'] !== undefined) {
        if (mongoose.Types.ObjectId.isValid(fieldRollbacks['assignee'])) {
          const taDoc = await TA.findById(fieldRollbacks['assignee']).lean();
          taName = taDoc ? taDoc.name : (fieldRollbacks['assignee'] || 'Unassigned');
        } else {
          taName = fieldRollbacks['assignee'] || 'Unassigned';
        }
      }

      let clientName = pos.client ? pos.client.clientName : 'Unknown';
      if (fieldRollbacks['client'] !== undefined) {
        if (mongoose.Types.ObjectId.isValid(fieldRollbacks['client'])) {
          const clientDoc = await Client.findById(fieldRollbacks['client']).lean();
          clientName = clientDoc ? clientDoc.clientName : (fieldRollbacks['client'] || 'Unknown');
        } else {
          clientName = fieldRollbacks['client'] || 'Unknown';
        }
      }

      reconstructed.push({
        positionId: pos._id,
        taName,
        position: positionName,
        clientName,
        pLevel,
        status,
        thisWeekFocus: pos.thisWeekFocus || ''
      });
    }

    const newSnapshot = await ArchiveSnapshot.create({
      weekStart,
      weekEnd,
      positionCount: reconstructed.length,
      snapshot: reconstructed
    });

    await SnapshotLog.create({
      triggerType: 'backfill',
      status: 'SUCCESS',
      weekStart,
      weekEnd,
      snapshotId: newSnapshot._id,
      positionsCount: reconstructed.length,
      message: `Backfilled historical snapshot with ${reconstructed.length} positions for week ${weekStart.toISOString().split('T')[0]}`
    });

    console.log(`[SNAPSHOT BACKFILL] Successfully backfilled week ${weekStart.toISOString().split('T')[0]} (${newSnapshot._id}, ${reconstructed.length} positions)`);
    return newSnapshot;
  } catch (err) {
    console.error(`[SNAPSHOT BACKFILL] Error backfilling week ${weekStart.toISOString().split('T')[0]}:`, err);
    await SnapshotLog.create({
      triggerType: 'backfill',
      status: 'FAILED',
      weekStart,
      weekEnd,
      error: err.message,
      message: `Backfill failed for week ${weekStart.toISOString().split('T')[0]}: ${err.message}`
    });
    throw err;
  }
}

/**
 * Backfill all missing weeks between startDate and current week
 */
async function backfillMissingSnapshots(startDate = new Date('2026-07-06T00:00:00.000Z')) {
  console.log(`[SNAPSHOT BACKFILL] Checking for missing snapshots starting from ${startDate.toISOString().split('T')[0]}...`);
  
  const currentWeekStart = getMondayOfWeek(new Date());
  let cursor = getMondayOfWeek(startDate);
  const createdSnapshots = [];

  while (cursor < currentWeekStart) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    const existing = await ArchiveSnapshot.findOne({
      weekStart: {
        $gte: new Date(weekStart.getTime() - 12 * 60 * 60 * 1000),
        $lte: new Date(weekStart.getTime() + 12 * 60 * 60 * 1000)
      }
    });

    if (!existing) {
      console.log(`[SNAPSHOT BACKFILL] Missing snapshot detected for week ${weekStart.toISOString().split('T')[0]}. Reconstructing...`);
      const snap = await reconstructHistoricalSnapshot(weekStart, weekEnd);
      createdSnapshots.push(snap);
    } else {
      // Ensure positionCount is populated if missing
      if (!existing.positionCount && existing.snapshot) {
        existing.positionCount = existing.snapshot.length;
        await existing.save();
      }
      console.log(`[SNAPSHOT BACKFILL] Week ${weekStart.toISOString().split('T')[0]} already has a snapshot (${existing._id})`);
    }

    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  console.log(`[SNAPSHOT BACKFILL] Backfill check completed. Created ${createdSnapshots.length} missing snapshots.`);
  return createdSnapshots;
}

/**
 * Check and capture snapshot on schedule / startup
 */
async function checkAndCaptureWeeklySnapshot(triggerType = 'cron') {
  try {
    const now = new Date();
    const currentMonday = getMondayOfWeek(now);
    const currentSunday = getSundayOfWeek(now);

    // Check if current week already has a snapshot
    const existing = await ArchiveSnapshot.findOne({
      weekStart: {
        $gte: new Date(currentMonday.getTime() - 12 * 60 * 60 * 1000),
        $lte: new Date(currentMonday.getTime() + 12 * 60 * 60 * 1000)
      }
    });

    if (!existing) {
      console.log(`[SNAPSHOT SCHEDULER] No snapshot found for current week (${currentMonday.toISOString().split('T')[0]}). Capturing now...`);
      await captureCurrentSnapshot(triggerType, currentMonday, currentSunday);
    } else {
      console.log(`[SNAPSHOT SCHEDULER] Snapshot for current week (${currentMonday.toISOString().split('T')[0]}) already exists.`);
    }
  } catch (err) {
    console.error(`[SNAPSHOT SCHEDULER] Error in checkAndCaptureWeeklySnapshot:`, err);
  }
}

/**
 * Initialize cron jobs and startup check
 */
function initSnapshotScheduler() {
  console.log('[SNAPSHOT SCHEDULER] Initializing Weekly Snapshot Scheduler...');

  // 1. Cron Job: Run every Sunday at 23:59:00 UTC (end of the week snapshot)
  cron.schedule('59 23 * * 0', async () => {
    console.log('[SNAPSHOT SCHEDULER] Cron triggered at Sunday 23:59 UTC');
    await checkAndCaptureWeeklySnapshot('cron');
  }, { timezone: 'UTC' });

  // 2. Cron Job: Run every Monday at 00:01:00 UTC (start of new week check)
  cron.schedule('1 0 * * 1', async () => {
    console.log('[SNAPSHOT SCHEDULER] Cron triggered at Monday 00:01 UTC');
    await checkAndCaptureWeeklySnapshot('cron');
  }, { timezone: 'UTC' });

  // 3. Hourly catch-up monitor to ensure no weeks are missed due to server restarts/downtime
  cron.schedule('0 * * * *', async () => {
    console.log('[SNAPSHOT SCHEDULER] Hourly catchup check running...');
    await checkAndCaptureWeeklySnapshot('cron');
  }, { timezone: 'UTC' });

  // 4. Run on startup after short delay to let DB connection establish
  setTimeout(async () => {
    try {
      console.log('[SNAPSHOT SCHEDULER] Running startup snapshot verification and backfill...');
      await backfillMissingSnapshots();
      await checkAndCaptureWeeklySnapshot('startup_check');
      console.log('[SNAPSHOT SCHEDULER] Startup snapshot check finished successfully.');
    } catch (err) {
      console.error('[SNAPSHOT SCHEDULER] Startup check error:', err);
    }
  }, 3000);

  console.log('[SNAPSHOT SCHEDULER] Scheduler initialized: Sunday 23:59 UTC, Monday 00:01 UTC, hourly monitor, and startup check active.');
}

module.exports = {
  getMondayOfWeek,
  getSundayOfWeek,
  captureCurrentSnapshot,
  reconstructHistoricalSnapshot,
  backfillMissingSnapshots,
  checkAndCaptureWeeklySnapshot,
  initSnapshotScheduler
};
