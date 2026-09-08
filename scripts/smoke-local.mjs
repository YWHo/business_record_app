const firstArgument = globalThis.process.argv[2];
const baseUrl =
  (firstArgument === '--' ? globalThis.process.argv[3] : firstArgument) ??
  'http://127.0.0.1:5173';

async function request(path, init = {}, cookie) {
  const headers = new Headers(init.headers);

  if (cookie) {
    headers.set('cookie', cookie);
  }

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body = await response.json();
  return { response, body };
}

function expectStatus(result, expected, label) {
  if (result.response.status !== expected) {
    throw new Error(
      `${label}: expected ${expected}, received ${result.response.status}: ${JSON.stringify(result.body)}`,
    );
  }
}

async function login(email) {
  const result = await request('/api/dev/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  expectStatus(result, 200, `login ${email}`);

  const cookie = result.response.headers.get('set-cookie')?.split(';')[0];

  if (!cookie) {
    throw new Error(`login ${email}: session cookie was not returned`);
  }

  return cookie;
}

const health = await request('/api/health');
expectStatus(health, 200, 'health');

if (health.body.database !== 'ready') {
  throw new Error(
    `health: local database is not seeded: ${JSON.stringify(health.body)}`,
  );
}

const ownerCookie = await login('owner@local.test');
const bootstrap = await request('/api/admin/bootstrap-owner', {
  method: 'POST',
  headers: { 'x-bootstrap-key': 'local-bootstrap-only' },
});
expectStatus(bootstrap, 200, 'idempotent owner bootstrap');

const loginLinkRequest = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@local.test' }),
});
expectStatus(loginLinkRequest, 200, 'request login link');
const authOutbox = await request('/api/dev/auth/outbox', {}, ownerCookie);
expectStatus(authOutbox, 200, 'authentication outbox');
const loginActionUrl = authOutbox.body.messages[0]?.action_url;
const loginToken = loginActionUrl
  ? new URL(loginActionUrl).searchParams.get('token')
  : null;
if (!loginToken)
  throw new Error('authentication outbox did not contain a login token');
const verifiedLogin = await request('/api/auth/verify', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token: loginToken }),
});
expectStatus(verifiedLogin, 200, 'verify login link');
const reusedLogin = await request('/api/auth/verify', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token: loginToken }),
});
expectStatus(reusedLogin, 400, 'single-use login link denial');

const ownerPermission = await request(
  '/api/dev/permissions/owner',
  {},
  ownerCookie,
);
expectStatus(ownerPermission, 200, 'owner permission');

const accountantCookie = await login('accountant@local.test');
const recordsPermission = await request(
  '/api/dev/permissions/records',
  {},
  accountantCookie,
);
expectStatus(recordsPermission, 200, 'accountant records permission');

const deniedOwnerPermission = await request(
  '/api/dev/permissions/owner',
  {},
  accountantCookie,
);
expectStatus(deniedOwnerPermission, 403, 'accountant owner permission denial');
const deniedUserList = await request('/api/users', {}, accountantCookie);
expectStatus(deniedUserList, 403, 'accountant user-list denial');

const accountantActivities = await request(
  '/api/business-activities',
  {},
  accountantCookie,
);
expectStatus(accountantActivities, 200, 'accountant activity read');
const deniedActivityCreate = await request(
  '/api/business-activities',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Denied Activity', activityType: 'TEST' }),
  },
  accountantCookie,
);
expectStatus(deniedActivityCreate, 403, 'accountant activity create denial');
const deniedActivityUpdate = await request(
  '/api/business-activities',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'activity-contracting', active: false }),
  },
  accountantCookie,
);
expectStatus(deniedActivityUpdate, 403, 'accountant activity update denial');

const createdActivity = await request(
  '/api/business-activities',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Phase 5 Consulting',
      activityType: 'professional_services',
      startedAt: '2026-04-01',
    }),
  },
  ownerCookie,
);
expectStatus(createdActivity, 201, 'owner activity create');
if (createdActivity.body.activity.activityType !== 'PROFESSIONAL_SERVICES') {
  throw new Error('activity type was not normalized');
}
const duplicateActivity = await request(
  '/api/business-activities',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'phase 5 consulting',
      activityType: 'SERVICES',
    }),
  },
  ownerCookie,
);
expectStatus(duplicateActivity, 409, 'duplicate activity denial');
const activityId = createdActivity.body.activity.id;
const deactivatedActivity = await request(
  '/api/business-activities',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: activityId,
      name: 'Phase 5 Advisory',
      active: false,
      endedAt: '2026-09-01',
    }),
  },
  ownerCookie,
);
expectStatus(deactivatedActivity, 200, 'activity rename and deactivate');
if (
  deactivatedActivity.body.activity.active !== false ||
  deactivatedActivity.body.activity.endedAt !== '2026-09-01'
) {
  throw new Error('activity deactivation did not preserve its end date');
}
const reactivatedActivity = await request(
  '/api/business-activities',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: activityId, active: true }),
  },
  ownerCookie,
);
expectStatus(reactivatedActivity, 200, 'activity reactivate');
if (reactivatedActivity.body.activity.endedAt !== null) {
  throw new Error('activity reactivation did not clear its end date');
}

