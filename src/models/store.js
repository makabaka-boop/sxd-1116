const { v4: uuidv4 } = require('uuid');

const store = {
  users: [],
  departments: [],
  desks: [],
  scheduleRules: [],
  scheduleAssignments: [],
  temporaryOccupations: [],
  maintenancePlans: [],
  dailyReports: [],
  snapshots: [],
};

function createUser({ username, role, department_id }) {
  const user = {
    id: uuidv4(),
    username,
    role,
    department_id: department_id || null,
    created_at: new Date().toISOString(),
  };
  store.users.push(user);
  return user;
}

function createDepartment({ name }) {
  const dept = {
    id: uuidv4(),
    name,
    created_at: new Date().toISOString(),
  };
  store.departments.push(dept);
  return dept;
}

function createDesk({ name, department_id }) {
  const desk = {
    id: uuidv4(),
    name,
    department_id: department_id || null,
    status: 'available',
    created_at: new Date().toISOString(),
  };
  store.desks.push(desk);
  return desk;
}

function createScheduleRule({ name, department_id, desk_id, user_id, weekday, effective_date, expired_date }) {
  const rule = {
    id: uuidv4(),
    name,
    department_id: department_id || null,
    desk_id: desk_id || null,
    user_id: user_id || null,
    weekday,
    effective_date: effective_date || null,
    expired_date: expired_date || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.scheduleRules.push(rule);
  return rule;
}

function createScheduleAssignment({ schedule_rule_id, desk_id, user_id, date, status }) {
  const assignment = {
    id: uuidv4(),
    schedule_rule_id,
    desk_id,
    user_id,
    date,
    status: status || 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.scheduleAssignments.push(assignment);
  return assignment;
}

function createTemporaryOccupation({ desk_id, user_id, start_time, end_time, status }) {
  const occ = {
    id: uuidv4(),
    desk_id,
    user_id,
    start_time: start_time || new Date().toISOString(),
    end_time: end_time || null,
    status: status || 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.temporaryOccupations.push(occ);
  return occ;
}

function createDailyReport({ date, occupancy_rate, temp_occupation_count, unreleased_count, details }) {
  const report = {
    id: uuidv4(),
    date,
    occupancy_rate,
    temp_occupation_count,
    unreleased_count,
    confirmed_by: null,
    confirmed_at: null,
    details: details || {},
    created_at: new Date().toISOString(),
  };
  store.dailyReports.push(report);
  return report;
}

function createMaintenancePlan({ desk_id, start_date, end_date, reason, status }) {
  const plan = {
    id: uuidv4(),
    desk_id,
    start_date,
    end_date,
    reason: reason || '',
    status: status || 'scheduled',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.maintenancePlans.push(plan);
  return plan;
}

function isDeskUnderMaintenance(desk_id, dateStr) {
  return store.maintenancePlans.some(
    (p) =>
      p.desk_id === desk_id &&
      p.status !== 'cancelled' &&
      p.status !== 'completed' &&
      dateStr >= p.start_date &&
      dateStr <= p.end_date
  );
}

function getActiveMaintenanceForDesk(desk_id, dateStr) {
  return store.maintenancePlans.find(
    (p) =>
      p.desk_id === desk_id &&
      p.status !== 'cancelled' &&
      p.status !== 'completed' &&
      dateStr >= p.start_date &&
      dateStr <= p.end_date
  ) || null;
}

function getEffectivePlanStatus(plan) {
  if (plan.status === 'cancelled' || plan.status === 'completed') return plan.status;
  const today = new Date().toISOString().substring(0, 10);
  if (plan.end_date < today) return 'completed';
  if (plan.start_date <= today && plan.end_date >= today) return 'active';
  return 'scheduled';
}

function createSnapshot({ date, type, data }) {
  const snapshot = {
    id: uuidv4(),
    date,
    type,
    data: JSON.parse(JSON.stringify(data)),
    created_at: new Date().toISOString(),
  };
  store.snapshots.push(snapshot);
  return snapshot;
}

module.exports = {
  store,
  createUser,
  createDepartment,
  createDesk,
  createScheduleRule,
  createScheduleAssignment,
  createTemporaryOccupation,
  createMaintenancePlan,
  isDeskUnderMaintenance,
  getActiveMaintenanceForDesk,
  getEffectivePlanStatus,
  createDailyReport,
  createSnapshot,
};
