const FLAG_META = {
  followUp:  { label: 'Follow Up',  color: 'orange' },
  addOn:     { label: 'Add-On',     color: 'yellow' },
  backup:    { label: 'Backup',     color: 'purple' },
  goingGood: { label: 'Going Good', color: 'green' },
  reAssign:  { label: 'Reassign',   color: 'red' } // default, will be overridden by color logic
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

  // backup: status === 'Fence'
  const backupAuto = position.status === 'Fence'
    ? { label: 'Backup', color: 'purple' }
    : null;

  // reAssign: based only on cvCount (internal shortlist)
  let reAssignAuto = null;
  if (position.cvCount !== null && position.cvCount !== undefined) {
    if (position.cvCount < 2) {
      reAssignAuto = { label: 'Reassign', color: 'red' };
    } else if (position.cvCount >= 2 && position.cvCount <= 5) {
      reAssignAuto = { label: 'Reassign', color: 'yellow' };
    }
    // else > 5 => no flag
  }

  // goingGood: based on external shortlist ratio, OR the ext shortlist
  // being marked as "Client Review" (a client actively reviewing the
  // shortlist is treated the same as a strong shortlist ratio).
  let goingGoodAuto = null;
  if (position.extShortlistCount === 'Client Review') {
    goingGoodAuto = { label: 'Going Good', color: 'green' };
  } else if (
    position.extShortlistCount !== null && position.extShortlistCount !== undefined &&
    position.cvCount !== null && position.cvCount !== undefined &&
    position.cvCount > 0 &&
    Number(position.extShortlistCount) >= position.cvCount * 0.5
  ) {
    goingGoodAuto = { label: 'Going Good', color: 'green' };
  }

  // followUp and addOn are manual only – no auto rules

  return {
    followUp:  resolve('followUp', null),   // manual only
    addOn:     resolve('addOn', null),      // manual only
    backup:    resolve('backup', backupAuto),
    goingGood: resolve('goingGood', goingGoodAuto),
    reAssign:  resolve('reAssign', reAssignAuto)
  };
}

module.exports = { computeFlags };