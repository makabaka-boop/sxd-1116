const { store, createSnapshot } = require('../models/store');

function getMaintenancePlansForDate(dateStr) {
  return store.maintenancePlans.filter(
    (p) =>
      p.status !== 'cancelled' &&
      dateStr >= p.start_date &&
      dateStr <= p.end_date
  );
}

function buildHistoricalState(dateStr) {
  const activeScheduleRules = store.scheduleRules.filter((r) => {
    if (r.effective_date && r.effective_date > dateStr) return false;
    if (r.expired_date && r.expired_date < dateStr) return false;
    return true;
  });

  const scheduleAssignments = store.scheduleAssignments.filter(
    (a) => a.date === dateStr && a.status === 'active'
  );

  const temporaryOccupations = store.temporaryOccupations.filter((o) => {
    const startDate = o.start_time.substring(0, 10);
    if (startDate > dateStr) return false;
    if (o.status === 'active') return true;
    if (o.end_time) {
      const endDate = o.end_time.substring(0, 10);
      return endDate >= dateStr;
    }
    return false;
  });

  const maintenancePlans = getMaintenancePlansForDate(dateStr);
  const maintenanceDeskIds = new Set(maintenancePlans.map((p) => p.desk_id));

  const occupiedDeskIds = new Set([
    ...scheduleAssignments.map((a) => a.desk_id),
    ...temporaryOccupations.map((o) => o.desk_id),
  ]);

  const desks = store.desks.map((d) => ({
    ...d,
    status: maintenanceDeskIds.has(d.id) ? 'maintenance' : (occupiedDeskIds.has(d.id) ? 'occupied' : 'available'),
  }));

  return {
    scheduleRules: activeScheduleRules,
    scheduleAssignments,
    desks,
    temporaryOccupations,
    maintenancePlans,
  };
}

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
    case 'desk': {
      const state = buildHistoricalState(dateStr);
      data = { desks: state.desks, maintenancePlans: state.maintenancePlans };
      break;
    }
    case 'occupation': {
      const state = buildHistoricalState(dateStr);
      data = { temporaryOccupations: state.temporaryOccupations };
      break;
    }
    case 'maintenance': {
      data = { maintenancePlans: getMaintenancePlansForDate(dateStr) };
      break;
    }
    default: {
      const state = buildHistoricalState(dateStr);
      data = {
        scheduleRules: state.scheduleRules,
        scheduleAssignments: state.scheduleAssignments,
        desks: state.desks,
        temporaryOccupations: state.temporaryOccupations,
        maintenancePlans: state.maintenancePlans,
      };
    }
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

function getHistoricalState(dateStr) {
  const snapshot = getSnapshot(dateStr, 'full');
  if (snapshot) {
    const snapshotData = snapshot.data;
    if (!snapshotData.maintenancePlans) {
      snapshotData.maintenancePlans = getMaintenancePlansForDate(dateStr);
    }
    return { source: 'snapshot', snapshot_taken_at: snapshot.created_at, data: snapshotData };
  }
  const rebuilt = buildHistoricalState(dateStr);
  return { source: 'rebuilt', snapshot_taken_at: null, data: rebuilt };
}

function buildCurrentState(dateStr) {
  return buildHistoricalState(dateStr);
}

function compareSnapshotWithCurrent(dateStr) {
  const historicalResult = getHistoricalState(dateStr);
  const historical = historicalResult.data;
  const current = buildCurrentState(dateStr);

  const historicalMaintenancePlans = historical.maintenancePlans || [];
  const currentMaintenancePlans = current.maintenancePlans || [];

  const diff = {
    date: dateStr,
    snapshot_taken_at: historicalResult.snapshot_taken_at,
    historical_source: historicalResult.source,
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
      removed: historical.desks.filter((hd) => !historical.desks.find((cd) => cd.id === hd.id)),
      modified: [],
    },
    temporary_occupations: {
      added: current.temporaryOccupations.filter((co) => !historical.temporaryOccupations.find((ho) => ho.id === co.id)),
      removed: historical.temporaryOccupations.filter((ho) => !historical.temporaryOccupations.find((co) => co.id === ho.id)),
      modified: [],
    },
    maintenance_plans: {
      added: currentMaintenancePlans.filter((cm) => !historicalMaintenancePlans.find((hm) => hm.id === cm.id)),
      removed: historicalMaintenancePlans.filter((hm) => !currentMaintenancePlans.find((cm) => cm.id === hm.id)),
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
  trackModifications(currentMaintenancePlans, historicalMaintenancePlans, 'maintenance_plans');

  return diff;
}

module.exports = { takeSnapshot, takeFullDailySnapshot, getSnapshot, getHistoricalState, buildCurrentState, compareSnapshotWithCurrent };
