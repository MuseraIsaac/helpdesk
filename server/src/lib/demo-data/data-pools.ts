/**
 * Static data pools for every module generator.
 * Each pool has 30+ entries so the "large" preset can draw from all of them.
 * Generators slice with take(pool, n).
 */

export function take<T>(pool: T[], n: number): T[] {
  return pool.slice(0, Math.min(n, pool.length));
}

export function pick<T>(arr: T[], idx: number): T {
  return arr[idx % arr.length]!;
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3_600_000);
}

export function pad(n: number, len = 4) {
  return String(n).padStart(len, "0");
}

export function jitter(base: number, range: number) {
  return base + Math.floor(Math.random() * range);
}

// ── Users ─────────────────────────────────────────────────────────────────────

export const USER_POOL = [
  { name: "Sarah Chen",       email: "sarah.chen@demo.local",       role: "supervisor" as const, title: "Infrastructure Lead",          phone: "+1-555-0101" },
  { name: "Marcus Johnson",   email: "marcus.johnson@demo.local",    role: "agent"      as const, title: "L1 Support Specialist",         phone: "+1-555-0102" },
  { name: "Priya Sharma",     email: "priya.sharma@demo.local",      role: "agent"      as const, title: "L2 Support Engineer",           phone: "+1-555-0103" },
  { name: "Alex Rivera",      email: "alex.rivera@demo.local",       role: "agent"      as const, title: "Infrastructure Engineer",       phone: "+1-555-0104" },
  { name: "Emma Williams",    email: "emma.williams@demo.local",     role: "supervisor" as const, title: "Security Operations Lead",      phone: "+1-555-0105" },
  { name: "James O'Brien",    email: "james.obrien@demo.local",      role: "agent"      as const, title: "L1 Support Specialist",         phone: "+1-555-0106" },
  { name: "Aisha Patel",      email: "aisha.patel@demo.local",       role: "agent"      as const, title: "ITSM Process Analyst",          phone: "+1-555-0107" },
  { name: "Carlos Mendez",    email: "carlos.mendez@demo.local",     role: "agent"      as const, title: "Network Engineer",              phone: "+1-555-0108" },
  { name: "Yuki Tanaka",      email: "yuki.tanaka@demo.local",       role: "agent"      as const, title: "L2 Systems Engineer",           phone: "+1-555-0109" },
  { name: "Lisa Foster",      email: "lisa.foster@demo.local",       role: "agent"      as const, title: "Service Desk Analyst",          phone: "+1-555-0110" },
  { name: "Daniel Osei",      email: "daniel.osei@demo.local",       role: "supervisor" as const, title: "DevOps Team Lead",              phone: "+1-555-0111" },
  { name: "Nina Kowalski",    email: "nina.kowalski@demo.local",     role: "agent"      as const, title: "Cloud Infrastructure Analyst",  phone: "+1-555-0112" },
  { name: "Ravi Krishnan",    email: "ravi.krishnan@demo.local",     role: "agent"      as const, title: "Database Administrator",        phone: "+1-555-0113" },
  { name: "Fatima Al-Rashid", email: "fatima.alrashid@demo.local",   role: "agent"      as const, title: "Security Analyst",              phone: "+1-555-0114" },
  { name: "Tom Eriksson",     email: "tom.eriksson@demo.local",      role: "agent"      as const, title: "Application Support Engineer",  phone: "+1-555-0115" },
];

// ── Team assignments (indices into USER_POOL) ─────────────────────────────────

export const TEAM_POOL = [
  { name: "Level 1 Support",    description: "First point of contact for all end-user requests", color: "#3b82f6", memberIdxs: [1, 5, 9]    },
  { name: "Infrastructure",     description: "Servers, networking, and core platform services",   color: "#10b981", memberIdxs: [0, 3, 7]    },
  { name: "Security Operations",description: "Security incidents, vulnerability management",       color: "#f59e0b", memberIdxs: [4, 6, 13]   },
  { name: "DevOps & Automation",description: "CI/CD pipelines, release engineering, automation",  color: "#8b5cf6", memberIdxs: [3, 8, 10]   },
  { name: "Database Services",  description: "Database administration and performance tuning",    color: "#ec4899", memberIdxs: [12, 8]       },
  { name: "Cloud Operations",   description: "Cloud platform management and cost optimisation",   color: "#06b6d4", memberIdxs: [11, 3, 10]  },
];

// ── Organisations + customers ─────────────────────────────────────────────────

export const ORG_POOL = [
  { name: "TechCorp Global",    domain: "techcorp-global.demo",    industry: "Technology",            tier: "enterprise" },
  { name: "Acme Industries",    domain: "acme-industries.demo",    industry: "Manufacturing",          tier: "premium"    },
  { name: "Nexus Financial",    domain: "nexus-financial.demo",    industry: "Financial Services",     tier: "enterprise" },
  { name: "Stellar Healthcare", domain: "stellar-health.demo",     industry: "Healthcare",             tier: "premium"    },
  { name: "Orbit Systems",      domain: "orbit-systems.demo",      industry: "Aerospace & Defence",   tier: "standard"   },
  { name: "Apex Logistics",     domain: "apex-logistics.demo",     industry: "Logistics & Transport",  tier: "premium"    },
  { name: "Meridian Energy",    domain: "meridian-energy.demo",    industry: "Energy & Utilities",     tier: "enterprise" },
  { name: "Pinnacle Retail",    domain: "pinnacle-retail.demo",    industry: "Retail & eCommerce",     tier: "standard"   },
];

export const CUSTOMER_POOL = [
  { name: "Jordan Blake",    email: "jordan.blake@techcorp-global.demo",    orgIdx: 0, jobTitle: "VP Engineering",        isVip: true  },
  { name: "Morgan Lee",      email: "morgan.lee@techcorp-global.demo",      orgIdx: 0, jobTitle: "IT Manager",            isVip: false },
  { name: "Taylor Kim",      email: "taylor.kim@techcorp-global.demo",      orgIdx: 0, jobTitle: "Developer",             isVip: false },
  { name: "Casey Morgan",    email: "casey.morgan@acme-industries.demo",    orgIdx: 1, jobTitle: "Operations Director",   isVip: true  },
  { name: "Riley Thompson",  email: "riley.thompson@acme-industries.demo",  orgIdx: 1, jobTitle: "Systems Admin",         isVip: false },
  { name: "Avery Collins",   email: "avery.collins@nexus-financial.demo",   orgIdx: 2, jobTitle: "CISO",                  isVip: true  },
  { name: "Quinn Reeves",    email: "quinn.reeves@nexus-financial.demo",    orgIdx: 2, jobTitle: "Network Admin",         isVip: false },
  { name: "Drew Lawson",     email: "drew.lawson@nexus-financial.demo",     orgIdx: 2, jobTitle: "Support Coordinator",  isVip: false },
  { name: "Skylar Hudson",   email: "skylar.hudson@stellar-health.demo",    orgIdx: 3, jobTitle: "IT Director",           isVip: true  },
  { name: "Peyton Walsh",    email: "peyton.walsh@stellar-health.demo",     orgIdx: 3, jobTitle: "Systems Analyst",       isVip: false },
  { name: "Rowan Grant",     email: "rowan.grant@orbit-systems.demo",       orgIdx: 4, jobTitle: "IT Coordinator",        isVip: false },
  { name: "Finley Park",     email: "finley.park@orbit-systems.demo",       orgIdx: 4, jobTitle: "Developer",             isVip: false },
  { name: "Harper Ellis",    email: "harper.ellis@apex-logistics.demo",     orgIdx: 5, jobTitle: "IT Manager",            isVip: true  },
  { name: "Cameron West",    email: "cameron.west@apex-logistics.demo",     orgIdx: 5, jobTitle: "Field Tech",            isVip: false },
  { name: "Blake Santos",    email: "blake.santos@meridian-energy.demo",    orgIdx: 6, jobTitle: "CTO",                   isVip: true  },
  { name: "River Chen",      email: "river.chen@meridian-energy.demo",      orgIdx: 6, jobTitle: "Infrastructure Lead",   isVip: false },
  { name: "Sage Williams",   email: "sage.williams@pinnacle-retail.demo",   orgIdx: 7, jobTitle: "IT Operations Manager", isVip: false },
  { name: "Phoenix Liu",     email: "phoenix.liu@pinnacle-retail.demo",     orgIdx: 7, jobTitle: "Systems Engineer",      isVip: false },
  { name: "Storm Martinez",  email: "storm.martinez@apex-logistics.demo",   orgIdx: 5, jobTitle: "Network Administrator", isVip: false },
  { name: "Brook Taylor",    email: "brook.taylor@nexus-financial.demo",    orgIdx: 2, jobTitle: "Compliance Analyst",    isVip: false },
  { name: "Quinn Nakamura",  email: "quinn.nakamura@techcorp-global.demo",  orgIdx: 0, jobTitle: "DevOps Engineer",       isVip: false },
  { name: "Alex Okonkwo",    email: "alex.okonkwo@stellar-health.demo",     orgIdx: 3, jobTitle: "Data Analyst",          isVip: false },
];

// ── KB categories ─────────────────────────────────────────────────────────────

export const KB_CATEGORY_POOL = [
  { name: "Getting Started",               slug: "demo-getting-started",       description: "Onboarding guides and first-day setup" },
  { name: "Troubleshooting & Known Issues",slug: "demo-troubleshooting",        description: "Common issues and documented workarounds" },
  { name: "Account & Security",            slug: "demo-account-security",       description: "Passwords, MFA, and access management" },
  { name: "Network & Infrastructure",      slug: "demo-network-infra",          description: "Network, servers, and cloud infrastructure" },
  { name: "Software & Applications",       slug: "demo-software-apps",          description: "Business application guides and FAQs" },
];