const accountantVehicles = await request('/api/vehicles', {}, accountantCookie);
expectStatus(accountantVehicles, 200, 'accountant vehicle read');
const deniedVehicleCreate = await request(
  '/api/vehicles',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      registration: 'DENIED',
      description: 'Denied vehicle',
    }),
  },
  accountantCookie,
);
expectStatus(deniedVehicleCreate, 403, 'accountant vehicle create denial');
const deniedVehicleUpdate = await request(
  '/api/vehicles',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'vehicle-local', active: false }),
  },
  accountantCookie,
);
expectStatus(deniedVehicleUpdate, 403, 'accountant vehicle update denial');
const createdVehicle = await request(
  '/api/vehicles',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      registration: 'p5-test',
      description: 'Phase 5 test vehicle',
      acquiredAt: '2026-02-01',
      notes: 'Synthetic local smoke data',
    }),
  },
  ownerCookie,
);
expectStatus(createdVehicle, 201, 'owner vehicle create');
if (createdVehicle.body.vehicle.registration !== 'P5-TEST') {
  throw new Error('vehicle registration was not normalized');
}
const duplicateVehicle = await request(
  '/api/vehicles',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      registration: 'p5-test',
      description: 'Duplicate test vehicle',
    }),
  },
  ownerCookie,
);
expectStatus(duplicateVehicle, 409, 'duplicate vehicle denial');
const vehicleId = createdVehicle.body.vehicle.id;
const deactivatedVehicle = await request(
  '/api/vehicles',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: vehicleId,
      description: 'Phase 5 updated vehicle',
      active: false,
      retiredAt: '2026-08-31',
    }),
  },
  ownerCookie,
);
expectStatus(deactivatedVehicle, 200, 'vehicle edit and deactivate');
if (
  deactivatedVehicle.body.vehicle.active !== false ||
  deactivatedVehicle.body.vehicle.retiredAt !== '2026-08-31'
) {
  throw new Error('vehicle deactivation did not preserve its retirement date');
}
const reactivatedVehicle = await request(
  '/api/vehicles',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: vehicleId, active: true }),
  },
  ownerCookie,
);
expectStatus(reactivatedVehicle, 200, 'vehicle reactivate');
if (reactivatedVehicle.body.vehicle.retiredAt !== null) {
  throw new Error('vehicle reactivation did not clear its retirement date');
}

