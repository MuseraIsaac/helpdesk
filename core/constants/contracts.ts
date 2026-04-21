export type ContractType =
  | "support"
  | "maintenance"
  | "warranty"
  | "lease"
  | "license"
  | "insurance"
  | "service_level_agreement"
  | "vendor_agreement"
  | "other";

export type ContractStatus =
  | "draft"
  | "active"
  | "expired"
  | "terminated"
  | "pending_renewal";

export const CONTRACT_TYPES: ContractType[] = [
  "support", "maintenance", "warranty", "lease", "license",
  "insurance", "service_level_agreement", "vendor_agreement", "other",
];

export const CONTRACT_STATUSES: ContractStatus[] = [
  "draft", "active", "pending_renewal", "expired", "terminated",
];

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  support:                 "Support",
  maintenance:             "Maintenance",
  warranty:                "Warranty",
  lease:                   "Lease",
  license:                 "License",
  insurance:               "Insurance",
  service_level_agreement: "SLA",
  vendor_agreement:        "Vendor Agreement",
  other:                   "Other",
};

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft:           "Draft",
  active:          "Active",
  expired:         "Expired",
  terminated:      "Terminated",
  pending_renewal: "Pending Renewal",
};

export const CONTRACT_STATUS_COLOR: Record<ContractStatus, string> = {
  draft:           "bg-muted       text-muted-foreground  border-muted-foreground/20",
  active:          "bg-emerald-50  text-emerald-700       border-emerald-200  dark:bg-emerald-900/30  dark:text-emerald-300",
  expired:         "bg-red-50      text-red-700           border-red-200      dark:bg-red-900/30      dark:text-red-300",
  terminated:      "bg-muted       text-muted-foreground  border-muted-foreground/20",
  pending_renewal: "bg-amber-50    text-amber-700         border-amber-200    dark:bg-amber-900/30    dark:text-amber-300",
};

export const CONTRACT_TYPE_COLOR: Record<ContractType, string> = {
  support:                 "bg-sky-50     text-sky-700     border-sky-200",
  maintenance:             "bg-amber-50   text-amber-700   border-amber-200",
  warranty:                "bg-violet-50  text-violet-700  border-violet-200",
  lease:                   "bg-blue-50    text-blue-700    border-blue-200",
  license:                 "bg-indigo-50  text-indigo-700  border-indigo-200",
  insurance:               "bg-teal-50    text-teal-700    border-teal-200",
  service_level_agreement: "bg-emerald-50 text-emerald-700 border-emerald-200",
  vendor_agreement:        "bg-orange-50  text-orange-700  border-orange-200",
  other:                   "bg-muted      text-muted-foreground border-muted-foreground/20",
};

export interface ContractSummary {
  id:             number;
  contractNumber: string;
  title:          string;
  type:           ContractType;
  status:         ContractStatus;
  vendor:         string | null;
  startDate:      string | null;
  endDate:        string | null;
  renewalDate:    string | null;
  autoRenews:     boolean;
  value:          string | null;
  currency:       string;
  supportLevel:   string | null;
  slaResponseHours: number | null;
  isActive:       boolean;
  daysUntilExpiry: number | null;
  _counts:        { assets: number };
}

export interface ContractDetail extends ContractSummary {
  vendorContact: string | null;
  vendorEmail:   string | null;
  vendorPhone:   string | null;
  description:   string | null;
  notes:         string | null;
  createdAt:     string;
  updatedAt:     string;
  assets: Array<{
    id:          number;
    assetNumber: string;
    name:        string;
    type:        string;
    status:      string;
    linkedAt:    string;
  }>;
}

/** Lightweight shape embedded in AssetDetail.contracts */
export interface AssetContractSummary {
  id:             number;
  contractNumber: string;
  title:          string;
  type:           ContractType;
  status:         ContractStatus;
  vendor:         string | null;
  endDate:        string | null;
  renewalDate:    string | null;
  value:          string | null;
  currency:       string;
  supportLevel:   string | null;
  daysUntilExpiry: number | null;
}

export interface DepreciationResult {
  method:                  string;
  acquisitionCost:         number;
  salvageValue:            number;
  usefulLifeYears:         number;
  ageYears:                number;
  annualCharge:            number;
  accumulatedDepreciation: number;
  bookValue:               number;
  depreciationPct:         number;
  fullyDepreciatedAt:      string;   // ISO date string
  isFullyDepreciated:      boolean;
}
