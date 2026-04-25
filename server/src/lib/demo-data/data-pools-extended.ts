/**
 * Extended data pools — SaaS, Software Licenses, Ticket Types, Ticket Statuses.
 */

// ── SaaS Subscriptions ────────────────────────────────────────────────────────

export const SAAS_SUBSCRIPTION_POOL = [
  { appName: "Slack",              vendor: "Slack Technologies",   category: "collaboration"      as const, status: "active"    as const, plan: "Business+",         billingCycle: "annual"      as const, seats: 150, monthly: 12.50,  annual: 11250,  renewalMonths: 8  },
  { appName: "Microsoft 365",      vendor: "Microsoft",            category: "productivity"       as const, status: "active"    as const, plan: "E3",                billingCycle: "annual"      as const, seats: 200, monthly: 32.00,  annual: 76800,  renewalMonths: 6  },
  { appName: "Zoom",               vendor: "Zoom Video Comm.",     category: "communication"      as const, status: "active"    as const, plan: "Business",          billingCycle: "annual"      as const, seats: 120, monthly: 16.00,  annual: 23040,  renewalMonths: 4  },
  { appName: "Salesforce CRM",     vendor: "Salesforce",           category: "crm"                as const, status: "active"    as const, plan: "Enterprise",        billingCycle: "annual"      as const, seats: 60,  monthly: 150.00, annual: 108000, renewalMonths: 3  },
  { appName: "GitHub Enterprise",  vendor: "GitHub Inc.",          category: "devtools"           as const, status: "active"    as const, plan: "Enterprise Cloud",  billingCycle: "annual"      as const, seats: 80,  monthly: 21.00,  annual: 20160,  renewalMonths: 11 },
  { appName: "Jira Software",      vendor: "Atlassian",            category: "project_management" as const, status: "active"    as const, plan: "Premium",           billingCycle: "annual"      as const, seats: 95,  monthly: 17.65,  annual: 20091,  renewalMonths: 5  },
  { appName: "Confluence",         vendor: "Atlassian",            category: "productivity"       as const, status: "active"    as const, plan: "Premium",           billingCycle: "annual"      as const, seats: 95,  monthly: 11.00,  annual: 12540,  renewalMonths: 5  },
  { appName: "Okta",               vendor: "Okta Inc.",            category: "identity"           as const, status: "active"    as const, plan: "Workforce Identity", billingCycle: "annual"     as const, seats: 220, monthly: 8.00,   annual: 21120,  renewalMonths: 2  },
  { appName: "Datadog",            vendor: "Datadog Inc.",         category: "monitoring"         as const, status: "active"    as const, plan: "Pro",               billingCycle: "annual"      as const, seats: null, monthly: 2400,  annual: 28800,  renewalMonths: 9  },
  { appName: "PagerDuty",          vendor: "PagerDuty",            category: "monitoring"         as const, status: "active"    as const, plan: "Business",          billingCycle: "annual"      as const, seats: 30,  monthly: 21.00,  annual: 7560,   renewalMonths: 7  },
  { appName: "Figma",              vendor: "Figma Inc.",           category: "design"             as const, status: "active"    as const, plan: "Organization",      billingCycle: "annual"      as const, seats: 25,  monthly: 45.00,  annual: 13500,  renewalMonths: 10 },
  { appName: "Notion",             vendor: "Notion Labs",          category: "productivity"       as const, status: "trial"     as const, plan: "Plus",              billingCycle: "monthly"     as const, seats: 50,  monthly: 10.00,  annual: null,   renewalMonths: 1  },
  { appName: "HubSpot Marketing",  vendor: "HubSpot",              category: "marketing"          as const, status: "active"    as const, plan: "Professional",      billingCycle: "annual"      as const, seats: 15,  monthly: 890.00, annual: 10680,  renewalMonths: 6  },
  { appName: "Workday HCM",        vendor: "Workday Inc.",         category: "hr"                 as const, status: "active"    as const, plan: "Enterprise HCM",    billingCycle: "annual"      as const, seats: null, monthly: 8500,  annual: 102000, renewalMonths: 14 },
  { appName: "1Password Teams",    vendor: "AgileBits",            category: "security"           as const, status: "active"    as const, plan: "Business",          billingCycle: "annual"      as const, seats: 200, monthly: 7.99,   annual: 19176,  renewalMonths: 3  },
  { appName: "Miro",               vendor: "Miro",                 category: "collaboration"      as const, status: "active"    as const, plan: "Business",          billingCycle: "annual"      as const, seats: 60,  monthly: 16.00,  annual: 11520,  renewalMonths: 8  },
  { appName: "Tableau",            vendor: "Salesforce (Tableau)", category: "analytics"          as const, status: "active"    as const, plan: "Viewer + Creator",  billingCycle: "annual"      as const, seats: 20,  monthly: 70.00,  annual: 16800,  renewalMonths: 4  },
  { appName: "Dropbox Business",   vendor: "Dropbox Inc.",         category: "storage"            as const, status: "suspended" as const, plan: "Business Plus",     billingCycle: "annual"      as const, seats: 40,  monthly: 20.00,  annual: 9600,   renewalMonths: 0  },
  { appName: "Zendesk Support",    vendor: "Zendesk",              category: "other"              as const, status: "cancelled" as const, plan: "Suite Enterprise",  billingCycle: "annual"      as const, seats: 30,  monthly: 149.00, annual: 53640,  renewalMonths: 0  },
  { appName: "AWS",                vendor: "Amazon Web Services",  category: "storage"            as const, status: "active"    as const, plan: "Pay-as-you-go",     billingCycle: "usage_based" as const, seats: null, monthly: 14200, annual: null,   renewalMonths: 0  },
];