export const KB_ARTICLE_POOL = [
  // Getting Started (cat 0)
  {
    catIdx: 0,
    title: "How to Set Up Your Workstation",
    slug: "demo-workstation-setup",
    summary: "Step-by-step guide for new employee workstation setup including OS configuration, software installation, and network access.",
    body: "## Prerequisites\n\nEnsure you have received your equipment and credentials from IT.\n\n## Step 1: Initial Setup\n\n1. Power on the device and complete the OS setup wizard\n2. Connect to the corporate Wi-Fi using your employee credentials\n3. Install the VPN client from the self-service portal\n\n## Step 2: Essential Software\n\nInstall the following from the Software Center:\n- Microsoft 365 Suite\n- Slack (enterprise edition)\n- 1Password (password manager)\n- Zoom\n\n## Step 3: Account Verification\n\nVerify access to:\n- Email (Outlook)\n- HR Portal\n- IT Service Portal\n- Code repositories (if applicable)\n\n## Need Help?\n\nOpen a service request via the IT portal or contact Level 1 Support.",
    tags: ["onboarding", "setup", "workstation"],
  },
  {
    catIdx: 0,
    title: "Requesting IT Access and Permissions",
    slug: "demo-access-request",
    summary: "How to submit access requests for systems, applications and shared drives through the service catalog.",
    body: "## Overview\n\nAll access requests must be submitted through the IT Service Portal.\n\n## How to Submit\n\n1. Log in to the **IT Service Portal**\n2. Navigate to **Service Catalog → Access & Permissions**\n3. Select the system you need access to\n4. Fill in the business justification\n5. Submit — your manager will be notified\n\n## Approval Timeline\n\n| Access Type | Expected Time |\n|---|---|\n| Standard application | 1 business day |\n| Elevated / admin access | 3 business days |\n| Third-party / vendor | 5 business days |\n\n## Emergency Access\n\nFor urgent production access, contact the on-call engineer via PagerDuty.",
    tags: ["access", "permissions", "catalog"],
  },
  {
    catIdx: 0,
    title: "IT Self-Service Portal Guide",
    slug: "demo-portal-guide",
    summary: "Complete guide to the employee IT self-service portal for tickets, requests, and the knowledge base.",
    body: "## What Can You Do?\n\n- **Report an incident** — something broken that blocks your work\n- **Submit a service request** — you need something new\n- **Browse the catalog** — pre-approved IT services\n- **Check ticket status** — see updates on open requests\n- **Rate your experience** — CSAT feedback helps us improve\n\n## Response SLAs\n\nP1 (Critical): 15 min response, 1 hr resolution\nP2 (High): 30 min response, 4 hr resolution\nP3 (Medium): 1 hr response, 8 hr resolution\nP4 (Low): 4 hr response, 2 day resolution",
    tags: ["portal", "self-service", "guide"],
  },
  // Troubleshooting (cat 1)
  {
    catIdx: 1,
    title: "VPN Connection Issues — Troubleshooting Guide",
    slug: "demo-vpn-troubleshooting",
    summary: "Diagnose and resolve the most common VPN connectivity problems including authentication failures and DNS issues.",
    body: "## Common Symptoms\n\n- VPN connects but cannot reach internal resources\n- Authentication keeps failing\n- DNS resolution errors after connecting\n- Slow performance on VPN\n\n## Quick Fixes\n\n### 1. Authentication Failure\n\n1. Ensure your password has not expired\n2. Confirm MFA app is in sync with server time\n3. Try revoking and re-enrolling your MFA device\n\n### 2. Cannot Reach Internal Resources\n- Disconnect and reconnect the VPN\n- Flush your DNS cache\n- Check if split tunnelling is configured correctly\n\n## Known Issue: Windows 11 24H2\n\n**Symptom:** VPN drops every 45 minutes\n**Workaround:** Disable network adapter power-saving mode\n**Status:** Permanent fix in progress (PRB-0002)",
    tags: ["vpn", "network", "troubleshooting"],
  },
  {
    catIdx: 1,
    title: "Microsoft 365 Outage — What to Do",
    slug: "demo-m365-outage",
    summary: "Steps to take when Microsoft 365 services are experiencing degraded performance or an outage.",
    body: "## Identifying an Outage\n\n1. Check the Microsoft 365 Service Health dashboard\n2. Check our internal status page at status.company.internal\n\n## Workarounds\n\n### Email\n- Use webmail (OWA) as a backup\n- For urgent communications use Slack\n\n### Files\n- Access SharePoint files via desktop OneDrive sync\n\n### Meetings\n- Teams meetings can be joined via browser\n- Fall back to Zoom for critical calls\n\n## Reporting Impact\n\nIf your team is blocked, open a P2 incident so we can escalate our Microsoft support ticket.",
    tags: ["m365", "outage", "teams", "exchange"],
  },
  {
    catIdx: 1,
    title: "Laptop Performance — Diagnosis Steps",
    slug: "demo-laptop-performance",
    summary: "Systematic steps to diagnose and resolve slow laptop performance.",
    body: "## Initial Diagnostics\n\n1. **Check Task Manager**: Is any process using >80% CPU?\n2. **Check disk space**: Less than 10 GB free causes slowdowns\n3. **Check pending Windows updates**: May be running silently\n4. **Run Windows Defender scan**: Malware causes high CPU\n\n## Common Culprits\n\n| Symptom | Likely Cause |\n|---|---|\n| High CPU, no obvious process | Antivirus full scan |\n| Slow after login | Too many startup programmes |\n| Disk 100% in Task Manager | Windows Search indexing |\n| Everything slow | Low RAM (8 GB on Teams + browser) |\n\n## Escalation\n\nIf performance is still below acceptable levels, submit a ticket and attach a screenshot of Task Manager.",
    tags: ["laptop", "performance", "hardware", "windows"],
  },
  // Account & Security (cat 2)
  {
    catIdx: 2,
    title: "How to Reset Your Password",
    slug: "demo-password-reset",
    summary: "Self-service password reset and account unlock procedures.",
    body: "## Self-Service Reset (Fastest)\n\n1. Go to **account.company.internal/reset**\n2. Enter your corporate email\n3. Check your personal email for the reset link (expires in 15 minutes)\n4. Create a new password meeting policy requirements\n\n## Password Policy\n\n- Minimum **12 characters**\n- At least one uppercase letter\n- At least one number\n- At least one special character\n- Cannot reuse last 10 passwords\n- Must be changed every **90 days**\n\n## Account Locked?\n\nAfter 5 failed attempts your account locks for 30 minutes. Contact the Service Desk for immediate unlock (ID verification required).",
    tags: ["password", "account", "reset"],
  },
  {
    catIdx: 2,
    title: "Setting Up Multi-Factor Authentication (MFA)",
    slug: "demo-mfa-setup",
    summary: "Step-by-step guide to enrolling in MFA using Microsoft Authenticator or a hardware token.",
    body: "## Why MFA is Required\n\nMFA is mandatory per our ISO 27001 compliance requirements.\n\n## Option 1: Microsoft Authenticator (Recommended)\n\n1. Install Microsoft Authenticator on your mobile device\n2. Go to **aka.ms/mfasetup**\n3. Sign in with your corporate credentials\n4. Choose 'Mobile app' then 'Receive notifications'\n5. Scan the QR code\n6. Approve the test notification\n\n## Option 2: Hardware Token (YubiKey)\n\nFor roles without personal mobile devices. Request via the service catalog — IT ships within 2 business days.\n\n## Lost Your MFA Device?\n\nContact the Service Desk immediately. Your account can be temporarily unlocked with ID verification.",
    tags: ["mfa", "security", "authenticator", "2fa"],
  },
  {
    catIdx: 2,
    title: "Phishing and Social Engineering — What to Watch For",
    slug: "demo-phishing-awareness",
    summary: "How to identify phishing emails and what to do if you clicked a suspicious link.",
    body: "## Red Flags in Emails\n\n- **Urgency**: 'Your account will be suspended in 24 hours'\n- **Mismatched sender**: Display name says 'Microsoft' but email is from gmail.com\n- **Hover before clicking**: Link destination does not match the display text\n- **Requests for credentials**: Legitimate IT will never ask for your password\n\n## Reporting a Phishing Email\n\n1. Do NOT click any links\n2. Use the **Report Phishing** button in Outlook\n3. Forward to **security@company.internal**\n\n## If You Clicked a Suspicious Link\n\n1. Disconnect from the network immediately\n2. Call the Security Operations hotline: ext. **5911**\n3. Change all passwords from a clean device",
    tags: ["phishing", "security", "awareness"],
  },
  // Network & Infrastructure (cat 3)
  {
    catIdx: 3,
    title: "Corporate Wi-Fi and Guest Network Guide",
    slug: "demo-wifi-guide",
    summary: "How to connect to corporate Wi-Fi, guest networks, and configure wired connections.",
    body: "## Corporate Networks\n\n| SSID | Purpose | Auth |\n|---|---|---|\n| CORP-SECURE | Employee devices (802.1X) | Corporate credentials |\n| CORP-IOT | Printers, phones, AV gear | Managed enrolment |\n| GUEST-NET | Visitors, personal devices | Daily rotating code |\n\n## Connecting to CORP-SECURE\n\n1. Select **CORP-SECURE** from Wi-Fi list\n2. Enter your corporate email as username\n3. Enter your network password\n4. Accept the certificate from **corp-radius.company.internal**\n\n## Wired Connection\n\nAll wired ports support 802.1X authentication. If your port does not come up within 60 seconds, open a ticket — the port may need switch-level provisioning.",
    tags: ["wifi", "network", "connectivity"],
  },
  {
    catIdx: 3,
    title: "Virtual Server Provisioning Guide",
    slug: "demo-vm-provisioning",
    summary: "How to request and manage virtual machines in the on-premise VMware environment and AWS.",
    body: "## Prerequisites\n\n- ITSM access with Infrastructure role or manager approval\n- Change request approved if modifying production environment\n- Cost code / project code for cloud resources\n\n## On-Premise (VMware vSphere)\n\n1. Submit a service request: **Infrastructure → Virtual Machine → New VM**\n2. Specify: vCPUs, RAM (GB), disk (GB), OS template, VLAN\n3. Provisioning completed within **4 business hours**\n\n## Cloud (AWS)\n\nUse the approved Terraform module from the internal Terraform registry. All instances must be tagged with the project code and requesting user. Daily cost digest is sent to the project lead.",
    tags: ["vm", "infrastructure", "vmware", "aws"],
  },
  {
    catIdx: 3,
    title: "DNS and Internal Hostname Standards",
    slug: "demo-dns-standards",
    summary: "Internal DNS naming conventions and how to request new DNS entries.",
    body: "## Internal DNS Zones\n\n| Zone | Purpose |\n|---|---|\n| company.internal | Active Directory and corporate services |\n| prod.company.internal | Production application services |\n| staging.company.internal | Staging and UAT environments |\n| dev.company.internal | Development environments (auto-expire 30d) |\n\n## Naming Convention\n\nFormat: {service}-{environment}.{zone}\n\nExamples: api-prod.company.internal, db01-staging.company.internal\n\n## Requesting a New DNS Entry\n\n1. Open a service request: **Infrastructure → DNS → New Record**\n2. Provide: hostname, record type (A/CNAME/MX), target IP or alias, TTL\n3. Standard TTL is 300s for new entries",
    tags: ["dns", "networking", "infrastructure"],
  },
  // Software & Applications (cat 4)
  {
    catIdx: 4,
    title: "Microsoft Teams — Tips and Troubleshooting",
    slug: "demo-teams-tips",
    summary: "Common Teams issues and productivity tips for enterprise users.",
    body: "## Common Issues\n\n### Audio / Video Not Working\n1. Check Settings → Devices — ensure correct mic/camera selected\n2. Exit Teams completely and relaunch\n3. If on VPN, try disabling media bypass\n\n### Teams Calls Dropping\n- Check your network quality in Settings → General → Debug\n- Switch from Wi-Fi to wired if possible\n- Update to the latest Teams version\n\n### Cannot Join Meeting\n- Try joining via browser at teams.microsoft.com\n- Clear Teams cache: %appdata%/Microsoft/Teams (Windows)\n\n## Productivity Tips\n\n- Use /quiet in any chat to silence notifications\n- Press Ctrl+Shift+M to mute/unmute in a call\n- Use @channel only for truly urgent messages",
    tags: ["teams", "m365", "collaboration", "audio"],
  },
  {
    catIdx: 4,
    title: "Adobe Creative Cloud — Installation and Licensing",
    slug: "demo-adobe-cc",
    summary: "How to install Adobe Creative Cloud applications using your enterprise licence.",
    body: "## Installing Adobe Applications\n\n1. Go to the Software Center on your device\n2. Search for **Adobe Creative Cloud**\n3. Click Install — your licence is automatically assigned\n4. Once installed, open the Creative Cloud desktop app\n5. Install the specific apps you need (Photoshop, Illustrator, etc.)\n\n## Licence Limits\n\nEach licence allows 2 simultaneous device activations. If you receive an 'activation limit reached' error, sign out on your old device first.\n\n## Requesting a Licence\n\nIf you do not have access, submit a **Software License Request** in the service catalog. Business justification is required.",
    tags: ["adobe", "software", "licence", "creative"],
  },
  {
    catIdx: 4,
    title: "Zoom — Enterprise Configuration Guide",
    slug: "demo-zoom-guide",
    summary: "Configuring Zoom for enterprise use including SSO, recording, and background settings.",
    body: "## Signing In\n\nAlways sign in via **SSO** using your corporate email — do not create a personal Zoom account.\n\n1. Open Zoom\n2. Click **Sign In with SSO**\n3. Enter company domain: **company.zoom.us**\n4. Authenticate with your corporate credentials + MFA\n\n## Recording\n\n- **Local recording**: Enabled for all users. Stored on your device.\n- **Cloud recording**: Available to team leads and above. Requires host permission.\n- All recordings of external meetings must be disclosed to participants.\n\n## Virtual Backgrounds\n\nApproved company backgrounds are available in the IT portal. Personal backgrounds are permitted but must be professional.",
    tags: ["zoom", "video", "conferencing", "remote"],
  },
  // More articles for large preset
  {
    catIdx: 1,
    title: "SharePoint Migration — Permission Issues",
    slug: "demo-sharepoint-permissions",
    summary: "How to resolve access issues following the SharePoint Online migration.",
    body: "## Symptoms\n\nYou may see 'Access Denied' or missing folders after the October migration.\n\n## Root Cause\n\nApproximately 12% of user-to-group permission mappings were not carried over correctly during migration (see PRB-0003).\n\n## Immediate Workaround\n\n1. Submit a ticket referencing 'SharePoint migration permission'\n2. Your manager must confirm the access you previously had\n3. Infrastructure team will restore access within 4 business hours\n\n## Permanent Fix\n\nA corrective migration script is scheduled to run this weekend (see CRQ-0006). All affected users will be notified by email once complete.",
    tags: ["sharepoint", "migration", "permissions", "known-issue"],
  },
  {
    catIdx: 2,
    title: "Data Classification and Handling Policy",
    slug: "demo-data-classification",
    summary: "Summary of the corporate data classification levels and how to handle each type.",
    body: "## Classification Levels\n\n| Level | Definition | Examples |\n|---|---|---|\n| Public | Safe for external sharing | Marketing materials, public website |\n| Internal | For employees only | Policies, internal announcements |\n| Confidential | Need-to-know basis | Client data, financial reports |\n| Restricted | Strictly controlled | PII, payment data, legal matters |\n\n## Handling Rules\n\n- **Confidential and Restricted** data must never be stored on personal devices\n- Email containing Restricted data must be encrypted\n- Printing Restricted data requires manager approval and secure disposal\n\n## Reporting a Data Breach\n\nContact **security@company.internal** and the DPO immediately. Do not attempt to contain a breach yourself.",
    tags: ["security", "data", "compliance", "gdpr"],
  },
  {
    catIdx: 3,
    title: "Network Switch Failure — Escalation Guide",
    slug: "demo-switch-failure",
    summary: "Procedures for responding to network switch failures affecting an office floor or building.",
    body: "## Immediate Steps\n\n1. Confirm the scope: how many users/floors are affected?\n2. Open a P2 Incident immediately\n3. Check if the switch stack or a single port is affected\n\n## Diagnosis\n\n- Ping the switch management IP from the NOC\n- Check SNMP traps for fan/temperature/link-down events\n- Check power indicators on the switch unit physically\n\n## Escalation\n\nIf the switch cannot be reached via management IP and physical inspection confirms failure:\n1. Log an emergency hardware replacement request\n2. Redirect affected users to Wi-Fi as an interim workaround\n3. Contact the vendor (Cisco TAC / HP Networking) for RMA\n\n## Recovery\n\nAfter replacement, restore the switch configuration from the running backup in NetBox.",
    tags: ["network", "switch", "hardware", "incident-response"],
  },
  {
    catIdx: 0,
    title: "Employee Exit Checklist — IT",
    slug: "demo-exit-checklist",
    summary: "IT tasks to complete when an employee leaves the company.",
    body: "## Day of Departure\n\n- [ ] Disable Active Directory account\n- [ ] Revoke all MFA devices\n- [ ] Forward email to manager (max 30 days)\n- [ ] Remove from all security groups\n- [ ] Revoke VPN access\n- [ ] Sign out of all corporate SSO apps\n\n## Within 3 Business Days\n\n- [ ] Transfer OneDrive files to manager\n- [ ] Reassign any open tickets to a colleague\n- [ ] Remove from Teams channels and SharePoint sites\n- [ ] Return company hardware\n\n## Within 30 Days\n\n- [ ] Archive mailbox\n- [ ] Deactivate software licences (Adobe, Salesforce, etc.)\n- [ ] Update asset records (set device to 'in_stock')",
    tags: ["offboarding", "exit", "security", "checklist"],
  },
  {
    catIdx: 4,
    title: "Salesforce — Login and Access Troubleshooting",
    slug: "demo-salesforce-troubleshooting",
    summary: "Common Salesforce login issues and access problems for enterprise users.",
    body: "## Cannot Log In\n\n1. Ensure you are using SSO: go to **company.my.salesforce.com** (NOT salesforce.com)\n2. If SSO fails, your Salesforce profile may be inactive — contact IT\n\n## 'Insufficient Privileges' Error\n\nThis means your profile or permission set does not include the required object or field access.\n\n1. Note the exact object/field showing the error\n2. Submit an **Application Access Request** in the service catalog\n3. Your Salesforce admin will review and update your permissions\n\n## Reports and Dashboards Not Loading\n\n- Clear browser cache and cookies\n- Try a different browser (Chrome recommended)\n- If data is missing, your report may filter by owner — check the filter settings",
    tags: ["salesforce", "crm", "access", "troubleshooting"],
  },
];