const accountantSessions = await request(
  '/api/work-sessions',
  {},
  accountantCookie,
);
expectStatus(accountantSessions, 200, 'accountant work-session read');
const deniedSessionCreate = await request(
  '/api/work-sessions',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  },
  accountantCookie,
);
expectStatus(deniedSessionCreate, 403, 'accountant work-session create denial');
const inactiveVehicleSession = await request(
  '/api/work-sessions',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      businessActivityId: activityId,
      vehicleId: 'vehicle-retired',
      startedAt: '2026-09-08T00:00:00.000Z',
      endedAt: '2026-09-08T01:00:00.000Z',
      odometerStartKm: 1000,
      odometerEndKm: 1020,
    }),
  },
  ownerCookie,
);
expectStatus(inactiveVehicleSession, 400, 'inactive vehicle session denial');
const invalidOdometerSession = await request(
  '/api/work-sessions',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      businessActivityId: activityId,
      vehicleId,
      startedAt: '2026-09-08T00:00:00.000Z',
      endedAt: '2026-09-08T01:00:00.000Z',
      odometerStartKm: 1050,
      odometerEndKm: 1000,
    }),
  },
  ownerCookie,
);
expectStatus(invalidOdometerSession, 400, 'reversed odometer denial');
const createdSession = await request(
  '/api/work-sessions',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      businessActivityId: activityId,
      vehicleId,
      startedAt: '2026-09-08T00:00:00.000Z',
      endedAt: '2026-09-08T02:30:00.000Z',
      odometerStartKm: 1000,
      odometerEndKm: 1075,
      distanceKm: 999,
      grossRevenue: '150.00',
      currency: 'NZD',
      notes: 'Synthetic Phase 6 session',
    }),
  },
  ownerCookie,
);
expectStatus(createdSession, 201, 'owner work-session create');
if (
  createdSession.body.session.distanceKm !== 75 ||
  createdSession.body.session.revenuePerHourMinor !== 6000 ||
  createdSession.body.session.revenuePerKmMinor !== 200
) {
  throw new Error('work-session derived metrics were incorrect');
}
const sessionId = createdSession.body.session.id;
const deniedSessionUpdate = await request(
  '/api/work-sessions',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: sessionId, notes: 'Denied edit' }),
  },
  accountantCookie,
);
expectStatus(deniedSessionUpdate, 403, 'accountant work-session update denial');
const updatedSession = await request(
  '/api/work-sessions',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: sessionId,
      endedAt: '2026-09-08T03:00:00.000Z',
      odometerEndKm: 1080,
      grossRevenue: '180.00',
    }),
  },
  ownerCookie,
);
expectStatus(updatedSession, 200, 'owner work-session update');
if (
  updatedSession.body.session.distanceKm !== 80 ||
  updatedSession.body.session.durationHours !== 3 ||
  updatedSession.body.session.revenuePerHourMinor !== 6000 ||
  updatedSession.body.session.revenuePerKmMinor !== 225
) {
  throw new Error('updated work-session metrics were not recalculated');
}
const sessionList = await request('/api/work-sessions', {}, ownerCookie);
expectStatus(sessionList, 200, 'owner work-session list');
if (
  sessionList.body.summary.totalDistanceKm !== 80 ||
  sessionList.body.summary.revenuePerKmMinor !== 225
) {
  throw new Error('work-session aggregate metrics were incorrect');
}

const accountantFuel = await request('/api/fuel-records', {}, accountantCookie);
expectStatus(accountantFuel, 200, 'accountant fuel read');
const deniedFuelCreate = await request(
  '/api/fuel-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  },
  accountantCookie,
);
expectStatus(deniedFuelCreate, 403, 'accountant fuel create denial');

const incompleteFuelBody = {
  businessActivityId: activityId,
  vehicleId,
  merchantName: 'Phase 7 Start Fuel',
  purchaseDatetime: '2026-09-07T23:45:00.000Z',
  totalAmount: '25.00',
  currency: 'NZD',
  gstStatus: 'UNKNOWN',
  fillType: 'FULL',
};
const incompleteFuelWarning = await request(
  '/api/fuel-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(incompleteFuelBody),
  },
  ownerCookie,
);
expectStatus(incompleteFuelWarning, 409, 'incomplete fuel warning');
if (
  incompleteFuelWarning.body.warnings?.[0]?.code !== 'INCOMPLETE_FUEL_DETAIL'
) {
  throw new Error('incomplete fuel warning code was not returned');
}
const startingFuel = await request(
  '/api/fuel-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...incompleteFuelBody,
      confirmedWarnings: ['INCOMPLETE_FUEL_DETAIL'],
    }),
  },
  ownerCookie,
);
expectStatus(startingFuel, 201, 'confirmed incomplete fuel create');

const mismatchedFuel = await request(
  '/api/fuel-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      businessActivityId: activityId,
      vehicleId,
      merchantName: 'Phase 7 End Fuel',
      purchaseDatetime: '2026-09-08T03:05:00.000Z',
      totalAmount: '120.00',
      fuelPricePerLitre: '2.500000',
      fuelLitres: 40,
      odometerKm: 1080,
      fillType: 'FULL',
      currency: 'NZD',
      gstStatus: 'GST_INCLUDED',
      gstAmount: '15.65',
    }),
  },
  ownerCookie,
);
expectStatus(mismatchedFuel, 409, 'fuel total mismatch warning');
if (mismatchedFuel.body.warnings?.[0]?.code !== 'TOTAL_MISMATCH') {
  throw new Error('fuel mismatch warning code was not returned');
}
const endingFuel = await request(
  '/api/fuel-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      businessActivityId: activityId,
      vehicleId,
      merchantName: 'Phase 7 End Fuel',
      purchaseDatetime: '2026-09-08T03:05:00.000Z',
      totalAmount: '100.00',
      fuelPricePerLitre: '2.500000',
      fuelLitres: 40,
      odometerKm: 1080,
      fillType: 'FULL',
      currency: 'NZD',
      gstStatus: 'GST_INCLUDED',
      gstAmount: '13.04',
    }),
  },
  ownerCookie,
);
expectStatus(endingFuel, 201, 'complete fuel create');
const updatedFuel = await request(
  '/api/fuel-records',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: endingFuel.body.fuelRecord.id,
      fuelStation: 'Phase 7 Central Pump',
      notes: 'Ending full-fill evidence',
    }),
  },
  ownerCookie,
);
expectStatus(updatedFuel, 200, 'fuel edit');
if (updatedFuel.body.fuelRecord.fuelStation !== 'Phase 7 Central Pump') {
  throw new Error('fuel detail edit was not persisted');
}

