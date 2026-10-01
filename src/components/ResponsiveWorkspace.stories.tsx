import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShellPresentation, MobileBottomNav } from './AppShell';
import { BusinessCard } from './BusinessCard';
import { BusinessSwitcher as BusinessSwitcherComponent } from './BusinessSwitcher';
import { DashboardMetricCard } from './DashboardMetricCard';
import {
  AccountantEntityCard,
  BusinessContextBadge,
  EntityBadge,
  ExpenseFilterBar,
  ExpenseTable,
  OperatingPeriodsTable,
} from './WorkspacePatterns';
import type { BusinessSummary } from '../features/business/BusinessDirectoryContext';
import type { BusinessExpense } from '../features/expenses/businessExpense';
import { GeneralExpenseForm } from '../features/expenses/ExpenseForms';
import { emptyExpenseDraft } from '../features/expenses/expenseModel';

const soleTrader = {
  id: 'entity-owner',
  entityType: 'SOLE_TRADER',
  legalName: 'Brian Ho',
  tradingName: null,
  status: 'ACTIVE',
  attributionReviewRequired: false,
} as const;

const taxiCompany = {
  id: 'entity-taxi',
  entityType: 'LIMITED_COMPANY',
  legalName: 'Taxi Limited',
  tradingName: null,
  status: 'ACTIVE',
  attributionReviewRequired: false,
} as const;

const businesses: BusinessSummary[] = [
  {
    id: 'business-delivery',
    name: 'Uber Eats',
    description: 'Food delivery',
    businessType: 'PLATFORM_SERVICES',
    defaultCurrency: 'NZD',
    status: 'ACTIVE',
    legacyBusinessActivityId: 'activity-delivery',
    currentLegalEntity: soleTrader,
    recordCount: 128,
    awaitingReviewCount: 8,
    missingReceiptCount: 2,
    lastRecordUpdatedAt: '2026-09-09T00:00:00.000Z',
  },
  {
    id: 'business-contracting',
    name: 'IT Contracting',
    description: 'IT services',
    businessType: 'PROFESSIONAL_SERVICES',
    defaultCurrency: 'NZD',
    status: 'ACTIVE',
    legacyBusinessActivityId: 'activity-contracting',
    currentLegalEntity: soleTrader,
    recordCount: 64,
    awaitingReviewCount: 1,
    missingReceiptCount: 0,
    lastRecordUpdatedAt: '2026-09-06T00:00:00.000Z',
  },
];

const expenses: BusinessExpense[] = [
  {
    id: 'expense-fuel',
    businessId: 'business-delivery',
    legalEntityId: soleTrader.id,
    expenseType: 'FUEL',
    expenseCategoryId: 'fuel',
    categoryName: 'Fuel',
    merchantName: 'Z Energy',
    purchaseDatetime: '2026-09-12T08:30:00.000Z',
    totalAmountMinor: 6720,
    currency: 'NZD',
    description: 'Delivery shift fuel',
    status: 'READY_FOR_REVIEW',
    createdAt: '2026-09-12T08:30:00.000Z',
    updatedAt: '2026-09-12T08:30:00.000Z',
  },
  {
    id: 'expense-supplies',
    businessId: 'business-delivery',
    legalEntityId: soleTrader.id,
    expenseType: 'GENERAL',
    expenseCategoryId: 'supplies',
    categoryName: 'Equipment',
    merchantName: 'Officeworks',
    purchaseDatetime: '2026-09-02T01:00:00.000Z',
    totalAmountMinor: 8990,
    currency: 'NZD',
    description: 'Phone mount and charging cable',
    status: 'NEW',
    createdAt: '2026-09-02T01:00:00.000Z',
    updatedAt: '2026-09-02T01:00:00.000Z',
  },
];

const navigation = [
  { to: '/dashboard', label: 'Dashboard', icon: '⌂', end: true },
  { to: '/transactions', label: 'Transactions', icon: '▤' },
  { to: '/expenses', label: 'Expenses', icon: '▣' },
  { to: '/income', label: 'Income', icon: '$' },
  { to: '/mileage', label: 'Mileage', icon: '◇' },
  { to: '/documents', label: 'Documents', icon: '▧' },
];