// ── Macros ────────────────────────────────────────────────────────────────────

export const MACRO_POOL = [
  { title: "First Response — General",            body: "Hi {{customer_name}},\n\nThank you for reaching out to IT Support. I've received your ticket (#{{ticket_id}}) and I'm looking into it now.\n\nI'll have an update for you within the hour. If your situation is urgent, please reply to this message or call ext. 5000.\n\nBest regards,\n{{agent_name}}\nIT Service Desk" },
  { title: "Password Reset Instructions",          body: "Hi {{customer_name}},\n\nTo reset your password:\n\n1. Go to account.company.internal/reset\n2. Enter your corporate email\n3. Check your personal email for a reset link (valid 15 minutes)\n4. Create a new password meeting the policy requirements\n\nIf you're still having trouble, please reply to this ticket.\n\n{{agent_name}}" },
  { title: "VPN Troubleshooting Steps",            body: "Hi {{customer_name}},\n\nThank you for contacting us about your VPN issue. Please try:\n\n1. Disconnect from VPN completely\n2. Flush your DNS cache (Windows: ipconfig /flushdns)\n3. Reconnect and test access to an internal resource\n\nIf issues persist, please share:\n- Your OS version and VPN client version\n- The exact error message\n- Whether this happens on all networks or just specific ones\n\n{{agent_name}}" },
  { title: "Escalation to Tier 2",                body: "Hi {{customer_name}},\n\nI've reviewed your ticket (#{{ticket_id}}) and this requires our Tier 2 Engineering team to investigate further.\n\nI've escalated with full context. A Tier 2 engineer will contact you within 2 business hours. Your ticket number remains #{{ticket_id}} — no need to open a new one.\n\nApologies for the additional wait.\n\n{{agent_name}}" },
  { title: "Service Request Received",             body: "Hi {{customer_name}},\n\nYour service request (#{{ticket_id}}) has been received and is being processed.\n\nExpected completion: within 1-2 business days\n\nYou'll receive an email once your request is fulfilled.\n\n{{agent_name}}\nIT Fulfillment Team" },
  { title: "Scheduled Maintenance Notice",         body: "Hi {{customer_name}},\n\nYour issue (ticket #{{ticket_id}}) will be resolved during our scheduled maintenance window.\n\nDate: [MAINTENANCE DATE]\nTime: 10:00 PM – 2:00 AM\nImpact: [SYSTEM NAME] will be unavailable during this window\n\nNo action is required from you.\n\n{{agent_name}}\nIT Operations" },
  { title: "Incident Resolved — Monitoring",       body: "Hi {{customer_name}},\n\nThe issue reported in ticket #{{ticket_id}} has been resolved.\n\nRoot cause: [BRIEF DESCRIPTION]\nFix applied: [WHAT WAS DONE]\nMonitoring: We're watching systems for the next 24 hours\n\nPlease test your access and let us know if you experience any recurrence. We'll close this ticket in 48 hours if no issues are reported.\n\n{{agent_name}}" },
  { title: "Request for More Information",         body: "Hi {{customer_name}},\n\nTo resolve your ticket (#{{ticket_id}}) efficiently, could you please provide:\n\n1. [SPECIFIC QUESTION 1]\n2. [SPECIFIC QUESTION 2]\n3. Screenshot or error message if applicable\n\nOnce we have this, we can prioritise and resolve quickly.\n\n{{agent_name}}" },
  { title: "Hardware Collection Arranged",         body: "Hi {{customer_name}},\n\nYour hardware request has been fulfilled. Please collect your equipment from:\n\nLocation: IT Help Desk, Ground Floor, Building A\nCollection hours: Mon-Fri, 9:00 AM – 5:00 PM\nBring: Your employee ID badge\n\nIf you need delivery to your desk, reply to this ticket.\n\n{{agent_name}}" },
  { title: "Change Notification to User",          body: "Hi {{customer_name}},\n\nThis is to notify you that a scheduled change affecting your service will take place:\n\nChange: [CHANGE TITLE]\nScheduled: [DATE AND TIME]\nExpected impact: [BRIEF IMPACT DESCRIPTION]\nExpected duration: [DURATION]\n\nNo action is required. You will be notified once the change is complete.\n\n{{agent_name}}\nIT Change Management" },
  { title: "Access Granted Confirmation",          body: "Hi {{customer_name}},\n\nYour access request (ticket #{{ticket_id}}) has been approved and the access has been granted.\n\nSystem: [SYSTEM NAME]\nAccess level: [ROLE/PERMISSION]\nEffective: Immediately\n\nPlease verify your access and let us know if you encounter any issues.\n\n{{agent_name}}" },
  { title: "Duplicate Ticket — Closing",           body: "Hi {{customer_name}},\n\nWe've found that your ticket (#{{ticket_id}}) is a duplicate of an existing open ticket.\n\nWe're closing this ticket and your issue is being tracked under #[ORIGINAL TICKET]. You will receive all updates there.\n\nApologies for any confusion.\n\n{{agent_name}}" },
];