const deniedFuelWorkflow = await request(
  '/api/work-sessions/fuel-workflow',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: sessionId }),
  },
  accountantCookie,
);
expectStatus(deniedFuelWorkflow, 403, 'accountant fuel workflow denial');
const exactFuelWorkflow = await request(
  '/api/work-sessions/fuel-workflow',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: sessionId,
      tankFullAtStart: true,
      noPersonalDriving: true,
      tankFullAtEnd: true,
      startingFuelExpenseId: startingFuel.body.fuelRecord.id,
      endingFuelExpenseId: endingFuel.body.fuelRecord.id,
    }),
  },
  ownerCookie,
);
expectStatus(exactFuelWorkflow, 200, 'exact full-tank workflow');
if (
  exactFuelWorkflow.body.session.fuelCalculationStatus !== 'EXACT' ||
  exactFuelWorkflow.body.session.fuelLitresUsed !== 40 ||
  exactFuelWorkflow.body.session.kilometresPerLitre !== 2 ||
  exactFuelWorkflow.body.session.fuelCostPerKmMinor !== 125
) {
  throw new Error('full-tank fuel metrics were incorrect');
}
const estimatedFuelWorkflow = await request(
  '/api/work-sessions/fuel-workflow',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: sessionId,
      tankFullAtStart: true,
      noPersonalDriving: false,
      tankFullAtEnd: true,
      endingFuelExpenseId: endingFuel.body.fuelRecord.id,
    }),
  },
  ownerCookie,
);
expectStatus(estimatedFuelWorkflow, 200, 'non-exact full-tank workflow');
if (estimatedFuelWorkflow.body.session.fuelCalculationStatus !== 'ESTIMATE') {
  throw new Error(
    'incomplete confirmations were incorrectly presented as exact',
  );
}

const accountantCategories = await request(
  '/api/expense-categories',
  {},
  accountantCookie,
);
expectStatus(accountantCategories, 200, 'accountant category read');
const parkingCategory = accountantCategories.body.categories.find(
  (category) => category.systemKey === 'PARKING',
);
if (!parkingCategory)
  throw new Error('built-in parking category was not listed');
const protectedCategory = await request(
  '/api/expense-categories',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: parkingCategory.id, active: false }),
  },
  ownerCookie,
);
expectStatus(
  protectedCategory,
  400,
  'specialised category deactivation denial',
);
const deniedCategoryCreate = await request(
  '/api/expense-categories',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Denied category' }),
  },
  accountantCookie,
);
expectStatus(deniedCategoryCreate, 403, 'accountant category create denial');
const createdCategory = await request(
  '/api/expense-categories',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Phase 8 Equipment Rental' }),
  },
  ownerCookie,
);
expectStatus(createdCategory, 201, 'owner category create');
const categoryId = createdCategory.body.category.id;
const duplicateCategory = await request(
  '/api/expense-categories',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'phase 8 equipment rental' }),
  },
  ownerCookie,
);
expectStatus(duplicateCategory, 409, 'duplicate category denial');
const deactivatedCategory = await request(
  '/api/expense-categories',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: categoryId, active: false }),
  },
  ownerCookie,
);
expectStatus(deactivatedCategory, 200, 'category deactivate');
const reactivatedCategory = await request(
  '/api/expense-categories',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: categoryId,
      active: true,
      name: 'Phase 8 Equipment Hire',
    }),
  },
  ownerCookie,
);
expectStatus(reactivatedCategory, 200, 'category rename and reactivate');

