const { store, createDailyReport } = require('../models/store');
const { takeFullDailySnapshot } = require('./snapshot');

function generateDailyReport(dateStr) {
  const totalDesks = store.desks.length;
  if (totalDesks === 0) {
    return { error: 'No desks configured', date: dateStr };
  }

  const occupiedDesks = store.desks.filter((d) => d.status === 'occupied').length;
  const occupancyRate = parseFloat(((occupiedDesks / totalDesks) * 100).toFixed(2));

  const dayStart = dateStr + 'T00:00:00.000Z';
  const dayEnd = dateStr + 'T23:59:59.999Z';

  const tempOccCount = store.temporaryOccupations.filter((o) => {
    return o.start_time >= dayStart && o.start_time <= dayEnd;
  }).length;

  const unreleasedRecords = store.temporaryOccupations.filter((o) => {
    if (o.status !== 'active') return false;
    const start = o.start_time.substring(0, 10);
    return start <= dateStr;
  });

  const departmentBreakdown = {};
  for (const desk of store.desks) {
    const deptId = desk.department_id || 'unassigned';
    if (!departmentBreakdown[deptId]) {
      departmentBreakdown[deptId] = { total: 0, occupied: 0 };
    }
    departmentBreakdown[deptId].total += 1;
    if (desk.status === 'occupied') {
      departmentBreakdown[deptId].occupied += 1;
    }
  }

  const report = createDailyReport({
    date: dateStr,
    occupancy_rate: occupancyRate,
    temp_occupation_count: tempOccCount,
    unreleased_count: unreleasedRecords.length,
    details: {
      total_desks: totalDesks,
      occupied_desks: occupiedDesks,
      department_breakdown: departmentBreakdown,
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