// ── Catalog items ─────────────────────────────────────────────────────────────

export const CATALOG_ITEM_POOL = [
  { name: "New Employee Onboarding",       description: "Complete IT setup for new hires: laptop, accounts, software, and access grants.",          teamIdx: 0 },
  { name: "VPN Access Request",            description: "Request remote access VPN credentials for working from home or travelling.",                  teamIdx: 2 },
  { name: "Software Licence Request",      description: "Request a licence for approved business software. Include name and business justification.",  teamIdx: 0 },
  { name: "Hardware Equipment Request",    description: "Request new or replacement hardware: laptops, monitors, keyboards, docking stations.",        teamIdx: 1 },
  { name: "Application Access Request",    description: "Request access to an internal or third-party application with role assignment.",              teamIdx: 2 },
  { name: "Cloud Resource Provisioning",   description: "Request AWS/Azure cloud resources (EC2, S3, RDS, VMs) for project or operational needs.",     teamIdx: 3 },
  { name: "Employee Exit IT Checklist",    description: "IT offboarding tasks: account suspension, device recovery, and licence revocation.",          teamIdx: 0 },
  { name: "Security Awareness Training",   description: "Enrol in mandatory cybersecurity awareness training modules.",                                teamIdx: 2 },
  { name: "Office Relocation IT Support",  description: "Schedule IT support for office move: network, phones, AV equipment setup.",                  teamIdx: 1 },
  { name: "Database Access Request",       description: "Request read or read-write access to a named database schema with DBA review.",               teamIdx: 4 },
];

// ── Ticket pool ───────────────────────────────────────────────────────────────

export const TICKET_POOL = [
  { subject: "Cannot access email after password change",         priority: "high"   as const, status: "in_progress" as const, custIdx: 0,  agentIdx: 1, teamIdx: 0, body: "I changed my password this morning and now Outlook won't accept it. Error: 'Authentication Failed'. I need access urgently — client meeting in 2 hours." },
  { subject: "Laptop running extremely slowly",                   priority: "high"   as const, status: "open"        as const, custIdx: 3,  agentIdx: 2, teamIdx: 0, body: "My laptop has been getting slower every day. It now takes 10+ minutes to boot. I have an important presentation tomorrow." },
  { subject: "Request: 27-inch monitor for home office",          priority: "medium" as const, status: "resolved"    as const, custIdx: 2,  agentIdx: 9, teamIdx: 0, body: "Working from home full-time now. Only have laptop screen — causing eye strain. Could I get a monitor?" },
  { subject: "MFA app not generating codes — locked out",         priority: "urgent" as const, status: "resolved"    as const, custIdx: 5,  agentIdx: 6, teamIdx: 2, body: "My Microsoft Authenticator stopped working after I got a new phone. I can't log in to any corporate system." },
  { subject: "Shared drive permissions — cannot access Finance",  priority: "medium" as const, status: "open"        as const, custIdx: 8,  agentIdx: 3, teamIdx: 1, body: "Since the SharePoint migration, I can no longer access the Q3 Finance reports folder. I had access before." },
  { subject: "Zoom not working — no audio or video",              priority: "high"   as const, status: "in_progress" as const, custIdx: 6,  agentIdx: 8, teamIdx: 0, body: "Since the Windows update yesterday, Zoom meetings have no audio and the camera doesn't work." },
  { subject: "Request: GitHub Enterprise access",                 priority: "low"    as const, status: "resolved"    as const, custIdx: 1,  agentIdx: 3, teamIdx: 3, body: "Joining the platform engineering team and need access to our GitHub Enterprise organisation." },
  { subject: "Printer on Floor 3 showing offline",                priority: "medium" as const, status: "resolved"    as const, custIdx: 7,  agentIdx: 7, teamIdx: 1, body: "The HP LaserJet on the 3rd floor has been offline since this morning. Multiple people need to print urgently." },
  { subject: "Cannot install software — no admin rights",         priority: "medium" as const, status: "open"        as const, custIdx: 9,  agentIdx: 1, teamIdx: 0, body: "I need to install Adobe Acrobat Pro for a document review project. IT approved the licence but I can't install without admin rights." },
  { subject: "Email signature not showing on mobile",             priority: "low"    as const, status: "open"        as const, custIdx: 10, agentIdx: 9, teamIdx: 0, body: "My email signature shows correctly in Outlook on my laptop but doesn't appear when I send from my iPhone." },
  { subject: "VPN disconnecting every 45 minutes",                priority: "medium" as const, status: "in_progress" as const, custIdx: 11, agentIdx: 7, teamIdx: 1, body: "For the past two weeks my VPN drops every 45 minutes exactly. Very disruptive when in the middle of work." },
  { subject: "Teams calls dropping after 30 minutes",             priority: "high"   as const, status: "open"        as const, custIdx: 0,  agentIdx: 3, teamIdx: 1, body: "Microsoft Teams calls are dropping consistently after about 30 minutes. Affecting our entire department." },
  { subject: "Request: Standing desk — medical recommendation",   priority: "low"    as const, status: "resolved"    as const, custIdx: 3,  agentIdx: 9, teamIdx: 0, body: "Physiotherapist has recommended a sit-stand desk. I have a medical note. What is the approval process?" },
  { subject: "Suspicious phishing email received",                priority: "urgent" as const, status: "resolved"    as const, custIdx: 5,  agentIdx: 4, teamIdx: 2, body: "Received an email claiming to be from 'IT Security' asking me to click a link to 'verify credentials'. Sender is from gmail. I did NOT click it." },
  { subject: "Wi-Fi dropping intermittently — Floor 4",           priority: "high"   as const, status: "in_progress" as const, custIdx: 6,  agentIdx: 7, teamIdx: 1, body: "Multiple staff on Floor 4 East wing reporting Wi-Fi dropouts throughout the day. Affecting about 20 people. Started Monday." },
  { subject: "Onboarding request: 3 new hires, Dec 2",            priority: "medium" as const, status: "open"        as const, custIdx: 0,  agentIdx: 1, teamIdx: 0, body: "Three new hires starting December 2: Project Manager, UX Designer, Data Analyst. Standard IT setup package required." },
  { subject: "Office 365 licence not assigned to new user",       priority: "high"   as const, status: "in_progress" as const, custIdx: 12, agentIdx: 9, teamIdx: 0, body: "New employee started today but cannot access any M365 apps. Licence does not appear to be assigned." },
  { subject: "Server room temperature alert",                     priority: "urgent" as const, status: "resolved"    as const, custIdx: 14, agentIdx: 3, teamIdx: 1, body: "Received alert: server room temperature exceeding 27°C. AC unit showing fault code E4. Need urgent assistance." },
  { subject: "Request: Snowflake read access for finance",        priority: "medium" as const, status: "open"        as const, custIdx: 19, agentIdx: 6, teamIdx: 2, body: "Need read access to the production Snowflake data warehouse for quarterly financial reporting." },
  { subject: "Cannot connect to corporate database from home",    priority: "medium" as const, status: "open"        as const, custIdx: 7,  agentIdx: 7, teamIdx: 1, body: "I can connect to the VPN but cannot reach the database server at db01.prod. Was working last week." },
  { subject: "Slack workspace showing connection error",           priority: "medium" as const, status: "resolved"    as const, custIdx: 1,  agentIdx: 8, teamIdx: 3, body: "Slack desktop app not loading any channels. Web client works fine." },
  { subject: "SSL certificate warning on internal wiki",           priority: "medium" as const, status: "open"        as const, custIdx: 13, agentIdx: 3, teamIdx: 1, body: "Browser shows 'Your connection is not private' when visiting the internal Confluence wiki." },
  { subject: "Request: Dual monitors for design team",             priority: "medium" as const, status: "open"        as const, custIdx: 3,  agentIdx: 9, teamIdx: 0, body: "The 3 product designers who moved to the open-plan office have no external displays. Requesting 2x 27\" monitors each." },
  { subject: "Antivirus blocking legitimate application",          priority: "high"   as const, status: "in_progress" as const, custIdx: 11, agentIdx: 6, teamIdx: 2, body: "CrowdStrike is quarantining our internal build tool every time it runs. The application is legitimate and internally developed." },
  { subject: "Cannot export data from Salesforce",                 priority: "medium" as const, status: "open"        as const, custIdx: 4,  agentIdx: 9, teamIdx: 0, body: "When I try to export a report to Excel in Salesforce it says 'Insufficient privileges'. I could do this before the permission update." },
  { subject: "Remote desktop connection timing out",               priority: "medium" as const, status: "in_progress" as const, custIdx: 15, agentIdx: 2, teamIdx: 0, body: "My RDP session to the application server drops after exactly 15 minutes of inactivity. This is causing lost work." },
  { subject: "Backup job failure — fileserver01",                  priority: "urgent" as const, status: "in_progress" as const, custIdx: 14, agentIdx: 3, teamIdx: 1, body: "Veeam backup job for fileserver01 has failed for the past 3 nights with error 'insufficient storage'. Storage review needed." },
  { subject: "Office 365 shared mailbox not syncing",             priority: "medium" as const, status: "open"        as const, custIdx: 12, agentIdx: 1, teamIdx: 0, body: "The finance@company.com shared mailbox is not appearing in Outlook for two members of the Finance team after their laptop refresh." },
  { subject: "Request: AWS training vouchers",                     priority: "low"    as const, status: "resolved"    as const, custIdx: 20, agentIdx: 8, teamIdx: 3, body: "Requesting AWS Solutions Architect exam vouchers for 3 team members. Budget approved by engineering director." },
  { subject: "Zoom background causing lag in meetings",            priority: "low"    as const, status: "open"        as const, custIdx: 9,  agentIdx: 1, teamIdx: 0, body: "When I use a virtual background in Zoom, the CPU spikes to 100% and the call becomes choppy for everyone." },
];