const accountantGeneral = await request(
  '/api/general-expenses',
  {},
  accountantCookie,
);
expectStatus(accountantGeneral, 200, 'accountant general expense read');
const deniedGeneralCreate = await request(
  '/api/general-expenses',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  },
  accountantCookie,
);
expectStatus(deniedGeneralCreate, 403, 'accountant general expense denial');
const createdGeneral = await request(
  '/api/general-expenses',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      businessActivityId: activityId,
      expenseCategoryId: categoryId,
      merchantName: 'Phase 8 Hire Co',
      purchaseDatetime: '2026-09-08T04:00:00.000Z',
      totalAmount: '46.00',
      currency: 'nzd',
      gstAmount: '6.00',
      gstStatus: 'GST_INCLUDED',
      recurrenceType: 'RECURRING',
      description: 'Synthetic recurring general expense',
    }),
  },
  ownerCookie,
);
expectStatus(createdGeneral, 201, 'general expense create');
if (
  createdGeneral.body.generalExpense.totalAmountMinor !== 4600 ||
  createdGeneral.body.generalExpense.recurrenceType !== 'RECURRING' ||
  createdGeneral.body.generalExpense.currency !== 'NZD'
) {
  throw new Error('general expense values were not normalized');
}
const updatedGeneral = await request(
  '/api/general-expenses',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: createdGeneral.body.generalExpense.id,
      totalAmount: '57.50',
      recurrenceType: 'ONE_OFF',
    }),
  },
  ownerCookie,
);
expectStatus(updatedGeneral, 200, 'general expense edit');
if (updatedGeneral.body.generalExpense.totalAmountMinor !== 5750)
  throw new Error('general expense edit was not persisted');

const accountantParking = await request(
  '/api/parking-records',
  {},
  accountantCookie,
);
expectStatus(accountantParking, 200, 'accountant parking read');
const deniedParkingCreate = await request(
  '/api/parking-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  },
  accountantCookie,
);
expectStatus(deniedParkingCreate, 403, 'accountant parking expense denial');
const reversedParking = await request(
  '/api/parking-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      businessActivityId: activityId,
      vehicleId,
      parkingProvider: 'Phase 8 Parking',
      parkingLocation: 'Waterfront',
      purchaseDatetime: '2026-09-08T05:00:00.000Z',
      parkingStartDatetime: '2026-09-08T06:00:00.000Z',
      parkingEndDatetime: '2026-09-08T05:30:00.000Z',
      totalAmount: '12.00',
    }),
  },
  ownerCookie,
);
expectStatus(reversedParking, 400, 'reversed parking interval denial');
const createdParking = await request(
  '/api/parking-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      businessActivityId: activityId,
      vehicleId,
      parkingProvider: 'Phase 8 Parking',
      parkingLocation: 'Waterfront',
      purchaseDatetime: '2026-09-08T05:00:00.000Z',
      parkingStartDatetime: '2026-09-08T05:00:00.000Z',
      parkingEndDatetime: '2026-09-08T06:30:00.000Z',
      parkingReference: 'P8-001',
      totalAmount: '12.00',
      gstAmount: '1.57',
      gstStatus: 'GST_INCLUDED',
      recurrenceType: 'ONE_OFF',
    }),
  },
  ownerCookie,
);
expectStatus(createdParking, 201, 'parking expense create');
if (createdParking.body.parkingRecord.parkingDurationMinutes !== 90)
  throw new Error('parking duration was not derived correctly');
const updatedParking = await request(
  '/api/parking-records',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: createdParking.body.parkingRecord.id,
      parkingLocation: 'Waterfront level 2',
      parkingEndDatetime: '2026-09-08T07:00:00.000Z',
    }),
  },
  ownerCookie,
);
expectStatus(updatedParking, 200, 'parking expense edit');
if (updatedParking.body.parkingRecord.parkingDurationMinutes !== 120)
  throw new Error('parking duration was not recalculated');

