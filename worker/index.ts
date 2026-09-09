import { HttpError, json, methodNotAllowed } from './lib/http';
import {
  authConfiguration,
  currentUser,
  loginLocally,
  logout,
  requestLogin,
  verifyLogin,
} from './routes/auth';
import {
  acceptInvitation,
  bootstrapOwner,
  disableUser,
  inviteAccountant,
  listInvitations,
  listUsers,
} from './routes/accounts';
import {
  acceptInvitation as acceptDevelopmentInvitation,
  checkOwnerPermission,
  checkRecordsPermission,
  createInvitation as createDevelopmentInvitation,
  listDevelopmentAuthOutbox,
  listDevelopmentOutbox,
  readStorageProbe,
  writeStorageProbe,
} from './routes/development';
import { health } from './routes/health';
import {
  createActivity,
  listActivities,
  updateActivity,
} from './routes/activities';
import { createVehicle, listVehicles, updateVehicle } from './routes/vehicles';
import {
  createWorkSession,
  listWorkSessions,
  updateFuelWorkflow,
  updateWorkSession,
} from './routes/workSessions';
import {
  createFuelRecord,
  listFuelRecords,
  updateFuelRecord,
} from './routes/fuelRecords';
import {
  createExpenseCategory,
  listExpenseCategories,
  updateExpenseCategory,
} from './routes/expenseCategories';
import {
  createGeneralExpense,
  createParkingRecord,
  listGeneralExpenses,
  listParkingRecords,
  updateGeneralExpense,
  updateParkingRecord,
} from './routes/expenseRecords';
import {
  adjustInsuranceAllocation,
  createInsuranceRecord,
  listInsuranceRecords,
  updateInsuranceRecord,
} from './routes/insuranceRecords';
import { createClient, listClients, updateClient } from './routes/clients';
import {
  createIncomeRecord,
  listIncomeRecords,
  reconcileIncome,
  updateIncomeRecord,
} from './routes/incomeRecords';
import {
  downloadAttachment,
  listAttachments,
  uploadAttachment,
} from './routes/attachments';
import {
  createComment,
  createSavedFilter,
  deleteSavedFilter,
  listComments,
  listSavedFilters,
  listTransactions,
  updateRecordStatus,
  updateSavedFilter,
} from './routes/review';
import {
  getRetentionSettings,
  listAuditLog,
  listTrash,
  moveToTrash,
  purgeFromTrash,
  restoreFromTrash,
  updateRetentionSettings,
} from './routes/governance';
import { downloadExport, exportStatus } from './routes/exports';
import type { Env } from './types';

type RouteHandler = (
  request: Request,
  env: Env,
) => Response | Promise<Response>;

interface Route {
  method: string;
  pathname: string;
  handler: RouteHandler;
}