// ── Incident pool ─────────────────────────────────────────────────────────────

export const INCIDENT_POOL = [
  { title: "Production Database Cluster — Primary Node Failure",    description: "The primary PostgreSQL node has failed over to the replica. Write latency is elevated.",                    status: "resolved"     as const, priority: "p1" as const, isMajor: true,  affectedSystem: "PostgreSQL Production Cluster", affectedUsers: 400, cmdIdx: 0, assignIdx: 3, teamIdx: 1, updates: ["P1 declared. Failover completed in 42 s. Investigation in progress.", "OOM killer terminated postgres due to runaway analytics query. Timeout set to 30 s. Primary restored."] },
  { title: "Email Gateway Outage — Inbound Queue Backed Up",        description: "SendGrid inbound email pipeline stopped delivering. ~200 emails stuck in queue.",                           status: "resolved"     as const, priority: "p2" as const, isMajor: false, affectedSystem: "Email Gateway",                 affectedUsers: 200, cmdIdx: 4, assignIdx: 7, teamIdx: 1, updates: ["Webhook endpoint returning 503. Engineering engaged.", "Deployment at 14:19 introduced regex error. Rolled back. Queue processing resumed."] },
  { title: "MFA Service Degraded — Authentication Delays",          description: "Users experiencing 30-90 second delays when completing MFA prompts.",                                      status: "in_progress"  as const, priority: "p2" as const, isMajor: false, affectedSystem: "Azure AD / MFA",               affectedUsers: 150, cmdIdx: 4, assignIdx: 6, teamIdx: 2, updates: ["Microsoft confirms Azure AD degradation in East US. Case #2847391 opened.", "Impact reduced to ~40% of users. Workaround: use backup codes."] },
  { title: "Security Alert — Unusual Admin Login Activity",         description: "Login attempts to 3 privileged accounts from unusual geographic location. 2 successful logins recorded.", status: "in_progress"  as const, priority: "p1" as const, isMajor: true,  affectedSystem: "Identity & Access Management",  affectedUsers: 5,   cmdIdx: 4, assignIdx: 6, teamIdx: 2, updates: ["P1 declared. All affected accounts suspended. CISO and Legal notified.", "Credentials obtained via phishing. No evidence of lateral movement yet."] },
  { title: "CI/CD Pipeline Failure — Builds Blocked",               description: "All Jenkins builds failing with permission error after Kubernetes service account rotation.",               status: "resolved"     as const, priority: "p2" as const, isMajor: false, affectedSystem: "Jenkins / Kubernetes",          affectedUsers: 12,  cmdIdx: 0, assignIdx: 8, teamIdx: 3, updates: ["Failures started with RBAC rotation. Jenkins service account secret not updated in Vault.", "Updated credentials. All builds passing."] },
  { title: "Network Switch Stack Failure — Floor 4",                description: "Switch stack serving Floor 4 East wing lost connectivity. 80 users without wired network.",               status: "in_progress"  as const, priority: "p2" as const, isMajor: false, affectedSystem: "Network Infrastructure — Floor 4", affectedUsers: 80, cmdIdx: 0, assignIdx: 7, teamIdx: 1, updates: ["Physical inspection confirms master switch failure. Replacement in transit — ETA 2 hours."] },
  { title: "Ransomware Alert — Isolated Endpoint",                  description: "CrowdStrike detected ransomware indicators on WIN-KPATEL-01. Endpoint isolated.",                         status: "resolved"     as const, priority: "p1" as const, isMajor: false, affectedSystem: "Endpoint Security",             affectedUsers: 1,   cmdIdx: 4, assignIdx: 6, teamIdx: 2, updates: ["Malicious process terminated via CrowdStrike RTR. Initial vector: malicious PDF.", "Endpoint reimaged. User password reset. No propagation detected."] },
  { title: "Storage Array Performance Degradation",                 description: "NetApp storage showing elevated latency (>50 ms average, up from normal 2 ms).",                          status: "acknowledged" as const, priority: "p3" as const, isMajor: false, affectedSystem: "NetApp Storage Array",          affectedUsers: 50,  cmdIdx: 0, assignIdx: 3, teamIdx: 1, updates: ["One SSD showing pre-failure indicators. Proactive drive replacement scheduled tonight."] },
  { title: "Slack Workspace Connectivity Issues",                   description: "Users unable to connect via desktop app. Web client functional.",                                          status: "resolved"     as const, priority: "p3" as const, isMajor: false, affectedSystem: "Slack (SaaS)",                  affectedUsers: 30,  cmdIdx: 0, assignIdx: 8, teamIdx: 3, updates: ["Slack confirmed brief service disruption affecting desktop clients. Resolved 15:30. Users restart client."] },
  { title: "SSL Certificate Expiry — External API Gateway",         description: "SSL certificate for api.company.external expires in 48 hours. Automated renewal failed.",                 status: "new"          as const, priority: "p2" as const, isMajor: false, affectedSystem: "External API Gateway",          affectedUsers: 200, cmdIdx: 0, assignIdx: 3, teamIdx: 1, updates: [] },
  { title: "Database Connection Pool Exhaustion",                   description: "Connection pool exhausted during nightly reporting window. Applications throwing timeout errors.",          status: "resolved"     as const, priority: "p2" as const, isMajor: false, affectedSystem: "PostgreSQL Reporting Pool",     affectedUsers: 120, cmdIdx: 0, assignIdx: 12, teamIdx: 4, updates: ["Analytics jobs consuming all 100 connections. Reporting jobs rate-limited.", "PgBouncer deployed to manage pooling. Connections stable."] },
  { title: "Server Room HVAC Failure — Temperature Rising",         description: "HVAC unit in Server Room B reporting fault code E4. Temperature rising above threshold.",                  status: "resolved"     as const, priority: "p1" as const, isMajor: true,  affectedSystem: "Server Room B HVAC",            affectedUsers: 0,   cmdIdx: 0, assignIdx: 3, teamIdx: 1, updates: ["Emergency HVAC engineer on-site. Portable cooling units deployed.", "HVAC repaired. Temperature normalised. No hardware failures recorded."] },
  { title: "Active Directory Replication Failure",                  description: "AD replication between DC01 and DC02 has been failing for 6 hours. Authentication errors sporadic.",      status: "in_progress"  as const, priority: "p2" as const, isMajor: false, affectedSystem: "Active Directory",              affectedUsers: 60,  cmdIdx: 0, assignIdx: 3, teamIdx: 1, updates: ["repadmin /showrepl shows consistent RPC errors. Network team engaged to check VLAN routing."] },
  { title: "Veeam Backup Job Failures — Fileserver01",              description: "Backup job for fileserver01 failed 3 consecutive nights. Error: insufficient storage.",                    status: "in_progress"  as const, priority: "p2" as const, isMajor: false, affectedSystem: "Backup Infrastructure",         affectedUsers: 0,   cmdIdx: 0, assignIdx: 3, teamIdx: 1, updates: ["Backup storage at 97% capacity. Retention policy review required."] },
  { title: "Application Server CPU Spike — ERP System",             description: "ERP application servers showing sustained 95%+ CPU. Response times 10x normal.",                         status: "resolved"     as const, priority: "p2" as const, isMajor: false, affectedSystem: "ERP Application Cluster",       affectedUsers: 85,  cmdIdx: 0, assignIdx: 12, teamIdx: 4, updates: ["Runaway stored procedure identified consuming excessive CPU.", "Procedure patched and deployed. CPU normalised."] },
  { title: "Wi-Fi Authentication Server (RADIUS) Down",             description: "RADIUS server unavailable. Users unable to authenticate to CORP-SECURE Wi-Fi.",                           status: "resolved"     as const, priority: "p2" as const, isMajor: false, affectedSystem: "RADIUS / Wi-Fi Authentication", affectedUsers: 110, cmdIdx: 0, assignIdx: 7, teamIdx: 1, updates: ["RADIUS service crashed due to log partition full. Logs archived, service restarted.", "All Wi-Fi authenticating normally."] },
  { title: "Third-party API Integration Failure — Payment Gateway", description: "Payment gateway API returning 502 errors. Checkout flow completely broken.",                              status: "resolved"     as const, priority: "p1" as const, isMajor: true,  affectedSystem: "Payment Gateway Integration",    affectedUsers: 500, cmdIdx: 4, assignIdx: 14, teamIdx: 3, updates: ["Gateway provider confirmed their API is down. DRP activated. Fallback payment method enabled.", "Gateway restored. Transactions processing normally."] },
  { title: "DNS Resolution Failure — Internal Zones",               description: "Internal DNS resolution failing for *.company.internal zone. Multiple services unreachable.",             status: "resolved"     as const, priority: "p2" as const, isMajor: false, affectedSystem: "DNS Infrastructure",            affectedUsers: 200, cmdIdx: 0, assignIdx: 7, teamIdx: 1, updates: ["Primary DNS server not responding. Failover to secondary initiated.", "Root cause: DNS server NIC driver crash. Rebooted. Both DNS servers healthy."] },
  { title: "Firewall Policy Misconfiguration — Blocking East-West", description: "Change window last night introduced incorrect ACL rules blocking east-west traffic between VLANs.",     status: "resolved"     as const, priority: "p2" as const, isMajor: false, affectedSystem: "Core Firewall",                 affectedUsers: 90,  cmdIdx: 0, assignIdx: 7, teamIdx: 1, updates: ["Identified incorrect deny rule inserted at position 15. Rule removed.", "Traffic restored. Root cause: automation script applied rules in wrong order."] },
  { title: "Okta SSO Outage — All SaaS Apps Unreachable",           description: "Okta SSO service returning 503. Users unable to authenticate to any SSO-enabled applications.",           status: "resolved"     as const, priority: "p1" as const, isMajor: true,  affectedSystem: "Okta SSO",                      affectedUsers: 350, cmdIdx: 4, assignIdx: 6, teamIdx: 2, updates: ["Okta status page confirms global incident. Escalated to Okta Priority 1 support.", "Okta incident resolved. All SSO applications accessible."] },
];