const accountantInsurance = await request(
  '/api/insurance-records',
  {},
  accountantCookie,
);
expectStatus(accountantInsurance, 200, 'accountant insurance read');
const deniedInsuranceCreate = await request(
  '/api/insurance-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  },
  accountantCookie,
);
expectStatus(deniedInsuranceCreate, 403, 'accountant insurance create denial');
const invalidVehicleInsurance = await request(
  '/api/insurance-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      insuranceType: 'VEHICLE',
      provider: 'Phase 9 Cover',
      policyPeriodStart: '2026-04-01',
      policyPeriodEnd: '2027-03-31',
      purchaseDatetime: '2026-09-08T08:00:00.000Z',
      totalAmount: '1000.00',
    }),
  },
  ownerCookie,
);
expectStatus(
  invalidVehicleInsurance,
  400,
  'vehicle insurance vehicle requirement',
);
const liabilityInsurance = await request(
  '/api/insurance-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      insuranceType: 'PROFESSIONAL_LIABILITY',
      businessActivityId: activityId,
      provider: 'Phase 9 Liability Cover',
      policyNumber: 'LIAB-P9',
      policyPeriodStart: '2026-04-01',
      policyPeriodEnd: '2027-03-31',
      purchaseDatetime: '2026-09-08T08:00:00.000Z',
      totalAmount: '240.00',
      currency: 'NZD',
      gstStatus: 'NO_GST',
      recurrenceType: 'RECURRING',
      allocationMethod: '100_PERCENT_BUSINESS',
    }),
  },
  ownerCookie,
);
expectStatus(liabilityInsurance, 201, 'liability insurance create');
if (
  liabilityInsurance.body.insuranceRecord.allocation.allocatedAmountMinor !==
    24000 ||
  liabilityInsurance.body.insuranceRecord.allocation.percentageBasisPoints !==
    10000
) {
  throw new Error('100 percent liability allocation was incorrect');
}
const vehicleInsurance = await request(
  '/api/insurance-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      insuranceType: 'VEHICLE',
      businessActivityId: activityId,
      vehicleId,
      provider: 'Phase 9 Vehicle Cover',
      policyNumber: 'VEH-P9',
      policyPeriodStart: '2026-04-01',
      policyPeriodEnd: '2027-03-31',
      purchaseDatetime: '2026-09-08T08:30:00.000Z',
      totalAmount: '1000.00',
      currency: 'NZD',
      gstStatus: 'NO_GST',
      recurrenceType: 'RECURRING',
      allocationMethod: 'MANUAL_PERCENTAGE',
      allocationPercentage: '25.00',
      allocationNotes: 'Synthetic mixed vehicle use',
    }),
  },
  ownerCookie,
);
expectStatus(vehicleInsurance, 201, 'vehicle insurance create');
if (
  vehicleInsurance.body.insuranceRecord.premiumMinor !== 100000 ||
  vehicleInsurance.body.insuranceRecord.allocation.allocatedAmountMinor !==
    25000
) {
  throw new Error('manual vehicle allocation was incorrect');
}
const insuranceId = vehicleInsurance.body.insuranceRecord.id;
const deniedInsuranceEdit = await request(
  '/api/insurance-records',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: insuranceId, totalAmount: '1.00' }),
  },
  accountantCookie,
);
expectStatus(
  deniedInsuranceEdit,
  403,
  'accountant source insurance edit denial',
);
const updatedInsurance = await request(
  '/api/insurance-records',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: insuranceId, totalAmount: '1200.00' }),
  },
  ownerCookie,
);
expectStatus(updatedInsurance, 200, 'insurance premium edit');
if (
  updatedInsurance.body.insuranceRecord.allocation.allocatedAmountMinor !==
  30000
) {
  throw new Error(
    'insurance allocation was not recalculated after premium edit',
  );
}
const deniedOwnerAdjustment = await request(
  '/api/insurance-allocations',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      expenseId: insuranceId,
      allocatedAmount: '400.00',
      allocationNotes: 'Owner must not impersonate accountant review',
    }),
  },
  ownerCookie,
);
expectStatus(deniedOwnerAdjustment, 403, 'owner accountant-adjustment denial');
const accountantAdjustment = await request(
  '/api/insurance-allocations',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      expenseId: insuranceId,
      allocatedAmount: '400.00',
      allocationNotes: 'Reviewed Phase 9 adjustment',
    }),
  },
  accountantCookie,
);
expectStatus(accountantAdjustment, 200, 'accountant allocation adjustment');
if (
  accountantAdjustment.body.insuranceRecord.premiumMinor !== 120000 ||
  accountantAdjustment.body.insuranceRecord.allocation.method !==
    'ACCOUNTANT_ADJUSTMENT' ||
  accountantAdjustment.body.insuranceRecord.allocation.allocatedAmountMinor !==
    40000 ||
  accountantAdjustment.body.insuranceRecord.allocation.reviewerEmail !==
    'accountant@local.test'
) {
  throw new Error(
    'accountant adjustment or reviewer attribution was incorrect',
  );
}
const sourceEditAfterReview = await request(
  '/api/insurance-records',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: insuranceId,
      policyNumber: 'VEH-P9-UPDATED',
    }),
  },
  ownerCookie,
);
expectStatus(sourceEditAfterReview, 200, 'source edit after allocation review');
if (
  sourceEditAfterReview.body.insuranceRecord.allocation.reviewerEmail !==
  'accountant@local.test'
) {
  throw new Error(
    'unrelated source edit removed allocation reviewer attribution',
  );
}

