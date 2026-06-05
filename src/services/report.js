const { store, createDailyReport } = require('../models/store');
const { takeFullDailySnapshot } = require('./snapshot');

function generateDailyReport(dateStr) {
  const totalDesks = store.desks.length;
  if (totalDesks === 0) {
    return { error: 'No desks configured', date: dateStr };
  }

  const dayStart = dateStr + 'T00:00:00.000Z';
  const dayEnd = dateStr + 'T23:59:59.999Z';

  const overlapsDay = (o) => {
    const end = o.end_time || '9999-12-31T23:59:59.999Z';
    return o.start_time <= dayEnd && end >= dayStart;
  };

  const unreleasedAtDayEnd = (o) => {
    return o.start_time <= dayEnd && (!o.end_time || o.end_time > dayEnd);
  };

  const maintenanceDeskIds = new Set(
    store.desks
      .filter((d) =>
        store.maintenancePlans.some(
          (p) =>
            p.desk_id === d.id &&
            p.status !== 'cancelled' &&
            p.status !== 'completed' &&
            dateStr >= p.start_date &&
            dateStr <= p.end_date
        )
      )
      .map((d) => d.id)
  );

  const maintenanceDesks = maintenanceDeskIds.size;
  const availableDesks = totalDesks - maintenanceDesks;

  const scheduledDeskIds = new Set(
    store.scheduleAssignments
      .filter((a) => a.date === dateStr && a.status === 'active')
      .map((a) => a.desk_id)
  );

  const tempOccDeskIds = new Set(
    store.temporaryOccupations
      .filter(overlapsDay)
      .map((o) => o.desk_id)
  );

  const occupiedDeskIds = new Set([...scheduledDeskIds, ...tempOccDeskIds]);
  const occupiedDesks = occupiedDeskIds.size;
  const actualOccupancyRate = availableDesks > 0
    ? parseFloat(((occupiedDesks / availableDesks) * 100).toFixed(2))
    : 0;

  const tempOccCount = store.temporaryOccupations.filter((o) => {
    return o.start_time >= dayStart && o.start_time <= dayEnd;
  }).length;

  const unreleasedRecords = store.temporaryOccupations.filter(unreleasedAtDayEnd);

  const departmentBreakdown = {};
  for (const desk of store.desks) {
    const deptId = desk.department_id || 'unassigned';
    if (!departmentBreakdown[deptId]) {
      departmentBreakdown[deptId] = { total: 0, maintenance: 0, available: 0, occupied: 0 };
    }
    departmentBreakdown[deptId].total += 1;
    if (maintenanceDeskIds.has(desk.id)) {
      departmentBreakdown[deptId].maintenance += 1;
    } else {
      departmentBreakdown[deptId].available += 1;
    }
    if (occupiedDeskIds.has(desk.id)) {
      departmentBreakdown[deptId].occupied += 1;
    }
  }

  const maintenancePlans = store.maintenancePlans.filter(
    (p) =>
      p.status !== 'cancelled' &&
      p.status !== 'completed' &&
      dateStr >= p.start_date &&
      dateStr <= p.end_date
  );

  const report = createDailyReport({
    date: dateStr,
    occupancy_rate: actualOccupancyRate,
    temp_occupation_count: tempOccCount,
    unreleased_count: unreleasedRecords.length,
    details: {
      total_desks: totalDesks,
      maintenance_desks: maintenanceDesks,
      available_desks: availableDesks,
      occupied_desks: occupiedDesks,
      scheduled_desks: scheduledDeskIds.size,
      temp_occupied_desks: tempOccDeskIds.size,
      department_breakdown: departmentBreakdown,
      maintenance_plans: maintenancePlans.map((p) => ({
        id: p.id,
        desk_id: p.desk_id,
        start_date: p.start_date,
        end_date: p.end_date,
        reason: p.reason,
        status: p.status,
      })),
      unreleased_records: unreleasedRecords.map((o) => ({
        id: o.id,
        desk_id: o.desk_id,
        user_id: o.user_id,
        start_time: o.start_time,
      })),
    },
  });

  takeFullDailySnapshot(dateStr);

  return report;
}

module.exports = { generateDailyReport };