// ── Service Request pool ──────────────────────────────────────────────────────

export const REQUEST_POOL = [
  { title: "New Employee IT Setup — J. Nakamura (Start: Nov 4)",  status: "in_fulfillment" as const, priority: "high"   as const, requesterIdx: 0,  catalogIdx: 0, description: "Please provision complete IT setup for new hire joining Finance. Required: MacBook Pro, M365, Slack, Zoom, Netsuite, Workday access." },
  { title: "VPN Access — Q. Reeves (hybrid arrangement)",          status: "approved"       as const, priority: "medium" as const, requesterIdx: 0,  catalogIdx: 1, description: "Requesting VPN for Quinn Reeves transitioning to hybrid work. Full-tunnel access required for development environment." },
  { title: "Adobe Creative Cloud — 3 licences for Design",         status: "fulfilled"      as const, priority: "high"   as const, requesterIdx: 1,  catalogIdx: 2, description: "3 Adobe Creative Cloud All-Apps licences for the marketing design team. Current trial expires in 5 days." },
  { title: "Replacement Laptop — Water Damage (R. Thompson)",      status: "in_fulfillment" as const, priority: "urgent" as const, requesterIdx: 3,  catalogIdx: 3, description: "Laptop sustained water damage this morning. Needs immediate replacement. Client presentation at 2 PM." },
  { title: "Jira Software Access — Platform Engineering (4 devs)", status: "fulfilled"      as const, priority: "medium" as const, requesterIdx: 0,  catalogIdx: 4, description: "Requesting Jira Software access for 4 new engineers joining the platform team next week." },
  { title: "AWS EC2 Instance for ML Training — PROJ-4821",         status: "pending_approval" as const, priority: "medium" as const, requesterIdx: 3, catalogIdx: 5, description: "Requesting p3.2xlarge EC2 in us-east-1 for ML model training. Budget code: ML-PROJ-2024. Expected: 2 weeks." },
  { title: "Ergonomic Standing Desk — A. Patel (medical note)",    status: "fulfilled"      as const, priority: "low"    as const, requesterIdx: 3,  catalogIdx: 3, description: "Physiotherapy recommendation for sit-stand desk. Medical documentation attached." },
  { title: "Snowflake Read Access — Finance quarterly reporting",   status: "pending_approval" as const, priority: "medium" as const, requesterIdx: 1, catalogIdx: 4, description: "Need read access to production Snowflake for quarterly financial reporting. Requires data governance approval." },
  { title: "Dual Monitor Setup — 3 product designers",             status: "submitted"      as const, priority: "medium" as const, requesterIdx: 3,  catalogIdx: 3, description: "3 product designers moved to open-plan office have no external displays. Requesting 2x 27\" 4K monitors each." },
  { title: "New Employee Onboarding — Batch (3 hires, Dec 2)",     status: "submitted"      as const, priority: "medium" as const, requesterIdx: 0,  catalogIdx: 0, description: "Three new hires starting December 2: Project Manager, UX Designer, Data Analyst. MacBooks preferred." },
  { title: "Salesforce CRM Access — Sales enablement team",        status: "fulfilled"      as const, priority: "medium" as const, requesterIdx: 12, catalogIdx: 4, description: "5 members of the new sales enablement team need Salesforce Sales Cloud access with standard user profiles." },
  { title: "GitLab Premium upgrade — DevOps team",                 status: "approved"       as const, priority: "medium" as const, requesterIdx: 10, catalogIdx: 2, description: "Current GitLab Community Edition hitting limits for CI pipeline parallelism. Requesting upgrade to Premium for the team." },
  { title: "Cisco IP Phones — 12 units for new office",             status: "in_fulfillment" as const, priority: "medium" as const, requesterIdx: 14, catalogIdx: 3, description: "Ordering 12 Cisco 8845 IP phones for the new London office. VoIP VLAN provisioning also required." },
  { title: "AWS WAF rule update — rate limiting for public API",    status: "pending_approval" as const, priority: "high" as const, requesterIdx: 10, catalogIdx: 5, description: "Requesting WAF rate limiting rules on api.company.external to protect against scraping bots seen this week." },
  { title: "Microsoft Copilot M365 — pilot for 10 users",          status: "submitted"      as const, priority: "low"   as const, requesterIdx: 1,  catalogIdx: 2, description: "Requesting 10 Microsoft Copilot M365 licences for a 90-day pilot. Finance team volunteers identified." },
  { title: "CrowdStrike exception — internal build tool",           status: "approved"       as const, priority: "high"  as const, requesterIdx: 11, catalogIdx: 4, description: "CrowdStrike blocking our internal build binary. Requesting process hash exclusion after security review." },
  { title: "Zoom Rooms hardware — Board Room A & B",               status: "fulfilled"      as const, priority: "medium" as const, requesterIdx: 14, catalogIdx: 3, description: "Requesting Zoom Rooms kits for both board rooms ahead of the executive offsite next quarter." },
  { title: "HashiCorp Vault — team namespace for Platform Eng",     status: "submitted"      as const, priority: "medium" as const, requesterIdx: 10, catalogIdx: 5, description: "Requesting a dedicated Vault namespace and policy set for the Platform Engineering team's secrets management." },
  { title: "Penetration test — external web applications",          status: "pending_approval" as const, priority: "high" as const, requesterIdx: 5, catalogIdx: 7, description: "Annual pen test for company.com, portal.company.com, and api.company.external. Vendor: SecureWorks. Scope doc attached." },
  { title: "New Relic APM licences — 5 additional seats",          status: "submitted"      as const, priority: "medium" as const, requesterIdx: 10, catalogIdx: 2, description: "DevOps team needs 5 additional New Relic full platform seats to cover new microservices added this quarter." },
];

// ── Problem pool ──────────────────────────────────────────────────────────────

export const PROBLEM_POOL = [
  { title: "Recurring Database Connection Pool Exhaustion",        status: "root_cause_identified" as const, priority: "high" as const, isKnownError: true,  affectedService: "PostgreSQL Production",     incidentIdxs: [0, 10], rootCause: "Nightly analytics reporting jobs consume all 100 connections in shared pool during the 02:00-04:00 UTC window.", workaround: "Restart the connection pool manager. Kill long-running reporting queries via pg_cancel_backend(). Alert set at 80% utilisation." },
  { title: "Windows 11 24H2 VPN Disconnection — Systematic",       status: "change_required"       as const, priority: "medium" as const, isKnownError: true, affectedService: "Corporate VPN",             incidentIdxs: [],       rootCause: "Windows 11 24H2 introduces aggressive network adapter power management that overrides per-adapter settings, causing VPN keep-alive failures.", workaround: "Disable power management for all network adapters via Group Policy: Computer Configuration → Network Connections → Prohibit use of Internet Connection Sharing." },
  { title: "SharePoint Migration — Permission Mapping Failures",   status: "under_investigation"   as const, priority: "high" as const, isKnownError: false, affectedService: "SharePoint Online",         incidentIdxs: [],       rootCause: null, workaround: "Affected users submit a ticket. Infrastructure team manually adds them to the correct SharePoint groups within 4 business hours." },
  { title: "MFA Enrollment Failures — New Employee Onboarding",    status: "under_investigation"   as const, priority: "medium" as const, isKnownError: false, affectedService: "Azure AD MFA Enrollment", incidentIdxs: [2],      rootCause: null, workaround: "Assign an IT buddy during first-day onboarding to walk through MFA enrollment in person." },
  { title: "Email Parser ReDoS Vulnerability",                     status: "change_required"       as const, priority: "high" as const, isKnownError: true,  affectedService: "Email Processing Pipeline", incidentIdxs: [1],      rootCause: "The email subject parser uses a catastrophically backtracking regular expression causing exponential CPU use on specially crafted inputs.", workaround: "Added 100 ms execution timeout on regex engine. Malformed emails are quarantined rather than causing pipeline failures." },
  { title: "Storage Array Pre-failure Drive — Proactive Risk",     status: "known_error"           as const, priority: "medium" as const, isKnownError: true, affectedService: "NetApp Storage Array Site A", incidentIdxs: [7],    rootCause: "One SSD drive in the aggregate is exhibiting pre-failure SMART indicators. Risk of data loss within 2-4 weeks if not replaced.", workaround: "Read-heavy workloads can continue safely. Avoid write-intensive operations on affected aggregate until drive replacement is complete." },
  { title: "Active Directory Replication Latency — Intermittent",  status: "under_investigation"   as const, priority: "medium" as const, isKnownError: false, affectedService: "Active Directory",        incidentIdxs: [12],     rootCause: null, workaround: "Monitor repadmin /showrepl on both DCs. If replication lag exceeds 10 minutes, restart the NETLOGON service on the lagging DC." },
  { title: "Backup Storage Capacity — Structural Shortage",        status: "change_required"       as const, priority: "high" as const, isKnownError: true,  affectedService: "Backup Infrastructure",    incidentIdxs: [13],     rootCause: "Backup storage grew 40% this year due to new application deployments but capacity was not scaled to match. Retention policy was not enforced.", workaround: "Manually expire oldest backup restore points. Exclude large test datasets from nightly backup scope." },
  { title: "RADIUS Authentication Performance Under Load",         status: "root_cause_identified" as const, priority: "medium" as const, isKnownError: true, affectedService: "Wi-Fi RADIUS Service",     incidentIdxs: [15],     rootCause: "RADIUS log partition fills up every 45-60 days due to verbose logging mode enabled during a previous troubleshooting session.", workaround: "Set a calendar reminder to archive RADIUS logs monthly. Short-term: reduce log verbosity to WARN level." },
  { title: "CI/CD Service Account Secret Rotation — Missing Steps", status: "change_required"     as const, priority: "medium" as const, isKnownError: true,  affectedService: "Jenkins / Kubernetes",     incidentIdxs: [4],     rootCause: "Kubernetes RBAC rotation runbook does not include Jenkins, Vault, or ArgoCD as dependent systems. Secret rotation breaks these services every 90 days.", workaround: "Manually update Jenkins credentials in Vault immediately after each RBAC rotation cycle until automation is in place." },
];

