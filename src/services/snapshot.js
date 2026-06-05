const { store, createSnapshot } = require('../models/store');

function takeSnapshot(dateStr, type) {
  let data;
  switch (type) {
    case 'schedule':
      data = {
        scheduleRules: store.scheduleRules.filter((r) => {
          if (r.effective_date && r.effective_date > dateStr) return false;
          if (r.expired_date && r.expired_date < dateStr) return false;
          return true;
        }),
        scheduleAssignments: store.scheduleAssignments.filter((a) => a.date === dateStr),
      };
      break;
    case 'desk':
      data = {
        desks: JSON.parse(JSON.stringify(store.desks)),
      };
      break;
    case 'occupation':
      data = {
        temporaryOccupations: store.temporaryOccupations.filter((o) => {
          const start = o.start_time.substring(0, 10);
          return start <= dateStr && (o.status === 'active' || (o.end_time && o.end_time.substring(0, 10) >= dateStr));
        }),
      };
      break;
    default:
      data = {
        scheduleRules: store.scheduleRules.filter((r) => {
          if (r.effective_date && r.effective_date > dateStr) return false;
          if (r.expired_date && r.expired_date < dateStr) return false;
          return true;
        }),
        scheduleAssignments: store.scheduleAssignments.filter((a) => a.date === dateStr),
        desks: JSON.parse(JSON.stringify(store.desks)),
        temporaryOccupations: store.temporaryOccupations.filter((o) => {
          const start = o.start_time.substring(0, 10);
          return start <= dateStr && (o.status === 'active' || (o.end_time && o.end_time.substring(0, 10) >= dateStr));
        }),
      };
  }
  return createSnapshot({ date: dateStr, type, data });
}

function takeFullDailySnapshot(dateStr) {
  takeSnapshot(dateStr, 'full');
}

function getSnapshot(dateStr, type) {
  const snapshots = store.snapshots.filter(
    (s) => s.date === dateStr && (type ? s.type === type : true)
  );
  return snapshots.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}

function buildCurrentState(dateStr) {
  const activeScheduleRules = store.scheduleRules.filter((r) => {
    if (r.effective_date && r.effective_date > dateStr) return false;
    if (r.expired_date && r.expired_date < dateStr) return false;
    return true;
  });

  const scheduleAssignments = store.scheduleAssignments.filter((a) => a.date === dateStr);

  const temporaryOccupations = store.temporaryOccupations.filter((o) => {
    const start = o.start_time.substring(0, 10);
    return start <= dateStr && (o.status === 'active' || (o.end_time && o.end_time.substring(0, 10) >= dateStr));
  });

  return {
    scheduleRules: activeScheduleRules,
    scheduleAssignments,
    desks: JSON.parse(JSON.stringify(store.desks)),
    temporaryOccupations,
  };
}

function compareSnapshotWithCurrent(dateStr) {
  const snapshot = getSnapshot(dateStr, 'full');
  if (!snapshot) {
    return { error: 'No snapshot found for the given date', date: dateStr };
  }

  const current = buildCurrentState(dateStr);
  const historical = snapshot.data;

  const diff = {
    date: dateStr,
    snapshot_taken_at: snapshot.created_at,
    schedule_rules: {
      added: current.scheduleRules.filter((cr) => !historical.scheduleRules.find((hr) => hr.id === cr.id)),
      removed: historical.scheduleRules.filter((hr) => !current.scheduleRules.find((cr) => cr.id === hr.id)),
      modified: [],
    },
    schedule_assignments: {
      added: current.scheduleAssignments.filter((ca) => !historical.scheduleAssignments.find((ha) => ha.id === ca.id)),
      removed: historical.scheduleAssignments.filter((ha) => !current.scheduleAssignments.find((ca) => ca.id === ha.id)),
      modified: [],
    },
    desks: {
      added: current.desks.filter((cd) => !historical.desks.find((hd) => hd.id === cd.id)),
      removed: historical.desks.filter((hd) => !current.desks.find((cd) => cd.id === hd.id)),
      modified: [],
    },
    temporary_occupations: {
      added: current.temporaryOccupations.filter((co) => !historical.temporaryOccupations.find((ho) => ho.id === co.id)),
      removed: historical.temporaryOccupations.filter((ho) => !current.temporaryOccupations.find((co) => co.id === ho.id)),
      modified: [],
    },
  };

  const trackModifications = (currentList, historicalList, field) => {
    for (const cItem of currentList) {
      const hItem = historicalList.find((h) => h.id === cItem.id);
      if (hItem && JSON.stringify(cItem) !== JSON.stringify(hItem)) {
        const changes = {};
        for (const key of Object.keys(cItem)) {
          if (JSON.stringify(cItem[key]) !== JSON.stringify(hItem[key])) {
            changes[key] = { from: hItem[key], to: cItem[key] };
          }
        }
        diff[field].modified.push({ id: cItem.id, changes });
      }
    }
  };

  trackModifications(current.scheduleRules, historical.scheduleRules, 'schedule_rules');
  trackModifications(current.scheduleAssignments, historical.scheduleAssignments, 'schedule_assignments');
  trackModifications(current.desks, historical.desks, 'desks');
  trackModifications(current.temporaryOccupations, historical.temporaryOccupations, 'temporary_occupations');

  return diff;
}

module.exports = { takeSnapshot, takeFullDailySnapshot, getSnapshot, buildCurrentState, compareSnapshotWithCurrent };