const routes: Route[] = [
  {
    method: 'GET',
    pathname: '/api/health',
    handler: (_request, env) => health(env),
  },
  { method: 'GET', pathname: '/api/auth/me', handler: currentUser },
  { method: 'GET', pathname: '/api/auth/config', handler: authConfiguration },
  { method: 'POST', pathname: '/api/auth/login', handler: requestLogin },
  { method: 'POST', pathname: '/api/auth/verify', handler: verifyLogin },
  { method: 'POST', pathname: '/api/auth/logout', handler: logout },
  {
    method: 'GET',
    pathname: '/api/business-activities',
    handler: listActivities,
  },
  {
    method: 'POST',
    pathname: '/api/business-activities',
    handler: createActivity,
  },
  {
    method: 'PATCH',
    pathname: '/api/business-activities',
    handler: updateActivity,
  },
  { method: 'GET', pathname: '/api/vehicles', handler: listVehicles },
  { method: 'POST', pathname: '/api/vehicles', handler: createVehicle },
  { method: 'PATCH', pathname: '/api/vehicles', handler: updateVehicle },
  { method: 'GET', pathname: '/api/work-sessions', handler: listWorkSessions },
  {
    method: 'POST',
    pathname: '/api/work-sessions',
    handler: createWorkSession,
  },
  {
    method: 'PATCH',
    pathname: '/api/work-sessions',
    handler: updateWorkSession,
  },
  {
    method: 'PATCH',
    pathname: '/api/work-sessions/fuel-workflow',
    handler: updateFuelWorkflow,
  },
  { method: 'GET', pathname: '/api/fuel-records', handler: listFuelRecords },
  { method: 'POST', pathname: '/api/fuel-records', handler: createFuelRecord },
  { method: 'PATCH', pathname: '/api/fuel-records', handler: updateFuelRecord },
  {
    method: 'GET',
    pathname: '/api/expense-categories',
    handler: listExpenseCategories,
  },
  {
    method: 'POST',
    pathname: '/api/expense-categories',
    handler: createExpenseCategory,
  },
  {
    method: 'PATCH',
    pathname: '/api/expense-categories',
    handler: updateExpenseCategory,
  },
  {
    method: 'GET',
    pathname: '/api/general-expenses',
    handler: listGeneralExpenses,
  },
  {
    method: 'POST',
    pathname: '/api/general-expenses',
    handler: createGeneralExpense,
  },
  {
    method: 'PATCH',
    pathname: '/api/general-expenses',
    handler: updateGeneralExpense,
  },
  {
    method: 'GET',
    pathname: '/api/parking-records',
    handler: listParkingRecords,
  },
  {
    method: 'POST',
    pathname: '/api/parking-records',
    handler: createParkingRecord,
  },
  {
    method: 'PATCH',
    pathname: '/api/parking-records',
    handler: updateParkingRecord,
  },
  {
    method: 'GET',
    pathname: '/api/insurance-records',
    handler: listInsuranceRecords,
  },
  {
    method: 'POST',
    pathname: '/api/insurance-records',
    handler: createInsuranceRecord,
  },
  {
    method: 'PATCH',
    pathname: '/api/insurance-records',
    handler: updateInsuranceRecord,
  },
  {
    method: 'PATCH',
    pathname: '/api/insurance-allocations',
    handler: adjustInsuranceAllocation,
  },
  { method: 'GET', pathname: '/api/clients', handler: listClients },
  { method: 'POST', pathname: '/api/clients', handler: createClient },
  { method: 'PATCH', pathname: '/api/clients', handler: updateClient },
  {
    method: 'GET',
    pathname: '/api/income-records',
    handler: listIncomeRecords,
  },
  {
    method: 'POST',
    pathname: '/api/income-records',
    handler: createIncomeRecord,
  },
  {
    method: 'PATCH',
    pathname: '/api/income-records',
    handler: updateIncomeRecord,
  },
  {
    method: 'POST',
    pathname: '/api/income-reconciliations',
    handler: reconcileIncome,
  },
  {
    method: 'GET',
    pathname: '/api/attachments',
    handler: listAttachments,
  },
  {
    method: 'POST',
    pathname: '/api/attachments',
    handler: uploadAttachment,
  },
  {
    method: 'GET',
    pathname: '/api/attachments/file',
    handler: downloadAttachment,
  },
  {
    method: 'GET',
    pathname: '/api/transactions',
    handler: listTransactions,
  },
  {
    method: 'GET',
    pathname: '/api/receipts',
    handler: listTransactions,
  },
  {
    method: 'PATCH',
    pathname: '/api/record-status',
    handler: updateRecordStatus,
  },
  { method: 'GET', pathname: '/api/comments', handler: listComments },
  { method: 'POST', pathname: '/api/comments', handler: createComment },
  {
    method: 'GET',
    pathname: '/api/saved-filters',
    handler: listSavedFilters,
  },
  {
    method: 'POST',
    pathname: '/api/saved-filters',
    handler: createSavedFilter,
  },
  {
    method: 'PATCH',
    pathname: '/api/saved-filters',
    handler: updateSavedFilter,
  },
  {
    method: 'DELETE',
    pathname: '/api/saved-filters',
    handler: deleteSavedFilter,
  },
  { method: 'GET', pathname: '/api/audit-log', handler: listAuditLog },
  { method: 'GET', pathname: '/api/trash', handler: listTrash },
  { method: 'POST', pathname: '/api/trash', handler: moveToTrash },
  { method: 'POST', pathname: '/api/trash/restore', handler: restoreFromTrash },
  { method: 'DELETE', pathname: '/api/trash', handler: purgeFromTrash },
  {
    method: 'GET',
    pathname: '/api/retention-settings',
    handler: getRetentionSettings,
  },
  {
    method: 'PATCH',
    pathname: '/api/retention-settings',
    handler: updateRetentionSettings,
  },
  { method: 'GET', pathname: '/api/exports/status', handler: exportStatus },
  { method: 'GET', pathname: '/api/exports/archive', handler: downloadExport },
  {
    method: 'POST',
    pathname: '/api/admin/bootstrap-owner',
    handler: bootstrapOwner,
  },
  { method: 'GET', pathname: '/api/users', handler: listUsers },
  { method: 'POST', pathname: '/api/users/disable', handler: disableUser },
  { method: 'GET', pathname: '/api/invitations', handler: listInvitations },
  { method: 'POST', pathname: '/api/invitations', handler: inviteAccountant },
  {
    method: 'POST',
    pathname: '/api/invitations/accept',
    handler: acceptInvitation,
  },
  { method: 'POST', pathname: '/api/dev/auth/login', handler: loginLocally },
  {
    method: 'GET',
    pathname: '/api/dev/auth/outbox',
    handler: listDevelopmentAuthOutbox,
  },
  {
    method: 'GET',
    pathname: '/api/dev/invitations/outbox',
    handler: listDevelopmentOutbox,
  },
  {
    method: 'POST',
    pathname: '/api/dev/invitations',
    handler: createDevelopmentInvitation,
  },
  {
    method: 'POST',
    pathname: '/api/dev/invitations/accept',
    handler: acceptDevelopmentInvitation,
  },
  {
    method: 'GET',
    pathname: '/api/dev/permissions/records',
    handler: checkRecordsPermission,
  },
  {
    method: 'GET',
    pathname: '/api/dev/permissions/owner',
    handler: checkOwnerPermission,
  },
  {
    method: 'PUT',
    pathname: '/api/dev/storage-probe',
    handler: writeStorageProbe,
  },
  {
    method: 'GET',
    pathname: '/api/dev/storage-probe',
    handler: readStorageProbe,
  },
];

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const matchingPath = routes.filter((route) => route.pathname === pathname);
  const route = matchingPath.find(
    (candidate) => candidate.method === request.method,
  );

  if (route) {
    return route.handler(request, env);
  }

  if (matchingPath.length > 0) {
    return methodNotAllowed(matchingPath.map(({ method }) => method));
  }

  return json({ error: 'Not found.' }, { status: 404 });
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (env.APP_ENV !== 'local' && url.protocol !== 'https:') {
        url.protocol = 'https:';
        return new Response(null, {
          status: 308,
          headers: { location: url.toString(), 'cache-control': 'no-store' },
        });
      }

      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, { status: error.status });
      }

      console.error('Unhandled API error', {
        method: request.method,
        pathname: new URL(request.url).pathname,
      });
      return json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