const accountantClients = await request('/api/clients', {}, accountantCookie);
expectStatus(accountantClients, 200, 'accountant client list');
const deniedClientCreate = await request(
  '/api/clients',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Denied Phase 10 Client' }),
  },
  accountantCookie,
);
expectStatus(deniedClientCreate, 403, 'accountant client create denial');
const clientCreate = await request(
  '/api/clients',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Phase 10 Consulting Client' }),
  },
  ownerCookie,
);
expectStatus(clientCreate, 201, 'client create');
const clientId = clientCreate.body.client.id;
const duplicateClient = await request(
  '/api/clients',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Phase 10 Consulting Client' }),
  },
  ownerCookie,
);
expectStatus(duplicateClient, 409, 'duplicate client denial');

const accountantIncome = await request(
  '/api/income-records',
  {},
  accountantCookie,
);
expectStatus(accountantIncome, 200, 'accountant income list');
const deniedIncomeCreate = await request(
  '/api/income-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ incomeType: 'GENERAL' }),
  },
  accountantCookie,
);
expectStatus(deniedIncomeCreate, 403, 'accountant income create denial');
const platformIncome = await request(
  '/api/income-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      incomeType: 'PLATFORM',
      businessActivityId: activityId,
      providerName: 'Configurable Delivery Platform',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-07',
      paymentDate: '2026-09-08',
      grossEarnings: '100.00',
      tips: '10.00',
      bonusesPromotions: '5.00',
      flatRateCredit: '2.00',
      platformFees: '20.00',
      otherAdjustments: '-3.00',
      netPaymentReceived: '94.00',
      currency: 'NZD',
    }),
  },
  ownerCookie,
);
expectStatus(platformIncome, 201, 'platform income create');
if (
  platformIncome.body.incomeRecord.totalAmountMinor !== 9400 ||
  platformIncome.body.incomeRecord.details.providerName !==
    'Configurable Delivery Platform' ||
  platformIncome.body.incomeRecord.details.otherAdjustmentsMinor !== -300
) {
  throw new Error('platform income detail or net value was incorrect');
}
const contractBody = {
  incomeType: 'CONTRACT',
  businessActivityId: activityId,
  clientId,
  invoiceNumber: 'P10-INV-1',
  invoiceDate: '2026-09-01',
  subtotal: '1000.00',
  gstAmount: '150.00',
  total: '1150.00',
  dueDate: '2026-09-20',
  paymentStatus: 'ISSUED',
  currency: 'NZD',
};
const contractIncome = await request(
  '/api/income-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(contractBody),
  },
  ownerCookie,
);
expectStatus(contractIncome, 201, 'contract income create');
const contractId = contractIncome.body.incomeRecord.id;
const duplicateInvoice = await request(
  '/api/income-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(contractBody),
  },
  ownerCookie,
);
expectStatus(duplicateInvoice, 409, 'duplicate client invoice denial');
const contractPayment = await request(
  '/api/income-records',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: contractId,
      paymentStatus: 'PARTIALLY_PAID',
      paymentReceivedDate: '2026-09-08',
      amountReceived: '575.00',
    }),
  },
  ownerCookie,
);
expectStatus(contractPayment, 200, 'contract payment update');
if (
  contractPayment.body.incomeRecord.details.amountReceivedMinor !== 57500 ||
  contractPayment.body.incomeRecord.details.outstandingAmountMinor !== 57500
) {
  throw new Error('contract received or outstanding amount was incorrect');
}
const subscriptionIncome = await request(
  '/api/income-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      incomeType: 'SUBSCRIPTION',
      businessActivityId: activityId,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      grossSubscriptionRevenue: '500.00',
      refunds: '20.00',
      platformFees: '30.00',
      paymentProcessingFees: '10.00',
      netPaymentReceived: '440.00',
      subscriberCount: 42,
      newSubscribers: 5,
      cancelledSubscribers: 2,
      currency: 'NZD',
    }),
  },
  ownerCookie,
);
expectStatus(subscriptionIncome, 201, 'subscription income create');
if (
  subscriptionIncome.body.incomeRecord.totalAmountMinor !== 44000 ||
  subscriptionIncome.body.incomeRecord.details.subscriberCount !== 42
) {
  throw new Error('subscription summary was incorrect');
}
const generalIncome = await request(
  '/api/income-records',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      incomeType: 'GENERAL',
      businessActivityId: activityId,
      receivedFrom: 'Section 23 payer',
      transactionDate: '2026-09-08',
      totalAmount: '100.00',
      currency: 'NZD',
    }),
  },
  ownerCookie,
);
expectStatus(generalIncome, 201, 'general income create');
const deniedIncomeEdit = await request(
  '/api/income-records',
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: platformIncome.body.incomeRecord.id,
      netPaymentReceived: '1.00',
    }),
  },
  accountantCookie,
);
expectStatus(deniedIncomeEdit, 403, 'accountant income source edit denial');
const reconciliation = await request(
  '/api/income-reconciliations',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      incomeId: platformIncome.body.incomeRecord.id,
      expectedAmount: '94.00',
      actualAmount: '93.00',
      notes: 'Manual statement comparison',
    }),
  },
  accountantCookie,
);
expectStatus(reconciliation, 200, 'accountant income reconciliation');
if (
  reconciliation.body.incomeRecord.reconciliation.differenceAmountMinor !==
    -100 ||
  reconciliation.body.incomeRecord.reconciliation.matched !== false ||
  reconciliation.body.incomeRecord.reconciliation.reconcilerEmail !==
    'accountant@local.test'
) {
  throw new Error('income reconciliation or attribution was incorrect');
}
const finalIncomeList = await request('/api/income-records', {}, ownerCookie);
expectStatus(finalIncomeList, 200, 'final income list');
const nzdIncome = finalIncomeList.body.summary.totalsByCurrency.find(
  (item) => item.currency === 'NZD',
);
if (!nzdIncome || nzdIncome.totalAmountMinor !== 178400) {
  throw new Error('income summary did not preserve per-type recorded values');
}

