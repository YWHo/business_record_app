import { fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './features/auth/AuthContext';

function renderApp(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <AuthProvider>
            <App />
          </AuthProvider>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

describe('App', () => {
  let currentRole: 'OWNER' | 'ACCOUNTANT';

  beforeEach(() => {
    currentRole = 'OWNER';
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url.endsWith('/api/businesses'))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                businesses: [
                  {
                    id: 'business-activity-contracting',
                    name: 'IT Contracting',
                    description: 'IT services',
                    businessType: 'PROFESSIONAL_SERVICES',
                    defaultCurrency: 'NZD',
                    status: 'ACTIVE',
                    legacyBusinessActivityId: 'activity-contracting',
                    currentLegalEntity: {
                      id: 'entity-owner',
                      entityType: 'SOLE_TRADER',
                      legalName: 'Local Sole Trader',
                      tradingName: null,
                      status: 'ACTIVE',
                      attributionReviewRequired: false,
                    },
                    recordCount: 64,
                    awaitingReviewCount: 1,
                    missingReceiptCount: 0,
                    lastRecordUpdatedAt: '2026-09-08T00:00:00.000Z',
                  },
                  {
                    id: 'business-activity-delivery',
                    name: 'Delivery Platform',
                    description: 'Delivery services',
                    businessType: 'PLATFORM_SERVICES',
                    defaultCurrency: 'NZD',
                    status: 'ACTIVE',
                    legacyBusinessActivityId: 'activity-delivery',
                    currentLegalEntity: {
                      id: 'entity-owner',
                      entityType: 'SOLE_TRADER',
                      legalName: 'Local Sole Trader',
                      tradingName: null,
                      status: 'ACTIVE',
                      attributionReviewRequired: false,
                    },
                    recordCount: 128,
                    awaitingReviewCount: 8,
                    missingReceiptCount: 2,
                    lastRecordUpdatedAt: '2026-09-09T00:00:00.000Z',
                  },
                ],
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            ),
          );
        if (/\/api\/businesses\/business-activity-contracting$/.test(url))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                business: {
                  id: 'business-activity-contracting',
                  name: 'IT Contracting',
                  description: 'IT services',
                  businessType: 'PROFESSIONAL_SERVICES',
                  defaultCurrency: 'NZD',
                },
                operatingPeriods: [
                  {
                    id: 'period-contracting',
                    effectiveFrom: '2026-04-01',
                    effectiveTo: null,
                    legalEntityId: 'entity-owner',
                    legalEntity: {
                      id: 'entity-owner',
                      entityType: 'SOLE_TRADER',
                      legalName: 'Local Sole Trader',
                      tradingName: null,
                    },
                  },
                ],
                currentLegalEntity: {
                  id: 'entity-owner',
                  entityType: 'SOLE_TRADER',
                  legalName: 'Local Sole Trader',
                  tradingName: null,
                },
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            ),
          );
        if (url.endsWith('/api/legal-entities'))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                legalEntities: [
                  {
                    id: 'entity-owner',
                    entityType: 'SOLE_TRADER',
                    legalName: 'Local Sole Trader',
                    tradingName: null,
                    status: 'ACTIVE',
                  },
                  {
                    id: 'entity-company',
                    entityType: 'LIMITED_COMPANY',
                    legalName: 'Taxi Limited',
                    tradingName: null,
                    status: 'ACTIVE',
                  },
                ],
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            ),
          );
        const body = url.endsWith('/api/auth/config')
          ? {
              environment: 'local',
              localHelper: true,
              demoHelper: false,
              turnstileRequired: false,
              turnstileSiteKey: null,
            }
          : url.includes('/dashboard?')
            ? {
                period: {
                  taxYear: '2027',
                  from: '2026-04-01',
                  to: '2027-03-31',
                  activityId: null,
                },
                financialTotals: [
                  {
                    currency: 'NZD',
                    recordedRevenueMinor: 115_000,
                    cashReceivedMinor: 57_500,
                    recordedExpensesMinor: 12_000,
                    netCashMovementMinor: 45_500,
                    incomeLessRecordedExpensesMinor: 103_000,
                  },
                ],
                spending: [
                  {
                    currency: 'NZD',
                    fuelSpendingMinor: 10_000,
                    parkingSpendingMinor: 2_000,
                    fuelLitres: 40,
                  },
                ],
                outstandingInvoices: [
                  {
                    currency: 'NZD',
                    invoiceCount: 1,
                    outstandingMinor: 57_500,
                  },
                ],
                review: {
                  totalRecords: 4,
                  unreviewedCount: 3,
                  missingInformationCount: 1,
                  readyForReviewCount: 1,
                },
                attention: {
                  missingReceiptCount: 2,
                  itemsToReviewCount: 3,
                  outstandingInvoiceCount: 1,
                },
                recentTransactions: [
                  {
                    id: 'income-recent',
                    businessId: 'business-activity-contracting',
                    recordType: 'INCOME',
                    subtype: 'CONTRACT',
                    transactionDate: '2026-09-09',
                    counterparty: 'Example Consulting Client',
                    totalAmountMinor: 115_000,
                    currency: 'NZD',
                    status: 'READY_FOR_REVIEW',
                  },
                ],
                platformActivities: [
                  {
                    activityId: 'activity-delivery',
                    activityName: 'Delivery Platform',
                    currency: 'NZD',
                    sessionCount: 1,
                    revenueSessionCount: 1,
                    revenueComplete: true,
                    durationHours: 2,
                    distanceKm: 50,
                    sessionRevenueMinor: 10_000,
                    revenuePerSessionMinor: 10_000,
                    revenuePerHourMinor: 5_000,
                    revenuePerKmMinor: 200,
                    fuelSpendingMinor: 2_000,
                    fuelLitres: 8,
                    parkingSpendingMinor: 500,
                    directOperatingCostMinor: 2_500,
                    fuelCostPerKmMinor: 40,
                    directOperatingContributionMinor: 7_500,
                    recordedPlatformIncomeMinor: 9_400,
                    allocatedInsuranceMinor: 1_000,
                  },
                ],
              }
            : /\/api\/businesses\/[^/]+\/expenses\/expense-local$/.test(url)
              ? {
                  expense: {
                    id: 'expense-local',
                    businessId: 'business-activity-contracting',
                    legalEntityId: 'entity-owner',
                    expenseType: 'GENERAL',
                    expenseCategoryId: 'category-software',
                    categoryName: 'Software',
                    merchantName: 'Officeworks',
                    purchaseDatetime: '2026-09-08T03:00:00.000Z',
                    totalAmountMinor: 8990,
                    currency: 'NZD',
                    gstAmountMinor: 1173,
                    gstStatus: 'GST_INCLUDED',
                    description: 'Office equipment',
                    recurrenceType: 'ONE_OFF',
                    status: 'NEW',
                    createdAt: '2026-09-08T03:00:00.000Z',
                    updatedAt: '2026-09-08T03:00:00.000Z',
                  },
                }
              : /\/api\/businesses\/[^/]+\/expenses$/.test(url)
                ? {
                    expenses: [
                      {
                        id: 'expense-local',
                        businessId: 'business-activity-contracting',
                        legalEntityId: 'entity-owner',
                        expenseType: 'GENERAL',
                        expenseCategoryId: 'category-software',
                        categoryName: 'Software',
                        merchantName: 'Officeworks',
                        purchaseDatetime: '2026-09-08T03:00:00.000Z',
                        totalAmountMinor: 8990,
                        currency: 'NZD',
                        status: 'NEW',
                        description: 'Office equipment',
                        createdAt: '2026-09-08T03:00:00.000Z',
                        updatedAt: '2026-09-08T03:00:00.000Z',
                      },
                      {
                        id: 'fuel-local',
                        businessId: 'business-activity-contracting',
                        legalEntityId: 'entity-owner',
                        expenseType: 'FUEL',
                        expenseCategoryId: 'category-fuel',
                        categoryName: 'Fuel',
                        merchantName: 'Harbour Fuel',
                        purchaseDatetime: '2026-09-07T03:00:00.000Z',
                        totalAmountMinor: 10000,
                        currency: 'NZD',
                        status: 'READY_FOR_REVIEW',
                        description: null,
                        createdAt: '2026-09-07T03:00:00.000Z',
                        updatedAt: '2026-09-07T03:00:00.000Z',
                      },
                    ],
                  }
                : url.endsWith('/api/exports/status')
                  ? {
                      backup: {
                        reminderDays: 30,
                        lastSuccessfulExportAt: null,
                        due: true,
                      },
                      exports: [],
                    }
                  : /\/api\/businesses\/[^/]+\/documents$/.test(url)
                    ? {
                        documents: [
                          {
                            id: 'document-local',
                            recordType: 'INCOME',
                            recordId: 'income-local',
                            originalFilename: 'invoice-101.pdf',
                            mimeType: 'application/pdf',
                            fileSize: 2048,
                            createdAt: '2026-09-08T03:00:00.000Z',
                            createdByEmail: 'owner@local.test',
                            recordLabel: 'Example Consulting Client',
                            recordDate: '2026-09-01',
                            recordStatus: 'READY_FOR_REVIEW',
                            downloadUrl:
                              '/api/attachments/file?id=document-local',
                          },
                        ],
                      }
                    : /\/api\/(?:businesses\/[^/]+\/)?(?:transactions|receipts)\?/.test(
                          url,
                        )
                      ? {
                          transactions: [
                            {
                              id: 'income-local',
                              businessId: 'business-activity-contracting',
                              legalEntityId: 'entity-owner',
                              recordType: 'INCOME',
                              subtype: 'CONTRACT',
                              transactionDate: '2026-09-01',
                              businessActivityId: 'activity-contracting',
                              activityName: 'IT Contracting',
                              counterparty: 'Example Consulting Client',
                              totalAmountMinor: 115_000,
                              currency: 'NZD',
                              status: 'READY_FOR_REVIEW',
                              categoryId: null,
                              categoryName: null,
                              vehicleId: null,
                              vehicleRegistration: null,
                              reviewedBy: null,
                              reviewerEmail: null,
                              reviewedAt: null,
                              attachmentCount: 0,
                            },
                          ],
                          summary: {
                            resultCount: 1,
                            missingAttachmentCount: 1,
                            unreviewedCount: 1,
                          },
                        }
                      : url.includes('/api/saved-filters?')
                        ? { savedFilters: [] }
                        : url.includes('/api/audit-log?')
                          ? {
                              auditEvents: [
                                {
                                  id: 'audit-1',
                                  action: 'RECORD_TRASHED',
                                  entityType: 'EXPENSE',
                                  entityId: 'expense-old',
                                  activityName: 'IT Contracting',
                                  summary: 'Record moved to trash.',
                                  createdAt: '2026-09-09T00:00:00.000Z',
                                  userEmail: 'owner@local.test',
                                  userId: 'owner-local',
                                  businessActivityId: 'activity-contracting',
                                },
                              ],
                            }
                          : url.endsWith('/api/trash')
                            ? {
                                trash: [
                                  {
                                    id: 'expense-old',
                                    recordType: 'EXPENSE',
                                    subtype: 'GENERAL',
                                    label: 'Archived software',
                                    recordDate: '2026-01-01',
                                    deletedAt: '2026-09-09T00:00:00.000Z',
                                    retentionUntil: '2036-03-31T23:59:59.999Z',
                                    purgeEligibleAt: '2036-03-31T23:59:59.999Z',
                                    purgeEligible: false,
                                    purgePending: false,
                                  },
                                ],
                              }
                            : url.endsWith('/api/retention-settings')
                              ? {
                                  retentionSettings: {
                                    retentionTaxYears: 10,
                                    taxYearEndMonth: 3,
                                    taxYearEndDay: 31,
                                    backupReminderDays: 30,
                                    updatedAt: '2026-09-09T00:00:00.000Z',
                                  },
                                }
                              : url.includes('/api/attachments?')
                                ? { attachments: [] }
                                : url.endsWith('/api/clients')
                                  ? {
                                      clients: [
                                        {
                                          id: 'client-local',
                                          name: 'Example Consulting Client',
                                          active: true,
                                          notes: null,
                                        },
                                      ],
                                    }
                                  : /\/api\/businesses\/[^/]+\/income\/income-local$/.test(
                                        url,
                                      )
                                    ? {
                                        incomeRecord: {
                                          id: 'income-local',
                                          businessId:
                                            'business-activity-contracting',
                                          legalEntityId: 'entity-owner',
                                          businessActivityId:
                                            'activity-contracting',
                                          activityName: 'IT Contracting',
                                          incomeType: 'CONTRACT',
                                          receivedFrom: null,
                                          transactionDate: '2026-09-01',
                                          totalAmountMinor: 115_000,
                                          currency: 'NZD',
                                          status: 'NEW',
                                          notes: null,
                                          details: {
                                            clientId: 'client-local',
                                            clientName:
                                              'Example Consulting Client',
                                            invoiceNumber: 'INV-101',
                                            invoiceDate: '2026-09-01',
                                            servicePeriodStart: null,
                                            servicePeriodEnd: null,
                                            subtotalMinor: 100_000,
                                            gstAmountMinor: 15_000,
                                            totalMinor: 115_000,
                                            dueDate: '2026-09-20',
                                            paymentReceivedDate: null,
                                            amountReceivedMinor: null,
                                            paymentStatus: 'ISSUED',
                                            outstandingAmountMinor: 115_000,
                                          },
                                          reconciliation: null,
                                        },
                                      }
                                    : /\/api\/businesses\/[^/]+\/income$/.test(
                                          url,
                                        )
                                      ? {
                                          incomeRecords: [
                                            {
                                              id: 'income-local',
                                              businessId:
                                                'business-activity-contracting',
                                              legalEntityId: 'entity-owner',
                                              businessActivityId:
                                                'activity-contracting',
                                              activityName: 'IT Contracting',
                                              incomeType: 'CONTRACT',
                                              receivedFrom: null,
                                              transactionDate: '2026-09-01',
                                              totalAmountMinor: 115_000,
                                              currency: 'NZD',
                                              status: 'NEW',
                                              notes: null,
                                              details: {
                                                clientId: 'client-local',
                                                clientName:
                                                  'Example Consulting Client',
                                                invoiceNumber: 'INV-101',
                                                invoiceDate: '2026-09-01',
                                                servicePeriodStart: null,
                                                servicePeriodEnd: null,
                                                subtotalMinor: 100_000,
                                                gstAmountMinor: 15_000,
                                                totalMinor: 115_000,
                                                dueDate: '2026-09-20',
                                                paymentReceivedDate: null,
                                                amountReceivedMinor: null,
                                                paymentStatus: 'ISSUED',
                                                outstandingAmountMinor: 115_000,
                                              },
                                              reconciliation: null,
                                            },
                                          ],
                                          summary: {
                                            recordCount: 1,
                                            totalsByCurrency: [
                                              {
                                                currency: 'NZD',
                                                totalAmountMinor: 115_000,
                                              },
                                            ],
                                          },
                                        }
                                      : url.endsWith('/api/insurance-records')
                                        ? {
                                            insuranceRecords: [
                                              {
                                                id: 'insurance-local',
                                                businessActivityId:
                                                  'activity-contracting',
                                                activityName: 'IT Contracting',
                                                provider: 'Secure Cover',
                                                purchaseDatetime:
                                                  '2026-09-08T00:00:00.000Z',
                                                premiumMinor: 20_000,
                                                currency: 'NZD',
                                                gstAmountMinor: null,
                                                gstStatus: 'NO_GST',
                                                description: null,
                                                recurrenceType: 'RECURRING',
                                                insuranceType:
                                                  'PROFESSIONAL_LIABILITY',
                                                policyNumber: 'POL-1',
                                                policyPeriodStart: '2026-04-01',
                                                policyPeriodEnd: '2027-03-31',
                                                vehicleId: null,
                                                vehicleRegistration: null,
                                                allocation: {
                                                  method:
                                                    '100_PERCENT_BUSINESS',
                                                  percentageBasisPoints: 10000,
                                                  allocatedAmountMinor: 20_000,
                                                  calculationPeriodStart: null,
                                                  calculationPeriodEnd: null,
                                                  notes: null,
                                                  reviewerEmail: null,
                                                },
                                              },
                                            ],
                                          }
                                        : url.endsWith('/api/parking-records')
                                          ? { parkingRecords: [] }
                                          : url.endsWith(
                                                '/api/general-expenses',
                                              )
                                            ? { generalExpenses: [] }
                                            : url.endsWith(
                                                  '/api/expense-categories',
                                                )
                                              ? {
                                                  categories: [
                                                    {
                                                      id: 'category-software',
                                                      name: 'Software',
                                                      active: true,
                                                      systemKey: 'SOFTWARE',
                                                    },
                                                  ],
                                                }
                                              : url.endsWith(
                                                    '/api/business-activities',
                                                  )
                                                ? {
                                                    activities: [
                                                      {
                                                        id: 'activity-contracting',
                                                        name: 'IT Contracting',
                                                        activityType:
                                                          'PROFESSIONAL_SERVICES',
                                                        active: true,
                                                        startedAt: '2025-04-01',
                                                        endedAt: null,
                                                      },
                                                    ],
                                                  }
                                                : url.endsWith('/api/vehicles')
                                                  ? {
                                                      vehicles: [
                                                        {
                                                          id: 'vehicle-local',
                                                          registration:
                                                            'ABC123',
                                                          description:
                                                            'Work vehicle',
                                                          active: true,
                                                          acquiredAt:
                                                            '2025-01-01',
                                                          retiredAt: null,
                                                          notes: null,
                                                        },
                                                      ],
                                                    }
                                                  : url.endsWith(
                                                        '/api/fuel-records',
                                                      )
                                                    ? {
                                                        fuelRecords: [
                                                          {
                                                            id: 'fuel-local',
                                                            businessActivityId:
                                                              'activity-contracting',
                                                            activityName:
                                                              'IT Contracting',
                                                            vehicleId:
                                                              'vehicle-local',
                                                            vehicleRegistration:
                                                              'ABC123',
                                                            merchantName:
                                                              'Harbour Fuel',
                                                            purchaseDatetime:
                                                              '2026-09-08T03:00:00.000Z',
                                                            totalAmountMinor: 10_000,
                                                            currency: 'NZD',
                                                            gstAmountMinor:
                                                              null,
                                                            gstStatus:
                                                              'UNKNOWN',
                                                            description: null,
                                                            recurrenceType:
                                                              'ONE_OFF',
                                                            fuelStation: null,
                                                            fuelPriceMicrosPerLitre: 2_500_000,
                                                            fuelLitres: 40,
                                                            odometerKm: 150,
                                                            fillType: 'FULL',
                                                            notes: null,
                                                          },
                                                        ],
                                                      }
                                                    : /\/api\/businesses\/[^/]+\/work-sessions\/session-local$/.test(
                                                          url,
                                                        )
                                                      ? {
                                                          session: {
                                                            id: 'session-local',
                                                            businessId:
                                                              'business-activity-contracting',
                                                            legalEntityId:
                                                              'entity-owner',
                                                            businessActivityId:
                                                              'activity-contracting',
                                                            activityName:
                                                              'IT Contracting',
                                                            vehicleId:
                                                              'vehicle-local',
                                                            vehicleRegistration:
                                                              'ABC123',
                                                            startedAt:
                                                              '2026-09-08T00:00:00.000Z',
                                                            endedAt:
                                                              '2026-09-08T02:00:00.000Z',
                                                            odometerStartKm: 100,
                                                            odometerEndKm: 150,
                                                            distanceKm: 50,
                                                            durationMinutes: 120,
                                                            durationHours: 2,
                                                            grossRevenueMinor: 10_000,
                                                            currency: 'NZD',
                                                            revenuePerHourMinor: 5000,
                                                            revenuePerKmMinor: 200,
                                                            notes:
                                                              'Airport delivery block',
                                                            status: 'NEW',
                                                            tankFullAtStart: true,
                                                            noPersonalDriving: true,
                                                            tankFullAtEnd: true,
                                                            startingFuelExpenseId:
                                                              null,
                                                            endingFuelExpenseId:
                                                              'fuel-local',
                                                            fuelCalculationStatus:
                                                              'EXACT',
                                                            fuelLitresUsed: 40,
                                                            fuelCostMinor: 10_000,
                                                            fuelCurrency: 'NZD',
                                                            kilometresPerLitre: 1.25,
                                                            fuelCostPerKmMinor: 200,
                                                          },
                                                        }
                                                      : /\/api\/(?:businesses\/[^/]+\/)?work-sessions$/.test(
                                                            url,
                                                          )
                                                        ? {
                                                            sessions: [
                                                              {
                                                                id: 'session-local',
                                                                businessActivityId:
                                                                  'activity-contracting',
                                                                activityName:
                                                                  'IT Contracting',
                                                                vehicleId:
                                                                  'vehicle-local',
                                                                vehicleRegistration:
                                                                  'ABC123',
                                                                startedAt:
                                                                  '2026-09-08T00:00:00.000Z',
                                                                endedAt:
                                                                  '2026-09-08T02:00:00.000Z',
                                                                odometerStartKm: 100,
                                                                odometerEndKm: 150,
                                                                distanceKm: 50,
                                                                durationMinutes: 120,
                                                                durationHours: 2,
                                                                grossRevenueMinor: 10_000,
                                                                currency: 'NZD',
                                                                revenuePerHourMinor: 5000,
                                                                revenuePerKmMinor: 200,
                                                                notes: null,
                                                                status: 'NEW',
                                                                tankFullAtStart: true,
                                                                noPersonalDriving: true,
                                                                tankFullAtEnd: true,
                                                                startingFuelExpenseId:
                                                                  null,
                                                                endingFuelExpenseId:
                                                                  'fuel-local',
                                                                fuelCalculationStatus:
                                                                  'EXACT',
                                                                fuelLitresUsed: 40,
                                                                fuelCostMinor: 10_000,
                                                                fuelCurrency:
                                                                  'NZD',
                                                                kilometresPerLitre: 1.25,
                                                                fuelCostPerKmMinor: 200,
                                                              },
                                                            ],
                                                            summary: {
                                                              sessionCount: 1,
                                                              totalDurationHours: 2,
                                                              totalDistanceKm: 50,
                                                              totalRevenueMinor: 10_000,
                                                              revenuePerHourMinor: 5000,
                                                              revenuePerKmMinor: 200,
                                                              currency: 'NZD',
                                                              completeRevenueData: true,
                                                            },
                                                          }
                                                        : {
                                                            user: {
                                                              id: 'owner',
                                                              email:
                                                                'owner@local.test',
                                                              role: currentRole,
                                                              status: 'ACTIVE',
                                                            },
                                                          };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders the dashboard route', async () => {
    renderApp('/app/businesses/business-activity-contracting');

    expect(
      await screen.findByRole('heading', {
        name: 'IT Contracting',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Local Sole Trader \(Sole trader\)/),
    ).toBeInTheDocument();
    expect(await screen.findByText('Net cash movement')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Needs attention' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 missing receipts')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Recent transactions' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Example Consulting Client')).toBeInTheDocument();
    expect(
      screen.queryByText('Direct operating contribution'),
    ).not.toBeInTheDocument();
  });

  it('separates account and business navigation contexts', async () => {
    const account = renderApp('/app/businesses');
    expect(
      await screen.findByRole('heading', { name: 'My businesses' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Current business')).not.toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Account navigation' }),
    ).toBeInTheDocument();
    expect(await screen.findAllByText('Local Sole Trader')).toHaveLength(2);
    expect(screen.getByText('64 records')).toBeInTheDocument();
    expect(screen.getAllByText('Sole trader')).toHaveLength(2);
    account.unmount();

    renderApp('/app/businesses/business-activity-contracting/expenses');
    expect(await screen.findByLabelText('Current business')).toHaveValue(
      'business-activity-contracting',
    );
    expect(
      screen.getByRole('navigation', {
        name: 'IT Contracting navigation',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Mobile navigation' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Expenses' })[0],
    ).toHaveAttribute('aria-current', 'page');
  });

  it('keeps secondary destinations reachable from mobile More pages', async () => {
    const businessMore = renderApp(
      '/app/businesses/business-activity-contracting/more',
    );

    expect(
      await screen.findByRole('heading', { name: 'More' }),
    ).toBeInTheDocument();
    const businessMorePage = screen
      .getByRole('heading', { name: 'More' })
      .closest('section')!;
    expect(
      within(businessMorePage).getByRole('link', { name: /Documents/ }),
    ).toHaveAttribute(
      'href',
      '/app/businesses/business-activity-contracting/documents',
    );
    expect(
      within(businessMorePage).getByRole('link', {
        name: /Business settings/,
      }),
    ).toHaveAttribute(
      'href',
      '/app/businesses/business-activity-contracting/settings',
    );
    const mobileNavigation = screen.getByRole('navigation', {
      name: 'Mobile navigation',
    });
    expect(mobileNavigation.querySelectorAll('a')).toHaveLength(4);
    expect(
      mobileNavigation.querySelector('a[aria-current="page"]'),
    ).toHaveTextContent('More');
    businessMore.unmount();

    renderApp('/app/more');
    expect(
      await screen.findByRole('heading', { name: 'More' }),
    ).toBeInTheDocument();
    const accountMorePage = screen
      .getByRole('heading', { name: 'More' })
      .closest('section')!;
    expect(
      within(accountMorePage).getByRole('link', {
        name: /Reports and exports/,
      }),
    ).toHaveAttribute('href', '/app/reports');
    expect(
      within(accountMorePage).getByRole('link', {
        name: /Account settings/,
      }),
    ).toHaveAttribute('href', '/app/settings/account');
  });

  it('groups the accountant workspace by legal entity and business', async () => {
    currentRole = 'ACCOUNTANT';
    renderApp('/app/accountant');

    expect(
      await screen.findByRole('heading', { name: 'Accountant view' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Local Sole Trader' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 businesses')).toBeInTheDocument();
    expect(screen.getByText('192 records')).toBeInTheDocument();
    expect(screen.getByText('9 items awaiting review')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review entity' })).toHaveAttribute(
      'href',
      '/app/transactions?legalEntityId=entity-owner&review=UNREVIEWED',
    );

    fireEvent.click(screen.getByRole('button', { name: 'By business' }));
    expect(screen.getByText('8 items awaiting review')).toBeInTheDocument();
    expect(screen.getByText('2 missing receipts')).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Review records' })[0],
    ).toHaveAttribute(
      'href',
      '/app/businesses/business-activity-contracting/transactions?review=UNREVIEWED',
    );
  });

  it('returns safely to My businesses when business access is unavailable', async () => {
    renderApp('/app/businesses/business-no-longer-accessible');
    expect(
      await screen.findByRole('heading', { name: 'My businesses' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Current business')).not.toBeInTheDocument();
  });

  it('offers monthly, tax-year, and full portable exports', async () => {
    renderApp('/app/reports');
    expect(
      await screen.findByRole('heading', {
        name: /exports and local backup/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/export scope/i)).toHaveValue('MONTH');
    expect(
      screen.getByRole('link', { name: /download portable zip/i }),
    ).toHaveAttribute('href', expect.stringContaining('scope=MONTH'));
    expect(
      screen.getByText(/same period can be downloaded again/i),
    ).toBeInTheDocument();
  });

  it('renders a not-found page for unknown routes', async () => {
    renderApp('/app/missing');

    expect(
      await screen.findByRole('heading', { name: /page not found/i }),
    ).toBeInTheDocument();
  });

  it('redirects business settings to one focused details form', async () => {
    renderApp('/app/businesses/business-activity-contracting/settings');

    expect(
      await screen.findByRole('heading', {
        name: 'Details',
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Business name')).toHaveValue(
      'IT Contracting',
    );
    expect(screen.getByLabelText('Default currency')).toHaveValue('NZD');
    expect(
      screen.queryByRole('heading', { name: 'Business activities' }),
    ).not.toBeInTheDocument();
  });

  it('renders each reference manager on its own settings page', async () => {
    renderApp(
      '/app/businesses/business-activity-contracting/settings/activities',
    );

    expect(
      await screen.findByRole('heading', { name: 'IT Contracting' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /add activity/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Vehicles' }),
    ).not.toBeInTheDocument();
  });

  it('keeps focused business settings read-only for accountants', async () => {
    currentRole = 'ACCOUNTANT';
    renderApp(
      '/app/businesses/business-activity-contracting/settings/activities',
    );

    expect(
      await screen.findByText(/only the owner can change them/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /add activity/i }),
    ).not.toBeInTheDocument();
  });

  it('shows legal-entity operating periods without changing history', async () => {
    renderApp(
      '/app/businesses/business-activity-contracting/settings/legal-entity',
    );

    expect(
      await screen.findByRole('heading', { name: 'Legal entity' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Local Sole Trader')).toBeInTheDocument();
    expect(screen.getByText('Sole trader')).toBeInTheDocument();
    expect(
      screen.getByText(/historical records remain with the original entity/i),
    ).toBeInTheDocument();
  });

  it('guides an owner through a confirmed legal-entity period change', async () => {
    renderApp(
      '/app/businesses/business-activity-contracting/settings/legal-entity/change',
    );

    fireEvent.change(await screen.findByLabelText('New legal entity'), {
      target: { value: 'entity-company' },
    });
    fireEvent.change(screen.getByLabelText('Effective from'), {
      target: { value: '2027-04-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByRole('heading', { name: 'Transfer information' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Notes (optional)'), {
      target: { value: 'Company takes over operations.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByRole('heading', { name: 'Confirm' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Taxi Limited — Limited company'),
    ).toBeInTheDocument();
    expect(screen.getByText('01 Apr 2027')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));

    expect(
      await screen.findByText('Legal-entity operating period added.'),
    ).toBeInTheDocument();
  });

  it('renders calculated mileage and owner entry controls', async () => {
    renderApp('/app/businesses/business-activity-contracting/mileage');

    expect(
      await screen.findByRole('heading', { name: 'Mileage' }),
    ).toBeInTheDocument();
    expect(await screen.findAllByText('50 km')).toHaveLength(2);
    expect(await screen.findByText('ABC123')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /add work session/i }),
    ).toHaveAttribute(
      'href',
      '/app/businesses/business-activity-contracting/mileage/new',
    );
    expect(document.querySelector('form')).not.toBeInTheDocument();
  });

  it('renders a list-first expense workflow with subtype filters', async () => {
    renderApp('/app/businesses/business-activity-contracting/expenses');
    expect(
      await screen.findByRole('heading', { name: 'Expenses' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Officeworks')).toBeInTheDocument();
    expect(screen.getByText('Harbour Fuel')).toBeInTheDocument();
    expect(screen.getByLabelText('Expense type')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add expense' })).toHaveAttribute(
      'href',
      '/app/businesses/business-activity-contracting/expenses/new',
    );
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('keeps mileage entry read-only for accountants', async () => {
    currentRole = 'ACCOUNTANT';
    renderApp('/app/businesses/business-activity-contracting/mileage');

    expect(
      await screen.findByRole('heading', { name: 'Mileage' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('ABC123')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /add work session/i }),
    ).not.toBeInTheDocument();
  });

  it('renders one dedicated work-session form without editable business identity', async () => {
    renderApp('/app/businesses/business-activity-contracting/mileage/new');
    expect(
      await screen.findByRole('heading', { name: 'Add work session' }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('Vehicle')).toBeInTheDocument();
    expect(document.querySelectorAll('form')).toHaveLength(1);
    expect(
      screen.queryByLabelText(/business activity/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/legal entity/i)).not.toBeInTheDocument();
  });

  it('renders work-session detail separately from editing', async () => {
    renderApp(
      '/app/businesses/business-activity-contracting/mileage/session-local',
    );
    expect(
      await screen.findByRole('heading', { name: 'ABC123 · 50 km' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Airport delivery block')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit session' })).toHaveAttribute(
      'href',
      '/app/businesses/business-activity-contracting/mileage/session-local/edit',
    );
  });

  it('renders one dedicated expense form without editable business identity', async () => {
    renderApp('/app/businesses/business-activity-contracting/expenses/new');
    expect(
      await screen.findByRole('heading', { name: 'Add expense' }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('Expense type')).toBeInTheDocument();
    expect(document.querySelectorAll('form')).toHaveLength(1);
    expect(
      screen.queryByLabelText(/business activity/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/legal entity/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Local Sole Trader is derived by date/),
    ).toBeInTheDocument();
  });

  it('confirms before a business switch discards an unfinished expense', async () => {
    renderApp('/app/businesses/business-activity-contracting/expenses/new');
    expect(
      await screen.findByRole('heading', { name: 'Add expense' }),
    ).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Merchant'), {
      target: { value: 'Unsaved supplier' },
    });

    fireEvent.change(screen.getByLabelText('Current business'), {
      target: { value: 'business-activity-delivery' },
    });
    expect(
      screen.getByRole('dialog', { name: 'Discard unsaved changes?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stay on page' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Stay on page' }));
    expect(
      screen.getByRole('heading', { name: 'Add expense' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Current business')).toHaveValue(
      'business-activity-contracting',
    );

    fireEvent.change(screen.getByLabelText('Current business'), {
      target: { value: 'business-activity-delivery' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Leave without saving' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Delivery Platform' }),
    ).toBeInTheDocument();
  });

  it('renders expense detail separately from editing', async () => {
    renderApp(
      '/app/businesses/business-activity-contracting/expenses/expense-local',
    );
    expect(
      await screen.findByRole('heading', { name: 'Officeworks' }),
    ).toBeInTheDocument();
    expect(screen.getByText('$89.90')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Edit expense' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('keeps expense creation owner-only', async () => {
    currentRole = 'ACCOUNTANT';
    renderApp('/app/businesses/business-activity-contracting/expenses');
    expect(
      await screen.findByRole('heading', { name: 'Expenses' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Add expense' }),
    ).not.toBeInTheDocument();
  });

  it('renders income as a list-first business workspace', async () => {
    renderApp('/app/businesses/business-activity-contracting/income');
    expect(
      await screen.findByRole('heading', { name: /^income$/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/INV-101/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /add income/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Search')).toHaveAttribute(
      'placeholder',
      'Source, invoice number or notes',
    );
    expect(screen.getByLabelText('Income type')).toBeInTheDocument();
    expect(screen.getByLabelText('Received on or after')).toBeInTheDocument();
    expect(screen.getByLabelText('Record status')).toBeInTheDocument();
    expect(document.querySelector('form')).not.toBeInTheDocument();
  });

  it('renders income detail with reconciliation and attachments', async () => {
    renderApp(
      '/app/businesses/business-activity-contracting/income/income-local',
    );
    expect(
      await screen.findByRole('heading', {
        name: /Example Consulting Client.*INV-101/i,
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /reconcile/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/choose existing photo or pdf/i),
    ).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp,application/pdf',
    );
  });

  it('keeps income source records read-only for accountants', async () => {
    currentRole = 'ACCOUNTANT';
    renderApp('/app/businesses/business-activity-contracting/income');
    expect(
      await screen.findByRole('heading', { name: /^income$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /add income/i }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText(/INV-101/)).toBeInTheDocument();
  });

  it('renders one progressive income form with fixed business identity', async () => {
    renderApp('/app/businesses/business-activity-contracting/income/new');
    expect(
      await screen.findByRole('heading', { name: 'Add income' }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('Income type')).toBeInTheDocument();
    expect(document.querySelectorAll('form')).toHaveLength(1);
    expect(
      screen.queryByLabelText('Business activity'),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/legal entity/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Local Sole Trader is derived by date/),
    ).toBeInTheDocument();
  });

  it('renders the simplified business transaction workspace', async () => {
    renderApp('/app/businesses/business-activity-contracting/transactions');
    expect(
      await screen.findByRole('heading', {
        name: /^transactions$/i,
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('group', { name: 'Filter actions' }),
    ).toContainElement(screen.getByRole('button', { name: 'Search' }));
    expect(
      screen.getByRole('group', { name: 'Filter actions' }),
    ).toContainElement(screen.getByRole('button', { name: 'Clear' }));
    expect(
      await screen.findByText('Example Consulting Client'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/search transactions/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /receipt log/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /review and comments/i }),
    ).toBeInTheDocument();
  });

  it('renders business documents and missing-evidence navigation', async () => {
    renderApp('/app/businesses/business-activity-contracting/documents');
    expect(
      await screen.findByRole('heading', { name: 'Documents' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('invoice-101.pdf')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /missing attachments \(1\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'invoice-101.pdf' }),
    ).toHaveAttribute('href', '/api/attachments/file?id=document-local');
  });

  it('shows retention-protected trash and read-only audit history', async () => {
    renderApp('/app/businesses/business-activity-contracting/governance');
    expect(
      await screen.findByRole('heading', {
        name: /audit, trash, and retention/i,
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Archived software')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /permanently purge/i }),
    ).toBeDisabled();
    expect(
      await screen.findByText('Record moved to trash.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/retention tax years/i)).toHaveValue(10);
  });

  it('consumes a login link only once under strict effects', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '*',
          element: (
            <AuthProvider>
              <App />
            </AuthProvider>
          ),
        },
      ],
      { initialEntries: ['/verify-login?token=single-use'] },
    );
    render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );

    expect(await screen.findByText(/signed in/i)).toBeInTheDocument();
    const fetchMock = vi.mocked(fetch);
    const verificationCalls = fetchMock.mock.calls.filter(([input]) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      return url.endsWith('/api/auth/verify');
    });
    expect(verificationCalls).toHaveLength(1);
  });
});
