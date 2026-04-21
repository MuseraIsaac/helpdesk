/**
 * Software License & SaaS Subscription — constants, domain types, and label maps.
 *
 * Shared between server (route handlers) and client (display, filtering).
 * All enum values mirror the Prisma schema enums.
 */

// ── Software License ──────────────────────────────────────────────────────────

export type SoftwareLicenseType =
  | "perpetual"
  | "subscription"
  | "oem"
  | "academic"
  | "trial"
  | "open_source"
  | "volume"
  | "site_license"
  | "concurrent"
  | "other";

export type SoftwareLicenseStatus =
  | "active"
  | "expired"
  | "pending"
  | "suspended"
  | "revoked"
  | "trial";

export type SoftwarePlatform =
  | "windows"
  | "mac"
  | "linux"
  | "cross_platform"
  | "web"
  | "mobile"
  | "other";

export const SOFTWARE_LICENSE_TYPES: SoftwareLicenseType[] = [
  "perpetual", "subscription", "oem", "academic", "trial",
  "open_source", "volume", "site_license", "concurrent", "other",
];

export const SOFTWARE_LICENSE_STATUSES: SoftwareLicenseStatus[] = [
  "active", "trial", "pending", "suspended", "revoked", "expired",
];

export const SOFTWARE_PLATFORMS: SoftwarePlatform[] = [
  "windows", "mac", "linux", "cross_platform", "web", "mobile", "other",
];

export const SOFTWARE_LICENSE_TYPE_LABEL: Record<SoftwareLicenseType, string> = {
  perpetual:    "Perpetual",
  subscription: "Subscription",
  oem:          "OEM",
  academic:     "Academic",
  trial:        "Trial",
  open_source:  "Open Source",
  volume:       "Volume",
  site_license: "Site License",
  concurrent:   "Concurrent",
  other:        "Other",
};

export const SOFTWARE_LICENSE_STATUS_LABEL: Record<SoftwareLicenseStatus, string> = {
  active:    "Active",
  expired:   "Expired",
  pending:   "Pending",
  suspended: "Suspended",
  revoked:   "Revoked",
  trial:     "Trial",
};

export const SOFTWARE_LICENSE_STATUS_COLOR: Record<SoftwareLicenseStatus, string> = {
  active:    "bg-emerald-50  text-emerald-700  border-emerald-200  dark:bg-emerald-900/30  dark:text-emerald-300",
  trial:     "bg-sky-50      text-sky-700      border-sky-200      dark:bg-sky-900/30      dark:text-sky-300",
  pending:   "bg-amber-50    text-amber-700    border-amber-200    dark:bg-amber-900/30    dark:text-amber-300",
  suspended: "bg-orange-50   text-orange-700   border-orange-200   dark:bg-orange-900/30   dark:text-orange-300",
  revoked:   "bg-red-50      text-red-700      border-red-200      dark:bg-red-900/30      dark:text-red-300",
  expired:   "bg-muted       text-muted-foreground border-muted-foreground/20",
};

export const SOFTWARE_PLATFORM_LABEL: Record<SoftwarePlatform, string> = {
  windows:       "Windows",
  mac:           "macOS",
  linux:         "Linux",
  cross_platform: "Cross-Platform",
  web:           "Web",
  mobile:        "Mobile",
  other:         "Other",
};

// ── SaaS Subscription ─────────────────────────────────────────────────────────

export type SaaSCategory =
  | "identity"
  | "collaboration"
  | "project_management"
  | "crm"
  | "devtools"
  | "security"
  | "hr"
  | "finance"
  | "communication"
  | "productivity"
  | "analytics"
  | "design"
  | "marketing"
  | "storage"
  | "monitoring"
  | "other";

export type SaaSBillingCycle =
  | "monthly"
  | "annual"
  | "multi_year"
  | "one_time"
  | "usage_based";

export type SaaSSubscriptionStatus =
  | "active"
  | "trial"
  | "pending"
  | "suspended"
  | "cancelled"
  | "expired";

export const SAAS_CATEGORIES: SaaSCategory[] = [
  "identity", "collaboration", "project_management", "crm", "devtools",
  "security", "hr", "finance", "communication", "productivity",
  "analytics", "design", "marketing", "storage", "monitoring", "other",
];

export const SAAS_BILLING_CYCLES: SaaSBillingCycle[] = [
  "monthly", "annual", "multi_year", "one_time", "usage_based",
];

export const SAAS_SUBSCRIPTION_STATUSES: SaaSSubscriptionStatus[] = [
  "active", "trial", "pending", "suspended", "cancelled", "expired",
];

export const SAAS_CATEGORY_LABEL: Record<SaaSCategory, string> = {
  identity:           "Identity & Access",
  collaboration:      "Collaboration",
  project_management: "Project Management",
  crm:                "CRM",
  devtools:           "Developer Tools",
  security:           "Security",
  hr:                 "HR & People",
  finance:            "Finance & Accounting",
  communication:      "Communication",
  productivity:       "Productivity",
  analytics:          "Analytics & BI",
  design:             "Design & Creative",
  marketing:          "Marketing",
  storage:            "Storage & Backup",
  monitoring:         "Monitoring & Ops",
  other:              "Other",
};

