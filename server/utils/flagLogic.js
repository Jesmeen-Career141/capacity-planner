function computeFlags(position) {
  const flags = {
    followUp: null,
    addOn: null,
    backup: null,
    goingGood: null,
    reAssign: null
  };

  // Follow_Up_Flag: 100% complete AND 3+ days since assigned
  if (position.completionPercent === 100 && position.dateAssigned) {
    const daysSinceAssigned = Math.floor(
      (Date.now() - new Date(position.dateAssigned).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceAssigned >= 3) {
      flags.followUp = { label: 'Follow Up', color: 'orange' };
    }
  }

  // Add_On_Flag: LS_Count not blank AND < 20
  if (position.lsCount !== null && position.lsCount !== undefined && position.lsCount < 20) {
    flags.addOn = { label: 'Add-On', color: 'yellow' };
  }

  // Backup_Flag: Status = Fence
  if (position.status === 'Fence') {
    flags.backup = { label: 'Backup', color: 'purple' };
  }

  // Going_Good_Flag: CV_Count > 5
  if (position.cvCount !== null && position.cvCount !== undefined && position.cvCount > 5) {
    flags.goingGood = { label: 'Going Good', color: 'green' };
  }

  // ReAssign_Flag: tiered by CV_Count
  if (position.cvCount !== null && position.cvCount !== undefined) {
    if (position.cvCount >= 0 && position.cvCount <= 2) {
      flags.reAssign = { label: 'Reassign', color: 'red' };
    } else if (position.cvCount >= 3 && position.cvCount <= 5) {
      flags.reAssign = { label: 'Watch', color: 'yellow' };
    } else if (position.cvCount > 5) {
      flags.reAssign = { label: 'Healthy', color: 'green' };
    }
  }

  return flags;
}

module.exports = { computeFlags };
