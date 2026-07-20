const FLAG_META = {
  followUp:  { label: 'Follow Up',  color: 'orange' },
  addOn:     { label: 'Add-On',     color: 'yellow' },
  backup:    { label: 'Backup',     color: 'purple' },
  goingGood: { label: 'Going Good', color: 'green' },
  reAssign:  { label: 'Reassign',   color: 'red' }
};

function computeFlags(position) {
  // Convert flagOverrides from Map to plain object if needed
  let overrides = position.flagOverrides || {};
  if (overrides instanceof Map) {
    overrides = Object.fromEntries(overrides);
  }

  const resolve = (key, autoResult) => {
    const mode = overrides[key] || 'auto';
    if (mode === 'off') return null;
    if (mode === 'on') {
      return autoResult
        ? { ...autoResult, manual: true }
        : { ...FLAG_META[key], manual: true };
    }
    // mode === 'auto'
    return autoResult ? { ...autoResult, manual: false } : null;
  };

  // ---- Auto rules ----

  // Follow Up: 3+ days since 100% assignment with no movement.
  let followUpAuto = null;
  if (position.completionPercent === 100 && position.dateAssigned) {
    const daysSinceAssigned = Math.floor(
      (Date.now() - new Date(position.dateAssigned).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceAssigned >= 3) {
      followUpAuto = { label: 'Follow Up', color: 'orange' };
    }
  }

  // Add-On: LS count below the minimum needed for a healthy pipeline.
  let addOnAuto = null;
  if (position.lsCount !== null && position.lsCount !== undefined && position.lsCount < 20) {
    addOnAuto = { label: 'Add-On', color: 'yellow' };
  }

  // Backup: position status is Fence.
  const backupAuto = position.status === 'Fence'
    ? { label: 'Backup', color: 'purple' }
    : null;

  // Going Good: strong interview traction -- 5+ interviewed AND 3+ in second round.
  let goingGoodAuto = null;
  if (
    position.interviewedCount !== null && position.interviewedCount !== undefined &&
    position.secondInterviewCount !== null && position.secondInterviewCount !== undefined &&
    position.interviewedCount >= 5 && position.secondInterviewCount >= 3
  ) {
    goingGoodAuto = { label: 'Going Good', color: 'green' };
  }

  // Re-assign / Watch / Healthy: judged against this position's own target CV
  // count (targetCvCount), not a one-size-fits-all number -- a CEO role and
  // an HR Executive role shouldn't need the same number of CVs to look healthy.
  // Falls back to a target of 5 if the position doesn't have one set.
  let reAssignAuto = null;
  if (position.cvCount !== null && position.cvCount !== undefined) {
    const target = position.targetCvCount || 5;
    const redCutoff = Math.floor(0.4 * target);
    if (position.cvCount <= redCutoff) {
      reAssignAuto = { label: 'Reassign', color: 'red' };
    } else if (position.cvCount <= target) {
      reAssignAuto = { label: 'Watch', color: 'yellow' };
    } else {
      reAssignAuto = { label: 'Healthy', color: 'green' };
    }
  }

  return {
    followUp:  resolve('followUp', followUpAuto),
    addOn:     resolve('addOn', addOnAuto),
    backup:    resolve('backup', backupAuto),
    goingGood: resolve('goingGood', goingGoodAuto),
    reAssign:  resolve('reAssign', reAssignAuto)
  };
}

module.exports = { computeFlags };