// ── Software Licenses ─────────────────────────────────────────────────────────

export const SOFTWARE_LICENSE_POOL = [
  { product: "Microsoft Office 2024",    vendor: "Microsoft",        edition: "Professional Plus",  platform: "windows"        as const, type: "volume"       as const, status: "active"  as const, seats: 200, purchase: 42000, annual: null,   expiryYears: null },
  { product: "Adobe Acrobat Pro",        vendor: "Adobe",            edition: "DC",                 platform: "cross_platform" as const, type: "subscription" as const, status: "active"  as const, seats: 50,  purchase: null,  annual: 17940,  expiryYears: 1    },
  { product: "Visual Studio",            vendor: "Microsoft",        edition: "Professional 2022",  platform: "windows"        as const, type: "subscription" as const, status: "active"  as const, seats: 40,  purchase: null,  annual: 23960,  expiryYears: 1    },
  { product: "AutoCAD",                  vendor: "Autodesk",         edition: "2024",               platform: "windows"        as const, type: "subscription" as const, status: "active"  as const, seats: 12,  purchase: null,  annual: 26556,  expiryYears: 1    },
  { product: "IntelliJ IDEA",            vendor: "JetBrains",        edition: "Ultimate",           platform: "cross_platform" as const, type: "subscription" as const, status: "active"  as const, seats: 35,  purchase: null,  annual: 22050,  expiryYears: 1    },
  { product: "Microsoft Project",        vendor: "Microsoft",        edition: "Professional 2021",  platform: "windows"        as const, type: "perpetual"    as const, status: "active"  as const, seats: 10,  purchase: 15990, annual: null,   expiryYears: null },
  { product: "Visio Professional",       vendor: "Microsoft",        edition: "2021",               platform: "windows"        as const, type: "perpetual"    as const, status: "active"  as const, seats: 8,   purchase: 5592,  annual: null,   expiryYears: null },
  { product: "MATLAB",                   vendor: "MathWorks",        edition: "R2024a",             platform: "cross_platform" as const, type: "subscription" as const, status: "active"  as const, seats: 5,   purchase: null,  annual: 8600,   expiryYears: 1    },
  { product: "Norton Business Security", vendor: "Norton",           edition: "360 for Business",   platform: "cross_platform" as const, type: "subscription" as const, status: "active"  as const, seats: 100, purchase: null,  annual: 4200,   expiryYears: 1    },
  { product: "VMware Workstation Pro",   vendor: "VMware",           edition: "17",                 platform: "windows"        as const, type: "perpetual"    as const, status: "active"  as const, seats: 20,  purchase: 7980,  annual: null,   expiryYears: null },
  { product: "Parallels Desktop",        vendor: "Parallels",        edition: "19 Pro",             platform: "mac"            as const, type: "subscription" as const, status: "active"  as const, seats: 15,  purchase: null,  annual: 2985,   expiryYears: 1    },
  { product: "Oracle Database",          vendor: "Oracle",           edition: "Enterprise Edition", platform: "linux"          as const, type: "volume"       as const, status: "active"  as const, seats: null, purchase: 95000, annual: 20900, expiryYears: null },
  { product: "SQL Server",               vendor: "Microsoft",        edition: "2022 Standard",      platform: "windows"        as const, type: "volume"       as const, status: "active"  as const, seats: null, purchase: 12850, annual: null,   expiryYears: null },
  { product: "Windows Server",           vendor: "Microsoft",        edition: "2022 Datacenter",    platform: "windows"        as const, type: "volume"       as const, status: "active"  as const, seats: null, purchase: 48000, annual: null,   expiryYears: null },
  { product: "Camtasia",                 vendor: "TechSmith",        edition: "2024",               platform: "cross_platform" as const, type: "perpetual"    as const, status: "active"  as const, seats: 10,  purchase: 2990,  annual: null,   expiryYears: null },
  { product: "Snagit",                   vendor: "TechSmith",        edition: "2024",               platform: "cross_platform" as const, type: "perpetual"    as const, status: "active"  as const, seats: 30,  purchase: 5970,  annual: null,   expiryYears: null },
  { product: "Sketch",                   vendor: "Sketch B.V.",      edition: "Business",           platform: "mac"            as const, type: "subscription" as const, status: "expired" as const, seats: 8,   purchase: null,  annual: 720,    expiryYears: 0    },
  { product: "Kaseya VSA",               vendor: "Kaseya",           edition: "Enterprise",         platform: "web"            as const, type: "subscription" as const, status: "active"  as const, seats: 10,  purchase: null,  annual: 14400,  expiryYears: 1    },
];