const meta = {
  title: 'Workspace/Responsive patterns',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const AppShell: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  render: () => (
    <AppShellPresentation
      contextLabel="Uber Eats"
      contextControl={
        <BusinessSwitcherComponent
          businesses={businesses}
          value="business-delivery"
          onChange={() => undefined}
        />
      }
      mobileNavigation={navigation.slice(0, 4)}
      navigation={navigation}
      secondaryNavigation={[
        { to: '/settings', label: 'Business settings', icon: '⚙' },
      ]}
      onLogout={() => undefined}
      userEmail="owner@example.test"
    >
      <section aria-labelledby="story-dashboard-heading">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Business dashboard</span>
            <h1 id="story-dashboard-heading">Uber Eats</h1>
            <p>Food delivery · Brian Ho (Sole trader)</p>
          </div>
          <a className="button-link" href="#add-expense">
            Add expense
          </a>
        </div>
        <div className="dashboard-metrics">
          <DashboardMetricCard label="Revenue" value="$12,450" note="NZD" />
          <DashboardMetricCard label="Expenses" value="$4,230" note="NZD" />
          <DashboardMetricCard
            label="Net cash movement"
            value="$8,220"
            note="Income received less expenses"
          />
        </div>
      </section>
    </AppShellPresentation>
  ),
};

export const BusinessSwitcher: Story = {
  render: () => (
    <BusinessSwitcherComponent
      businesses={businesses}
      value="business-delivery"
      onChange={() => undefined}
    />
  ),
};

export const MyBusinessCard: Story = {
  render: () => (
    <div style={{ maxWidth: '34rem' }}>
      <BusinessCard business={businesses[0]} />
    </div>
  ),
};

export const BusinessContext: Story = {
  render: () => (
    <BusinessContextBadge businessName="Uber Eats" entity={soleTrader} />
  ),
};

export const LegalEntityBadge: Story = {
  render: () => <EntityBadge entity={taxiCompany} />,
};

export const SummaryCard: Story = {
  render: () => (
    <div className="story-metric-grid">
      <DashboardMetricCard
        label="Net cash movement"
        value="$8,220.00"
        note="Cash received less recorded expenses"
      />
    </div>
  ),
};

export const ExpenseTableDesktop: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  render: () => (
    <ExpenseTable businessId="business-delivery" expenses={expenses} />
  ),
};

export const MobileExpenseList: Story = {
  globals: { viewport: { value: 'phonePortrait', isRotated: false } },
  render: () => (
    <ExpenseTable businessId="business-delivery" expenses={expenses} />
  ),
};

function FilterBarExample() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  return (
    <ExpenseFilterBar
      categories={['Equipment', 'Fuel']}
      category={category}
      dateFrom={dateFrom}
      query={query}
      status={status}
      type={type}
      onCategoryChange={setCategory}
      onDateFromChange={setDateFrom}
      onQueryChange={setQuery}
      onStatusChange={setStatus}
      onTypeChange={setType}
    />
  );
}

export const FilterBar: Story = { render: () => <FilterBarExample /> };

export const AddExpenseForm: Story = {
  globals: { viewport: { value: 'phonePortrait', isRotated: false } },
  render: () => (
    <section className="panel focused-form-panel">
      <GeneralExpenseForm
        activities={[]}
        categories={[
          { id: 'fuel', label: 'Fuel', active: true },
          { id: 'equipment', label: 'Equipment', active: true },
        ]}
        initial={emptyExpenseDraft()}
        showActivity={false}
        submitLabel="Save expense"
        onSubmit={() => Promise.resolve()}
      />
    </section>
  ),
};

export const OperatingPeriods: Story = {
  globals: { viewport: { value: 'tabletPortrait', isRotated: false } },
  render: () => (
    <OperatingPeriodsTable
      periods={[
        {
          id: 'period-one',
          effectiveFrom: '2026-04-01',
          effectiveTo: '2027-03-31',
          entityName: 'Brian Ho',
          entityType: 'Sole trader',
        },
        {
          id: 'period-two',
          effectiveFrom: '2027-04-01',
          effectiveTo: null,
          entityName: 'Taxi Limited',
          entityType: 'Limited company',
        },
      ]}
    />
  ),
};

export const AccountantEntity: Story = {
  globals: { viewport: { value: 'tabletLandscape', isRotated: false } },
  render: () => (
    <div style={{ maxWidth: '48rem' }}>
      <AccountantEntityCard entity={soleTrader} businesses={businesses} />
    </div>
  ),
};

export const MobileBottomNavigation: Story = {
  globals: { viewport: { value: 'phonePortrait', isRotated: false } },
  render: () => (
    <div style={{ minHeight: '12rem' }}>
      <MobileBottomNav items={navigation.slice(0, 4)} />
    </div>
  ),
};