const disabledLogin = await request('/api/dev/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'disabled@local.test' }),
});
expectStatus(disabledLogin, 401, 'disabled account denial');

const invitation = await request(
  '/api/invitations',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'phase4-invitee@local.test' }),
  },
  ownerCookie,
);
expectStatus(invitation, 201, 'create invitation');

const invitationUrl = new URL(
  invitation.body.invitation.invitationUrl,
  baseUrl,
);
const token = invitationUrl.searchParams.get('token');

if (!token) {
  throw new Error('create invitation: response did not contain a token URL');
}

const acceptBody = {
  email: 'phase4-invitee@local.test',
  token,
};
const accepted = await request('/api/invitations/accept', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(acceptBody),
});
expectStatus(accepted, 200, 'accept invitation');

const reused = await request('/api/invitations/accept', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(acceptBody),
});
expectStatus(reused, 400, 'single-use invitation denial');

const expired = await request('/api/invitations/accept', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: 'expired-invitee@local.test',
    token: 'expired-local-invite',
  }),
});
expectStatus(expired, 400, 'expired invitation denial');

const invitedCookie = await login('phase4-invitee@local.test');
const invitedPermission = await request(
  '/api/dev/permissions/records',
  {},
  invitedCookie,
);
expectStatus(invitedPermission, 200, 'invited accountant permission');
const users = await request('/api/users', {}, ownerCookie);
expectStatus(users, 200, 'owner user list');
const invitedUser = users.body.users.find(
  (candidate) => candidate.email === 'phase4-invitee@local.test',
);
if (!invitedUser)
  throw new Error('invited accountant did not appear in user list');
const disabled = await request(
  '/api/users/disable',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: invitedUser.id }),
  },
  ownerCookie,
);
expectStatus(disabled, 200, 'disable accountant');
const revokedSession = await request(
  '/api/dev/permissions/records',
  {},
  invitedCookie,
);
expectStatus(revokedSession, 401, 'disabled accountant session revocation');

const storageWrite = await request(
  '/api/dev/storage-probe',
  { method: 'PUT' },
  ownerCookie,
);
expectStatus(storageWrite, 200, 'R2 write');

const storageRead = await request('/api/dev/storage-probe', {}, ownerCookie);
expectStatus(storageRead, 200, 'R2 read');

if (!storageRead.body.exists) {
  throw new Error('R2 read: probe object was not persisted');
}

globalThis.console.log(
  'Local smoke passed: authentication, roles, reference data, mileage, fuel, parking, expenses, insurance, all income types, reconciliation, revocation, and R2.',
);