// ── Ticket Types ──────────────────────────────────────────────────────────────

export const TICKET_TYPE_POOL = [
  { name: "Bug Report",            slug: "bug-report",        description: "Software defect or unexpected behaviour in a production system.",      color: "#ef4444" },
  { name: "Feature Request",       slug: "feature-request",   description: "Request for a new capability or enhancement to an existing system.",   color: "#3b82f6" },
  { name: "Access Request",        slug: "access-request",    description: "Request for access to systems, applications, or data resources.",      color: "#8b5cf6" },
  { name: "Hardware Issue",        slug: "hardware-issue",    description: "Fault or failure with physical IT equipment (laptop, monitor, etc.).", color: "#f97316" },
  { name: "Network Problem",       slug: "network-problem",   description: "Connectivity issues, slow network performance, or VPN problems.",      color: "#06b6d4" },
  { name: "Software Installation", slug: "software-install",  description: "Request to install, update, or remove software on a managed device.", color: "#10b981" },
  { name: "Password / MFA Reset",  slug: "password-reset",    description: "Account lockout, expired password, or MFA device replacement.",       color: "#f59e0b" },
  { name: "Security Incident",     slug: "security-incident", description: "Suspected phishing, malware, data leak, or unauthorised access.",     color: "#dc2626" },
  { name: "Data Request",          slug: "data-request",      description: "Request for data exports, reports, or database query assistance.",    color: "#6366f1" },
  { name: "Service Outage",        slug: "service-outage",    description: "Complete or partial loss of a critical business service.",            color: "#b91c1c" },
];

// ── Custom Ticket Statuses ────────────────────────────────────────────────────

export const TICKET_STATUS_POOL = [
  { label: "Awaiting Assignment",             color: "#94a3b8", workflowState: "open"        as const, slaBehavior: "continue" as const, position: 0 },
  { label: "In Progress",                     color: "#3b82f6", workflowState: "in_progress" as const, slaBehavior: "continue" as const, position: 1 },
  { label: "Awaiting User Response",          color: "#f59e0b", workflowState: "in_progress" as const, slaBehavior: "on_hold"  as const, position: 2 },
  { label: "Waiting on Third Party",          color: "#a78bfa", workflowState: "in_progress" as const, slaBehavior: "on_hold"  as const, position: 3 },
  { label: "In Review",                       color: "#6366f1", workflowState: "in_progress" as const, slaBehavior: "continue" as const, position: 4 },
  { label: "Pending Deployment",              color: "#8b5cf6", workflowState: "in_progress" as const, slaBehavior: "on_hold"  as const, position: 5 },
  { label: "Resolved - Pending Confirmation", color: "#10b981", workflowState: "resolved"    as const, slaBehavior: "on_hold"  as const, position: 6 },
  { label: "On Hold",                         color: "#6b7280", workflowState: "in_progress" as const, slaBehavior: "on_hold"  as const, position: 7 },
  { label: "Escalated to Management",         color: "#ef4444", workflowState: "escalated"   as const, slaBehavior: "continue" as const, position: 8 },
  { label: "Scheduled",                       color: "#0ea5e9", workflowState: "open"        as const, slaBehavior: "continue" as const, position: 9 },
];
