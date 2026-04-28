/**
 * Settings search content index.
 *
 * Each entry is the full text body of a settings section — every group title,
 * field label, description, and notable option value that appears on the page.
 * The search engine splits the query into words and requires ALL of them to
 * appear in the body (AND logic), enabling searches like "sla email" or
 * "mfa admin" that cross field boundaries within a section.
 *
 * Keep this in sync with sections.tsx whenever fields are added or renamed.
 */

import type { SettingsSection } from "core/schemas/settings.ts";

export const SETTINGS_CONTENT_INDEX: Record<SettingsSection, string> = {

  general: `
    identity organisation name organization name helpdesk name company name
    support email reply-to address from address phone
    locale language timezone utc date format time format
    24-hour 12-hour regional
  `,

  branding: `
    logo upload company identity favicon browser tab png svg square
    primary color brand color accent email color button color
    help center title page title tagline subtitle public help page
  `,

  tickets: `
    default priority low medium high urgent inbound
    team-scoped visibility agent visibility team restriction global view
    auto-assignment auto assign workload
    require category category on create
    allow customers re-open reopen resolved tickets
    csat satisfaction survey customer satisfaction
    auto-close close resolved after days auto close
    behavior defaults visibility
  `,

  ticket_numbering: `
    ticket number prefix digits padding sequence start at counter format
    incident INC number series
    service request SR number series
    change request CHG CRQ RFC number series
    problem PRB number series
    generic TKT number series
    date segment year month year-month
    reset period yearly monthly never
    numbering format preview
  `,

  sla: `
    SLA service level agreement tracking enable
    first response resolution deadline target minutes hours
    low medium high urgent priority target
    business hours only clock pause non-business days
    business days monday tuesday wednesday thursday friday weekend
    start time end time working hours schedule
    frLow frMedium frHigh frUrgent response target
    resLow resMedium resHigh resUrgent resolution target
    breach deadline overdue at risk
  `,

  knowledge_base: `
    knowledge base kb help center articles public access
    enable knowledge base
    public access anonymous read published
    require account to search login
    show related articles suggestions bottom article
    article voting helpful not helpful vote
    articles per page pagination display count
  `,

  templates: `
    templates macros response saved replies
    enable templates
    allow agents create templates supervisors admins only
    macro response template insert reply composer
  `,

  automations: `
    automations automation rules engine enable
    ticket events run trigger
    max actions per rule hard limit single rule execute
    rule engine concurrent
  `,

  users_roles: `
    users roles agents accounts permissions
    default role new agents agent readonly
    allow agent self-assignment assign themselves
    require email verification account verify login sign in
    password role permissions accounts management
    custom role create rename rbac access control authorization
    role editor permission matrix supervisor admin readonly
  `,

  appearance: `
    theme light dark system default
    allow users override theme profile preference
    collapse sidebar default collapsed navigation
    brand colors primary success warning danger destructive
    surface colors secondary accent hover highlight dropdown nav
    sidebar background light dark mode color
    custom color primary accent success warning danger secondary
    interface display visual
  `,

  integrations: `
    email integration provider sendgrid smtp ses
    from email address sender outbound
    sendgrid api key smtp host port username password credentials
    inbound email webhook secret token sendgrid header
    openai api key ai artificial intelligence classification auto-resolve model
    gpt openai model
    slack notifications webhook url channel post events
    third-party services connect api keys encrypted
  `,

  advanced: `
    maintenance mode maintenance message show users admins
    debug logging verbose server logs production
    file uploads attachment max size mb megabytes
    allowed file types extensions csv pdf png jpg
    session timeout idle re-authentication minutes
    maintenance debug upload configuration
  `,

  incidents: `
    incident management enable severity escalation major
    major incident threshold severity level workflow declare
    notify stakeholders major incident notification
    mtta mttr sev1 sev2 sev3 sev4 severity 1 2 3 4
    mean time to acknowledge mean time to resolve response time
    auto-escalate escalation minutes before breach sla
    auto-link problem threshold link incidents problem record
    require rca root cause analysis above severity
    post-incident review pir template
  `,

  requests: `
    service requests module enable
    self-service allow customers submit without agent
    public service catalog unauthenticated portal visitors
    approval require by default catalog items
    require justification above impact level
    fulfillment SLA hours default
    auto-close fulfilled after days
    catalog approval self service portal
  `,

  problems: `
    problem management enable
    known error kb integration suggest articles incidents opening
    auto-publish known errors kb articles workaround
    require rca template root cause analysis resolve
    post-incident review pir template major incidents
    recurrence window days recurring incidents detect
    auto-create problem threshold linked incidents
  `,

  changes: `
    change management enable cab change advisory board
    standard changes pre-approved bypass cab review
    auto-approve standard changes classified
    default change type normal emergency standard
    default risk low medium high critical
    default priority
    default cab group cab members authorised approvers
    require cab normal changes major review advisory board
    require cab emergency changes expedited
    require rollback plan back-out
    normal change lead time days submission planned start
    emergency change lead time immediate scheduling
    max implementation window hours planned change window
    require scheduled window normal changes draft planned start end
    risk matrix test plan above risk score
    low risk score high risk score threshold
    post-implementation review pir enable
    pir required above risk mandatory level
    pir window days after implementation close
    freeze window normal major changes blocked emergency allowed
    freeze start end date
    notify coordinator state change transition
    notify assignee state change
  `,

  approvals: `
    approvals workflow reminder interval hours re-send
    escalation timeout hours inaction approver level
    max approval levels sequential chain
    quorum mode all majority any one approvers
    require comment rejection comment text rejection
    auto-approve timeout no decision
    allow delegation delegate another agent
    notify requester decision approved rejected email
    approval reminders delegation quorum decision rules
  `,

  cmdb: `
    cmdb configuration management database enable
    auto-discovery ci discovery agents integrations
    software ci track applications versions
    hardware ci physical assets
    service ci logical services business applications
    network ci routers switches load balancers infrastructure
    auto-link tickets ci category affected system suggest
    impact analysis upstream downstream incident affected
    dependency tree depth chain render
    configuration item asset tracking
  `,

  notifications: `
    notifications email in-app channels
    email notifications send agent customer
    in-app notifications badges pop-ups interface
    notification sounds play sound arrives
    digest mode batch bundle periodic hourly
    digest interval hours batched non-urgent
    ticket assigned re-assigned notify agent
    ticket replied customer reply assigned
    sla breach imminent approaching deadline
    ticket escalated escalation notify
    mentioned note reply at-mention
    approval required assigned agent
    approval decision approved rejected requester
    agent events channel delivery
  `,

  security: `
    security password policy mfa multi-factor authentication
    minimum length characters password
    require uppercase letter capital
    require number digit
    require symbol special character
    enable mfa multi-factor
    require mfa admins administrators enrolled sign in
    require mfa all agents
    failed login lockout lock account repeated attempts
    max failed attempts lock
    lockout duration minutes unlock
    enforce session timeout re-authentication
    ip allowlist restrict sign-in cidr range address
    allowed ips cidrs addresses ranges
    login security authentication
  `,

  audit: `
    audit log logging events capture
    enable audit logging capture system events
    retention period days purge old entries
    authentication events sign-in sign-out failed login
    ticket events creation status changes assignments closures
    settings changes modifications system settings
    user management creation deletion role changes
    knowledge base events publish archive review
    allow export admins export audit log
    export format json csv file
    audit trail compliance history
  `,

  business_hours: `
    business hours working hours calendar
    calendar name display agents portal
    timezone calendar override inherit general
    show hours portal customer help center
    working days monday tuesday wednesday thursday friday weekend
    start time end time work hours schedule
    public holidays closed dates yyyy-mm-dd
    exclusion periods company shutdown date ranges closed
    business calendar schedule holidays exclusions
  `,
};

/**
 * Build a flat lowercase token string for a section by combining:
 * - settingsSectionMeta label, description, keywords
 * - full SETTINGS_CONTENT_INDEX body
 */
export function buildSectionTokens(
  section: SettingsSection,
  meta: { label: string; description: string; keywords: string[] }
): string {
  const metaPart = [meta.label, meta.description, ...meta.keywords].join(" ");
  const contentPart = SETTINGS_CONTENT_INDEX[section] ?? "";
  return `${metaPart} ${contentPart}`.toLowerCase().replace(/\s+/g, " ").trim();
}