// ── Change pool ───────────────────────────────────────────────────────────────

export const CHANGE_POOL = [
  { title: "PostgreSQL Connection Pool Limit Increase + PgBouncer", changeType: "normal"    as const, state: "closed"    as const, risk: "medium"   as const, priority: "high"   as const, impact: "medium" as const, problemIdx: 0,  assignIdx: 3,  teamIdx: 1, justification: "Recurring P2 incidents due to connection pool exhaustion (PRB-0001). Without this change, incidents recur monthly.", rollbackPlan: "Revert max_connections to 100 and restart PostgreSQL. PgBouncer can be disabled without application restart." },
  { title: "GPO — Disable Network Adapter Power Management",         changeType: "standard"  as const, state: "implement" as const, risk: "low"      as const, priority: "medium" as const, impact: "medium" as const, problemIdx: 1,  assignIdx: 7,  teamIdx: 1, justification: "35+ users affected by VPN drops every 45 minutes since Windows 11 24H2. GPO is the permanent fix (PRB-0002).", rollbackPlan: "Delete the GPO object. Policy unlinked within next Group Policy refresh cycle (90 minutes)." },
  { title: "Emergency: SSL Certificate Renewal — api.company.external", changeType: "emergency" as const, state: "scheduled" as const, risk: "low"   as const, priority: "urgent" as const, impact: "high"   as const, problemIdx: -1, assignIdx: 3,  teamIdx: 1, justification: "Certificate expires in 48 hours. Automated Let's Encrypt renewal failed due to DNS challenge misconfiguration.", rollbackPlan: "Revert to the expiring certificate — HTTPS still functional until expiry." },
  { title: "CrowdStrike Sensor Upgrade — v7.14",                     changeType: "standard"  as const, state: "authorize" as const, risk: "low"      as const, priority: "medium" as const, impact: "low"    as const, problemIdx: -1, assignIdx: 6,  teamIdx: 2, justification: "Security vendor advisory: v7.14 contains critical ransomware detection improvements. Aligns with monthly patch window.", rollbackPlan: "CrowdStrike sensor rollback via Falcon console. 15-minute rollback process per endpoint group." },
  { title: "Kubernetes RBAC Secret Rotation Automation",              changeType: "normal"    as const, state: "assess"   as const, risk: "medium"   as const, priority: "medium" as const, impact: "medium" as const, problemIdx: 9,  assignIdx: 8,  teamIdx: 3, justification: "INC-0005 caused by Jenkins not included in rotation runbook. Automation eliminates human error.", rollbackPlan: "Revert the rotation schedule to manual. Runbook version-controlled in Git." },
  { title: "SharePoint Permission Migration Remediation Script",      changeType: "normal"    as const, state: "submitted" as const, risk: "low"     as const, priority: "high"   as const, impact: "medium" as const, problemIdx: 2,  assignIdx: 3,  teamIdx: 1, justification: "80 users unable to access resources for 2 weeks. Every day causes productivity loss.", rollbackPlan: "Script generates a restore point before changes. Run restore-point script to revert all permission changes if needed." },
  { title: "Email Parser — Replace Backtracking Regex",               changeType: "normal"    as const, state: "draft"    as const, risk: "low"      as const, priority: "high"   as const, impact: "low"    as const, problemIdx: 4,  assignIdx: 8,  teamIdx: 3, justification: "ReDoS vulnerability causing email pipeline failures on crafted inputs (PRB-0005). Current workaround quarantines legitimate emails.", rollbackPlan: "Revert the code change in Git and redeploy. Zero-downtime deployment so rollback requires no outage window." },
  { title: "Network Switch Replacement — Floor 4 Stack",              changeType: "emergency" as const, state: "closed"   as const, risk: "low"      as const, priority: "urgent" as const, impact: "high"   as const, problemIdx: -1, assignIdx: 7,  teamIdx: 1, justification: "Hardware failure: Floor 4 switch stack master unit has failed. 80 users without wired network.", rollbackPlan: "N/A — emergency hardware replacement. Previous switch is unrecoverable." },
  { title: "PgBouncer Deployment — Reporting Schema Read Pool",       changeType: "normal"    as const, state: "scheduled" as const, risk: "medium"  as const, priority: "medium" as const, impact: "medium" as const, problemIdx: 0,  assignIdx: 12, teamIdx: 4, justification: "Separate connection pool for reporting queries prevents interference with OLTP operations during peak reporting windows.", rollbackPlan: "Remove PgBouncer listener from reporting schema. Applications fall back to direct PostgreSQL connections." },
  { title: "Enable Cloudflare WAF — Production Web Properties",       changeType: "normal"    as const, state: "authorize" as const, risk: "medium"  as const, priority: "high"   as const, impact: "high"   as const, problemIdx: -1, assignIdx: 10, teamIdx: 5, justification: "Security team identified increasing bot/scraping traffic against public web properties. WAF will block malicious patterns.", rollbackPlan: "Disable WAF ruleset in Cloudflare dashboard. Traffic passes through unfiltered in under 60 seconds." },
  { title: "Database Backup Storage Expansion — 40 TB",              changeType: "standard"  as const, state: "submitted" as const, risk: "low"      as const, priority: "high"   as const, impact: "medium" as const, problemIdx: 7,  assignIdx: 3,  teamIdx: 1, justification: "Backup storage at 97% capacity. Without expansion, backup jobs will fail within 5 days (PRB-0008).", rollbackPlan: "Storage expansion is non-destructive. If new storage fails to provision, extend retention reduction as temporary measure." },
  { title: "Okta Conditional Access Policy — High-Risk Login Block",  changeType: "normal"    as const, state: "assess"   as const, risk: "high"     as const, priority: "high"   as const, impact: "high"   as const, problemIdx: -1, assignIdx: 6,  teamIdx: 2, justification: "Following INC-0003 and INC-0019, blocking logins from high-risk Okta signals will prevent credential-based intrusions.", rollbackPlan: "Delete the Okta conditional access policy. Takes effect within 5 minutes. Users able to log in from any location." },
  { title: "RADIUS Log Rotation — Automated Monthly Archive",         changeType: "standard"  as const, state: "implement" as const, risk: "low"      as const, priority: "medium" as const, impact: "low"    as const, problemIdx: 8,  assignIdx: 7,  teamIdx: 1, justification: "Log partition fills every 45-60 days causing RADIUS crashes. Automated rotation prevents recurrence (PRB-0009).", rollbackPlan: "Disable the cron job. Manual log management resumes. No data loss risk." },
  { title: "Terraform Module — Standardise EC2 Tagging",              changeType: "standard"  as const, state: "closed"   as const, risk: "low"      as const, priority: "low"    as const, impact: "low"    as const, problemIdx: -1, assignIdx: 8,  teamIdx: 3, justification: "AWS cost allocation reports are inaccurate due to inconsistent resource tagging. Enforcing tags via Terraform module fixes this.", rollbackPlan: "Revert Terraform module version in the registry. Existing untagged resources are not affected." },
  { title: "IDS Signature Update — Financial Malware Campaign",       changeType: "emergency" as const, state: "closed"   as const, risk: "low"      as const, priority: "urgent" as const, impact: "medium" as const, problemIdx: -1, assignIdx: 6,  teamIdx: 2, justification: "Threat intelligence feed identified active campaign targeting financial sector. Emergency signature push required.", rollbackPlan: "Roll back to previous IDS signature version via vendor management console." },
];

// ── Asset pool ────────────────────────────────────────────────────────────────