export const SAAS_BILLING_CYCLE_LABEL: Record<SaaSBillingCycle, string> = {
  monthly:     "Monthly",
  annual:      "Annual",
  multi_year:  "Multi-Year",
  one_time:    "One-Time",
  usage_based: "Usage-Based",
};

export const SAAS_SUBSCRIPTION_STATUS_LABEL: Record<SaaSSubscriptionStatus, string> = {
  active:    "Active",
  trial:     "Trial",
  pending:   "Pending",
  suspended: "Suspended",
  cancelled: "Cancelled",
  expired:   "Expired",
};

export const SAAS_SUBSCRIPTION_STATUS_COLOR: Record<SaaSSubscriptionStatus, string> = {
  active:    "bg-emerald-50  text-emerald-700  border-emerald-200  dark:bg-emerald-900/30  dark:text-emerald-300",
  trial:     "bg-sky-50      text-sky-700      border-sky-200      dark:bg-sky-900/30      dark:text-sky-300",
  pending:   "bg-amber-50    text-amber-700    border-amber-200    dark:bg-amber-900/30    dark:text-amber-300",
  suspended: "bg-orange-50   text-orange-700   border-orange-200   dark:bg-orange-900/30   dark:text-orange-300",
  cancelled: "bg-muted       text-muted-foreground border-muted-foreground/20",
  expired:   "bg-muted       text-muted-foreground border-muted-foreground/20",
};

export const SAAS_CATEGORY_ICON_CLASS: Record<SaaSCategory, string> = {
  identity:           "text-violet-600",
  collaboration:      "text-blue-600",
  project_management: "text-indigo-600",
  crm:                "text-emerald-600",
  devtools:           "text-slate-600",
  security:           "text-red-600",
  hr:                 "text-pink-600",
  finance:            "text-yellow-600",
  communication:      "text-sky-600",
  productivity:       "text-orange-600",
  analytics:          "text-teal-600",
  design:             "text-purple-600",
  marketing:          "text-rose-600",
  storage:            "text-cyan-600",
  monitoring:         "text-amber-600",
  other:              "text-muted-foreground",
};

// ── Shared interfaces ─────────────────────────────────────────────────────────

export interface SoftwareLicenseSummary {
  id:               number;
  licenseNumber:    string;
  productName:      string;
  vendor:           string | null;
  edition:          string | null;
  version:          string | null;
  platform:         SoftwarePlatform;
  licenseType:      SoftwareLicenseType;
  status:           SoftwareLicenseStatus;
  totalSeats:       number | null;
  consumedSeats:    number;
  expiryDate:       string | null;
  renewalDate:      string | null;
  annualCost:       string | null;
  purchasePrice:    string | null;
  currency:         string;
  autoRenews:       boolean;
  externalId:       string | null;
  discoverySource:  string | null;
  owner:            { id: string; name: string } | null;
  daysUntilExpiry:  number | null;
  createdAt:        string;
  updatedAt:        string;
}

export interface LicenseAssignmentRecord {
  id:                 number;
  assignedAt:         string;
  unassignedAt:       string | null;
  note:               string | null;
  assignedToUser:     { id: string; name: string; email: string } | null;
  assignedToAsset:    { id: number; assetNumber: string; name: string } | null;
  assignedBy:         { id: string; name: string } | null;
}

export interface SoftwareLicenseDetail extends SoftwareLicenseSummary {
  licenseKey:       string | null;
  licenseReference: string | null;
  purchaseDate:     string | null;
  startDate:        string | null;
  poNumber:         string | null;
  invoiceNumber:    string | null;
  vendorContact:    string | null;
  vendorEmail:      string | null;
  complianceNotes:  string | null;
  notes:            string | null;
  lastSyncAt:       string | null;
  assignments:      LicenseAssignmentRecord[];
  createdAt:        string;
  updatedAt:        string;
}

export interface SaaSSubscriptionSummary {
  id:                 number;
  subscriptionNumber: string;
  appName:            string;
  vendor:             string | null;
  category:           SaaSCategory;
  status:             SaaSSubscriptionStatus;
  plan:               string | null;
  billingCycle:       SaaSBillingCycle;
  url:                string | null;
  totalSeats:         number | null;
  consumedSeats:      number;
  monthlyAmount:      string | null;
  annualAmount:       string | null;
  currency:           string;
  renewalDate:        string | null;
  autoRenews:         boolean;
  externalId:         string | null;
  discoverySource:    string | null;
  owner:              { id: string; name: string } | null;
  daysUntilRenewal:   number | null;
  createdAt:          string;
  updatedAt:          string;
}

export interface SaaSUserAssignmentRecord {
  id:           number;
  user:         { id: string; name: string; email: string };
  role:         string | null;
  assignedAt:   string;
  lastActiveAt: string | null;
  unassignedAt: string | null;
  note:         string | null;
  assignedBy:   { id: string; name: string } | null;
}

export interface SaaSSubscriptionDetail extends SaaSSubscriptionSummary {
  adminEmail:      string | null;
  startDate:       string | null;
  trialEndDate:    string | null;
  cancellationDate: string | null;
  spendCategory:   string | null;
  complianceNotes: string | null;
  notes:           string | null;
  lastSyncAt:      string | null;
  userAssignments: SaaSUserAssignmentRecord[];
  createdAt:       string;
  updatedAt:       string;
}