export const ASSET_POOL = [
  { name: "MacBook Pro 16\" (M3 Max) — Sarah Chen",            type: "end_user_device"   as const, status: "in_use"           as const, mfr: "Apple",       model: "MacBook Pro 16\" M3 Max",     serial: "C02ZK1FWMD6N", assetTag: "TAG-D-001", assigneeIdx: 0,    teamIdx: 1, price: 3499, warDays: 905  },
  { name: "Dell XPS 15 — Marcus Johnson",                       type: "end_user_device"   as const, status: "in_use"           as const, mfr: "Dell",        model: "XPS 15 9530",                 serial: "DK7X82LMN",    assetTag: "TAG-D-002", assigneeIdx: 1,    teamIdx: 0, price: 1899, warDays: 765  },
  { name: "Dell XPS 15 — Riley Thompson (Water Damaged)",       type: "end_user_device"   as const, status: "under_maintenance" as const, mfr: "Dell",       model: "XPS 15 9530",                 serial: "DK7X83PLQ",    assetTag: "TAG-D-003", assigneeIdx: -1,   teamIdx: 0, price: 1899, warDays: 665  },
  { name: "HP ProLiant DL380 Gen11 — Web Server 01",            type: "hardware"          as const, status: "in_use"           as const, mfr: "HP",          model: "ProLiant DL380 Gen11",         serial: "USE248XLNQ",   assetTag: "TAG-D-004", assigneeIdx: 3,    teamIdx: 1, price: 12800, warDays: 1005 },
  { name: "HP ProLiant DL380 Gen11 — DB Primary",               type: "hardware"          as const, status: "in_use"           as const, mfr: "HP",          model: "ProLiant DL380 Gen11",         serial: "USE249XLNR",   assetTag: "TAG-D-005", assigneeIdx: 3,    teamIdx: 1, price: 12800, warDays: 1005 },
  { name: "Cisco Catalyst 9300 — Core Switch Floor 4",          type: "network_equipment" as const, status: "in_use"           as const, mfr: "Cisco",       model: "Catalyst 9300-48T",            serial: "FJC2301A0NK",  assetTag: "TAG-D-006", assigneeIdx: 7,    teamIdx: 1, price: 8200, warDays: 1820 },
  { name: "Cisco ASA 5545-X — Edge Firewall",                   type: "network_equipment" as const, status: "in_use"           as const, mfr: "Cisco",       model: "ASA 5545-X",                  serial: "FCH2148V0UW",  assetTag: "TAG-D-007", assigneeIdx: 7,    teamIdx: 1, price: 15000, warDays: 185  },
  { name: "NetApp AFF A400 — Primary Storage Array",            type: "hardware"          as const, status: "in_use"           as const, mfr: "NetApp",      model: "AFF A400",                     serial: "701758000380", assetTag: "TAG-D-008", assigneeIdx: 3,    teamIdx: 1, price: 85000, warDays: 730  },
  { name: "MacBook Air M2 — Priya Sharma",                      type: "end_user_device"   as const, status: "in_use"           as const, mfr: "Apple",       model: "MacBook Air M2",              serial: "C02ZP8FWMD7R", assetTag: "TAG-D-009", assigneeIdx: 2,    teamIdx: 0, price: 1299, warDays: 850  },
  { name: "MacBook Air M2 — Alex Rivera",                       type: "end_user_device"   as const, status: "in_use"           as const, mfr: "Apple",       model: "MacBook Air M2",              serial: "C02ZP9FWMD8S", assetTag: "TAG-D-010", assigneeIdx: 3,    teamIdx: 3, price: 1299, warDays: 850  },
  { name: "Dell U2722D Monitor x2 — Board Room",                type: "peripheral"        as const, status: "in_use"           as const, mfr: "Dell",        model: "UltraSharp U2722D 27\"",      serial: "CN0FJKR7KF05", assetTag: "TAG-D-011", assigneeIdx: -1,   teamIdx: 0, price: 549, warDays: 595   },
  { name: "MacBook Pro 14\" — Taylor Kim",                      type: "end_user_device"   as const, status: "in_use"           as const, mfr: "Apple",       model: "MacBook Pro 14\" M3",         serial: "C02ZR2FWMD9T", assetTag: "TAG-D-012", assigneeIdx: -1,   teamIdx: 0, price: 1999, warDays: 1065 },
  { name: "HP EliteBook 840 G10 — James O'Brien",               type: "end_user_device"   as const, status: "in_use"           as const, mfr: "HP",          model: "EliteBook 840 G10",            serial: "5CG3504KNW",   assetTag: "TAG-D-013", assigneeIdx: 5,    teamIdx: 0, price: 1350, warDays: 970  },
  { name: "CrowdStrike Falcon — Enterprise Licence",            type: "software_license"  as const, status: "in_use"           as const, mfr: "CrowdStrike", model: "Falcon Enterprise",            serial: "CS-ENT-2024",  assetTag: "TAG-D-014", assigneeIdx: -1,   teamIdx: 2, price: 42000, warDays: 305  },
  { name: "HP LaserJet M507dn — Floor 3",                       type: "peripheral"        as const, status: "in_use"           as const, mfr: "HP",          model: "LaserJet Enterprise M507dn",  serial: "PHBR721443",   assetTag: "TAG-D-015", assigneeIdx: -1,   teamIdx: 0, price: 689, warDays: 490   },
  { name: "Lenovo ThinkPad X1 Carbon — Emma Williams",          type: "end_user_device"   as const, status: "in_use"           as const, mfr: "Lenovo",      model: "ThinkPad X1 Carbon Gen 11",   serial: "LNV-4X81A12",  assetTag: "TAG-D-016", assigneeIdx: 4,    teamIdx: 2, price: 1649, warDays: 740  },
  { name: "Dell PowerEdge R750 — Application Server 01",        type: "hardware"          as const, status: "in_use"           as const, mfr: "Dell",        model: "PowerEdge R750",               serial: "DL9XK2MN88",   assetTag: "TAG-D-017", assigneeIdx: 3,    teamIdx: 1, price: 18500, warDays: 1000 },
  { name: "Aruba AP-615 — Access Point Floor 4 East",           type: "network_equipment" as const, status: "in_use"           as const, mfr: "Aruba",       model: "AP-615",                       serial: "APX-4E-001",   assetTag: "TAG-D-018", assigneeIdx: 7,    teamIdx: 1, price: 895, warDays: 1200  },
  { name: "MacBook Air M2 — Carlos Mendez",                     type: "end_user_device"   as const, status: "in_use"           as const, mfr: "Apple",       model: "MacBook Air M2",              serial: "C02ZQ1FWMD5L", assetTag: "TAG-D-019", assigneeIdx: 7,    teamIdx: 1, price: 1299, warDays: 830  },
  { name: "Sophos XGS 4300 — Perimeter Firewall",               type: "network_equipment" as const, status: "in_use"           as const, mfr: "Sophos",      model: "XGS 4300",                    serial: "SFX430019ZX",  assetTag: "TAG-D-020", assigneeIdx: 6,    teamIdx: 2, price: 9800, warDays: 1095 },
  { name: "iPad Pro 12.9\" — Conference Room A",                type: "mobile_device"     as const, status: "in_use"           as const, mfr: "Apple",       model: "iPad Pro 12.9\" M2",          serial: "DMPX93HTPMGF", assetTag: "TAG-D-021", assigneeIdx: -1,   teamIdx: 0, price: 1099, warDays: 720  },
  { name: "Cisco Catalyst 9200 — Distribution Switch Lobby",   type: "network_equipment" as const, status: "in_use"           as const, mfr: "Cisco",       model: "Catalyst 9200-24P",           serial: "FJC2207BLPR",  assetTag: "TAG-D-022", assigneeIdx: 7,    teamIdx: 1, price: 4200, warDays: 1460 },
  { name: "VMware vSphere 8 — Perpetual Licence (8 sockets)",  type: "software_license"  as const, status: "in_use"           as const, mfr: "VMware",      model: "vSphere 8 Enterprise Plus",   serial: "VM-PRD-002",   assetTag: "TAG-D-023", assigneeIdx: 3,    teamIdx: 1, price: 28000, warDays: 0    },
  { name: "UPS APC SRT10KXLI — Server Room B",                  type: "hardware"          as const, status: "in_use"           as const, mfr: "APC",         model: "Smart-UPS SRT 10000VA",        serial: "AS1941190072",  assetTag: "TAG-D-024", assigneeIdx: -1, teamIdx: 1, price: 11500, warDays: 730  },
  { name: "Yuki Tanaka — MacBook Pro 14\" M3",                  type: "end_user_device"   as const, status: "in_use"           as const, mfr: "Apple",       model: "MacBook Pro 14\" M3",         serial: "C02ZT5FWND2M", assetTag: "TAG-D-025", assigneeIdx: 8,    teamIdx: 3, price: 1999, warDays: 980  },
  { name: "Veeam Backup — Enterprise Plus Licence",             type: "software_license"  as const, status: "in_use"           as const, mfr: "Veeam",       model: "Backup & Replication v12",    serial: "VBR-ENT-2024", assetTag: "TAG-D-026", assigneeIdx: -1,   teamIdx: 1, price: 8400, warDays: 150  },
  { name: "Cisco IP Phone 8845 — Boardroom",                    type: "peripheral"        as const, status: "in_use"           as const, mfr: "Cisco",       model: "IP Phone 8845",               serial: "FCH2311K2BC",  assetTag: "TAG-D-027", assigneeIdx: -1,   teamIdx: 0, price: 549, warDays: 1095  },
  { name: "HP EliteDesk 800 G9 — Lisa Foster",                  type: "end_user_device"   as const, status: "in_use"           as const, mfr: "HP",          model: "EliteDesk 800 G9 Mini",       serial: "5CG2971PLT",   assetTag: "TAG-D-028", assigneeIdx: 9,    teamIdx: 0, price: 999, warDays: 860   },
];

// ── CMDB Config Items ─────────────────────────────────────────────────────────

export const CI_POOL = [
  { name: "PostgreSQL Production Cluster",   type: "database"       as const, env: "production"  as const, criticality: "critical" as const, description: "Primary PostgreSQL cluster serving all production OLTP workloads. Runs on HP ProLiant DL380 Gen11 (x2).", tags: ["database","postgres","core"] },
  { name: "Web Application Load Balancer",   type: "network_device" as const, env: "production"  as const, criticality: "critical" as const, description: "HAProxy load balancer distributing traffic to web application nodes. Active-passive pair.", tags: ["loadbalancer","haproxy","network"] },
  { name: "Corporate VPN Gateway",           type: "network_device" as const, env: "production"  as const, criticality: "high"     as const, description: "Cisco ASA 5545-X providing remote access VPN for all employees. Supports split and full tunnel.", tags: ["vpn","network","remote-access"] },
  { name: "Active Directory — DC01",         type: "server"         as const, env: "production"  as const, criticality: "critical" as const, description: "Primary Active Directory Domain Controller. Handles authentication for all on-premise and hybrid resources.", tags: ["active-directory","authentication","windows"] },
  { name: "Jenkins CI/CD Master",            type: "server"         as const, env: "production"  as const, criticality: "high"     as const, description: "Jenkins master node orchestrating all CI/CD pipelines for software delivery.", tags: ["ci-cd","jenkins","automation"] },
  { name: "Email Gateway (SendGrid)",        type: "application"    as const, env: "production"  as const, criticality: "high"     as const, description: "Inbound and outbound email processing gateway. Integrates with helpdesk webhook for inbound mail.", tags: ["email","sendgrid","messaging"] },
  { name: "NetApp AFF A400 — Primary",       type: "storage"        as const, env: "production"  as const, criticality: "critical" as const, description: "Primary all-flash storage array serving VM datastores, database volumes, and shared file storage.", tags: ["storage","netapp","flash"] },
  { name: "Kubernetes Production Cluster",   type: "virtual_machine" as const, env: "production" as const, criticality: "high"    as const, description: "EKS cluster hosting containerised microservices for the customer-facing application platform.", tags: ["kubernetes","containers","eks"] },
  { name: "Okta Identity Platform",          type: "application"    as const, env: "production"  as const, criticality: "critical" as const, description: "Okta SSO platform providing identity federation for all SaaS applications and corporate portals.", tags: ["okta","sso","identity","saas"] },
  { name: "Core Network Switch — Floor 1-2", type: "network_device" as const, env: "production"  as const, criticality: "high"    as const, description: "Cisco Catalyst 9300 distribution switch serving floors 1-2. Trunk ports to access switches on each floor.", tags: ["network","cisco","switching"] },
  { name: "Monitoring Stack — Datadog",      type: "application"    as const, env: "production"  as const, criticality: "medium"   as const, description: "Datadog APM and infrastructure monitoring. Alerts feed into PagerDuty for on-call rotations.", tags: ["monitoring","datadog","observability"] },
  { name: "Hashicorp Vault — Secrets Mgmt",  type: "application"    as const, env: "production"  as const, criticality: "high"     as const, description: "Vault cluster managing secrets, certificates, and dynamic credentials for all production services.", tags: ["vault","secrets","security"] },
  { name: "Staging Application Cluster",     type: "server"         as const, env: "staging"     as const, criticality: "medium"   as const, description: "Pre-production environment mirroring the production application cluster for QA and UAT.", tags: ["staging","test","application"] },
  { name: "Backup Server — Veeam",           type: "server"         as const, env: "production"  as const, criticality: "high"     as const, description: "Veeam Backup & Replication server managing daily backups of all production VMs and databases.", tags: ["backup","veeam","disaster-recovery"] },
];
