/**
 * ConditionBuilder — Visual AND/OR condition tree editor.
 *
 * Supports:
 *  - Nested AND/OR groups (up to 3 levels deep)
 *  - Full field registry covering email metadata, requester, ticket, and context
 *  - Type-aware operator filtering (string / email / enum / boolean / number)
 *  - Adaptive value inputs: text, number, boolean toggle, enum select, multi-select
 *
 * Usage:
 *   <ConditionBuilder value={conditionGroup} onChange={setConditionGroup} />
 */

import { useId } from "react";
import { Plus, Trash2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CONDITION_OPERATOR_LABELS } from "core/constants/automation";
import type { AutomationConditionGroup, AutomationLeafCondition, AutomationCondition } from "core/schemas/automations";

// ── Field registry ─────────────────────────────────────────────────────────────

export type FieldType = "string" | "email" | "enum" | "boolean" | "number";

export interface ConditionFieldDef {
  key: string;
  label: string;
  category: string;
  type: FieldType;
  options?: Array<{ label: string; value: string }>;
}

export const CONDITION_FIELDS: ConditionFieldDef[] = [
  // ── Email / Message ───────────────────────────────────────────────────────
  { key: "senderEmail",     label: "Sender Email",             category: "Email & Message", type: "email"  },
  { key: "senderDomain",    label: "Sender Domain",            category: "Email & Message", type: "string" },
  { key: "senderName",      label: "Sender Name",              category: "Email & Message", type: "string" },
  { key: "emailTo",         label: "Recipient Mailbox (To)",   category: "Email & Message", type: "string" },
  { key: "emailCc",         label: "CC",                       category: "Email & Message", type: "string" },
  { key: "emailReplyTo",    label: "Reply-To Address",         category: "Email & Message", type: "string" },
  { key: "mailboxAlias",    label: "Source Mailbox Alias",     category: "Email & Message", type: "string" },
  { key: "subject",         label: "Subject",                  category: "Email & Message", type: "string" },
  { key: "body",            label: "Body / Message Text",      category: "Email & Message", type: "string" },
  { key: "isAutoReply",     label: "Is Auto-Reply / OOO",      category: "Email & Message", type: "boolean" },
  { key: "isBounce",        label: "Is Bounce / Failed NDR",   category: "Email & Message", type: "boolean" },
  {
    key: "source",
    label: "Source Channel",
    category: "Email & Message",
    type: "enum",
    options: [
      { label: "Email",  value: "email"  },
      { label: "Portal", value: "portal" },
      { label: "Agent",  value: "agent"  },
    ],
  },
  // ── Requester / Organisation ──────────────────────────────────────────────
  { key: "requesterIsVip",       label: "Requester is VIP",       category: "Requester",  type: "boolean" },
  {
    key: "requesterSupportTier",
    label: "Support Tier",
    category: "Requester",
    type: "enum",
    options: [
      { label: "Free",       value: "free"       },
      { label: "Standard",   value: "standard"   },
      { label: "Premium",    value: "premium"    },
      { label: "Enterprise", value: "enterprise" },
    ],
  },
  { key: "requesterOrgName",  label: "Organization Name",    category: "Requester",  type: "string" },
  { key: "requesterTimezone", label: "Requester Timezone",   category: "Requester",  type: "string" },
  { key: "requesterLanguage", label: "Requester Language",   category: "Requester",  type: "string" },
  // ── Ticket Fields ─────────────────────────────────────────────────────────
  {
    key: "status",
    label: "Status",
    category: "Ticket",
    type: "enum",
    options: [
      { label: "Open",        value: "open"        },
      { label: "In Progress", value: "in_progress" },
      { label: "Escalated",   value: "escalated"   },
      { label: "Resolved",    value: "resolved"    },
      { label: "Closed",      value: "closed"      },
    ],
  },
  {
    key: "priority",
    label: "Priority",
    category: "Ticket",
    type: "enum",
    options: [
      { label: "Low",      value: "low"      },
      { label: "Medium",   value: "medium"   },
      { label: "High",     value: "high"     },
      { label: "Urgent",   value: "urgent"   },
    ],
  },
  {
    key: "ticketType",
    label: "Ticket Type",
    category: "Ticket",
    type: "enum",
    options: [
      { label: "Incident",         value: "incident"         },
      { label: "Service Request",  value: "service_request"  },
      { label: "Problem",          value: "problem"          },
      { label: "Change Request",   value: "change_request"   },
    ],
  },
  { key: "category",        label: "Category",         category: "Ticket",  type: "string" },
  { key: "affectedSystem",  label: "Affected System",  category: "Ticket",  type: "string" },
  {
    key: "severity",
    label: "Severity",
    category: "Ticket",
    type: "enum",
    options: [
      { label: "SEV1 — Critical", value: "sev1" },
      { label: "SEV2 — Major",    value: "sev2" },
      { label: "SEV3 — Minor",    value: "sev3" },
      { label: "SEV4 — Low",      value: "sev4" },
    ],
  },
  {
    key: "impact",
    label: "Impact",
    category: "Ticket",
    type: "enum",
    options: [
      { label: "High",   value: "high"   },
      { label: "Medium", value: "medium" },
      { label: "Low",    value: "low"    },
    ],
  },
  {
    key: "urgency",
    label: "Urgency",
    category: "Ticket",
    type: "enum",
    options: [
      { label: "High",   value: "high"   },
      { label: "Medium", value: "medium" },
      { label: "Low",    value: "low"    },
    ],
  },
  { key: "isEscalated",  label: "Is Escalated",  category: "Ticket",  type: "boolean" },
  { key: "slaBreached",  label: "SLA Breached",  category: "Ticket",  type: "boolean" },
  // ── Context ───────────────────────────────────────────────────────────────
  { key: "isBusinessHours", label: "Is Business Hours",  category: "Context", type: "boolean" },
  { key: "isSpam",          label: "Is Spam",            category: "Context", type: "boolean" },
  { key: "isQuarantined",   label: "Is Quarantined",     category: "Context", type: "boolean" },
  // ── Time-Based metrics (for time_supervisor rules) ────────────────────────
  // All values are in floating-point hours. Use numeric operators: gt, gte, lt, lte, eq.
  // Examples: ageHours > 48  |  idleHours > 24  |  hoursUntilSlaResolution < 2
  { key: "ageHours",                    label: "Age (hours since created)",           category: "Time-Based", type: "number" },
  { key: "idleHours",                   label: "Idle (hours since any update)",        category: "Time-Based", type: "number" },
  { key: "hoursSinceLastReply",         label: "Hours since last reply (any)",         category: "Time-Based", type: "number" },
  { key: "hoursSinceLastAgentReply",    label: "Hours since last agent reply",         category: "Time-Based", type: "number" },
  { key: "hoursSinceLastCustomerReply", label: "Hours since last customer reply",      category: "Time-Based", type: "number" },
  { key: "hoursUntilSlaFirstResponse",  label: "Hours until first-response SLA (−=breached)", category: "Time-Based", type: "number" },
  { key: "hoursUntilSlaResolution",     label: "Hours until resolution SLA (−=breached)",      category: "Time-Based", type: "number" },
  { key: "hoursInCurrentStatus",        label: "Hours in current status",              category: "Time-Based", type: "number" },
  { key: "hoursUnassigned",             label: "Hours unassigned (null if assigned)",  category: "Time-Based", type: "number" },
  { key: "pendingApprovalHours",        label: "Hours pending approval (null if N/A)", category: "Time-Based", type: "number" },
  { key: "isBusinessHours",             label: "Is business hours (Mon–Fri 09–17)",    category: "Time-Based", type: "boolean" },
  // ── Previous values (for changed-field conditions) ─────────────────────────
  // These resolve the field value BEFORE the triggering change was applied.
  // Example: previous.status = "open" AND status = "escalated" → fired on escalation.
  { key: "previous.status",   label: "Previous Status",   category: "Previous Values", type: "enum",
    options: [
      { label: "Open",        value: "open"        },
      { label: "In Progress", value: "in_progress" },
      { label: "Escalated",   value: "escalated"   },
      { label: "Resolved",    value: "resolved"    },
      { label: "Closed",      value: "closed"      },
    ],
  },
  { key: "previous.priority",  label: "Previous Priority", category: "Previous Values", type: "enum",
    options: [
      { label: "Low",    value: "low"    },
      { label: "Medium", value: "medium" },
      { label: "High",   value: "high"   },
      { label: "Urgent", value: "urgent" },
    ],
  },
  { key: "previous.category",     label: "Previous Category",    category: "Previous Values", type: "string" },
  { key: "previous.assignedToId", label: "Previous Assignee ID", category: "Previous Values", type: "string" },
  { key: "previous.severity",     label: "Previous Severity",    category: "Previous Values", type: "enum",
    options: [
      { label: "SEV1", value: "sev1" }, { label: "SEV2", value: "sev2" },
      { label: "SEV3", value: "sev3" }, { label: "SEV4", value: "sev4" },
    ],
  },
  // changed.* — boolean true when that field differs from its previous value
  { key: "changed.status",     label: "Status was changed",     category: "Previous Values", type: "boolean" },
  { key: "changed.priority",   label: "Priority was changed",   category: "Previous Values", type: "boolean" },
  { key: "changed.assignedToId", label: "Assignee was changed", category: "Previous Values", type: "boolean" },
  { key: "changed.category",   label: "Category was changed",   category: "Previous Values", type: "boolean" },
  { key: "changed.severity",   label: "Severity was changed",   category: "Previous Values", type: "boolean" },
  // ── Organisation / Account ───────────────────────────────────────────────
  { key: "org.supportTier",   label: "Org Support Tier",    category: "Organisation", type: "enum",
    options: [
      { label: "Free",       value: "free"       },
      { label: "Standard",   value: "standard"   },
      { label: "Premium",    value: "premium"    },
      { label: "Enterprise", value: "enterprise" },
    ],
  },
  { key: "org.country",       label: "Org Country",         category: "Organisation", type: "string" },
  { key: "org.industry",      label: "Org Industry",        category: "Organisation", type: "string" },
  { key: "requester.jobTitle",        label: "Requester Job Title",     category: "Organisation", type: "string" },
  { key: "requester.preferredChannel",label: "Requester Preferred Channel", category: "Organisation", type: "string" },
  // ── Lifecycle / Cross-Record ──────────────────────────────────────────────
  { key: "hasLinkedIncident", label: "Has Linked Incident", category: "Lifecycle",    type: "boolean" },
  { key: "hasLinkedProblem",  label: "Has Linked Problem",  category: "Lifecycle",    type: "boolean" },
  { key: "hasLinkedChange",   label: "Has Linked Change",   category: "Lifecycle",    type: "boolean" },
  { key: "isMerged",          label: "Is Merged",           category: "Lifecycle",    type: "boolean" },
  { key: "mergedTicketCount", label: "Merged Ticket Count", category: "Lifecycle",    type: "number"  },
  { key: "linkedIncidentId",  label: "Linked Incident ID",  category: "Lifecycle",    type: "number"  },
  // ── Custom fields ─────────────────────────────────────────────────────────
  { key: "custom_",         label: "Custom Field (key → custom_name)", category: "Custom", type: "string" },
];

export const FIELD_CATEGORIES = [
  "Email & Message",
  "Requester",
  "Ticket",
  "Time-Based",
  "Context",
  "Organisation",
  "Lifecycle",
  "Previous Values",
  "Custom",
];

// ── Operator sets by field type ────────────────────────────────────────────────

type Operator = keyof typeof CONDITION_OPERATOR_LABELS;

const STRING_OPS: Operator[] = [
  "eq", "neq", "contains", "not_contains",
  "starts_with", "ends_with", "is_empty", "is_not_empty", "matches_regex",
];
const EMAIL_OPS: Operator[] = [
  "eq", "neq", "contains", "not_contains",
  "ends_with", "is_empty", "is_not_empty",
];
const ENUM_OPS: Operator[] = ["eq", "neq", "in", "not_in", "is_empty", "is_not_empty"];
const BOOL_OPS: Operator[] = ["eq"];
const NUM_OPS:  Operator[] = ["eq", "neq", "gt", "gte", "lt", "lte"];

function opsForType(type: FieldType): Operator[] {
  switch (type) {
    case "email":   return EMAIL_OPS;
    case "enum":    return ENUM_OPS;
    case "boolean": return BOOL_OPS;
    case "number":  return NUM_OPS;
    default:        return STRING_OPS;
  }
}

function defaultOpForType(type: FieldType): Operator {
  switch (type) {
    case "boolean": return "eq";
    case "enum":    return "eq";
    case "number":  return "eq";
    default:        return "contains";
  }
}

const NO_VALUE_OPS: Operator[] = ["is_empty", "is_not_empty"];

// ── Value input ───────────────────────────────────────────────────────────────

function ValueInput({
  field,
  operator,
  value,
  onChange,
}: {
  field: ConditionFieldDef | undefined;
  operator: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (NO_VALUE_OPS.includes(operator as Operator)) return null;

  if (!field || field.type === "string" || field.type === "email") {
    return (
      <Input
        className="flex-1 min-w-0"
        placeholder="Value…"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (field.type === "number") {
    return (
      <Input
        type="number"
        className="w-28"
        value={typeof value === "number" ? String(value) : ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    );
  }

  if (field.type === "boolean") {
    return (
      <div className="inline-flex rounded-md border overflow-hidden">
        {[
          { label: "True",  val: "true"  },
          { label: "False", val: "false" },
        ].map(({ label, val }) => (
          <button
            key={val}
            type="button"
            className={`px-3 py-1 text-xs transition-colors ${
              String(value) === val
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
            onClick={() => onChange(val === "true")}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  if (field.type === "enum" && field.options) {
    if (operator === "in" || operator === "not_in") {
      // Multi-select: value is string[]
      const selected: string[] = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1 flex-1">
          {field.options.map((opt) => {
            const active = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  onChange(
                    active
                      ? selected.filter((v) => v !== opt.value)
                      : [...selected, opt.value]
                  )
                }
                className="transition-colors"
              >
                <Badge variant={active ? "default" : "outline"} className="cursor-pointer text-xs">
                  {opt.label}
                </Badge>
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <Select
        value={typeof value === "string" ? value : ""}
        onValueChange={onChange}
      >
        <SelectTrigger className="flex-1 min-w-0">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      className="flex-1 min-w-0"
      placeholder="Value…"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ── Field picker ──────────────────────────────────────────────────────────────

function FieldPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-52 shrink-0">
        <SelectValue placeholder="Select field…" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {FIELD_CATEGORIES.map((cat) => {
          const fields = CONDITION_FIELDS.filter((f) => f.category === cat);
          if (fields.length === 0) return null;
          return (
            <SelectGroup key={cat}>
              <SelectLabel className="text-xs text-muted-foreground px-2 py-1">{cat}</SelectLabel>
              {fields.map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

// ── Leaf condition row ─────────────────────────────────────────────────────────

function LeafRow({
  condition,
  onChange,
  onDelete,
}: {
  condition: AutomationLeafCondition;
  onChange: (c: AutomationLeafCondition) => void;
  onDelete: () => void;
}) {
  const fieldDef = CONDITION_FIELDS.find((f) => f.key === condition.field);
  const availableOps = fieldDef ? opsForType(fieldDef.type) : STRING_OPS;

  function setField(key: string) {
    const def = CONDITION_FIELDS.find((f) => f.key === key);
    onChange({
      type: "condition",
      field: key,
      operator: def ? defaultOpForType(def.type) : "contains",
      value: undefined,
    });
  }

  function setOperator(op: string) {
    onChange({ ...condition, operator: op as Operator, value: undefined });
  }

  function setValue(v: unknown) {
    onChange({ ...condition, value: v as AutomationLeafCondition["value"] });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <FieldPicker value={condition.field} onChange={setField} />

      <Select value={condition.operator} onValueChange={setOperator}>
        <SelectTrigger className="w-40 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableOps.map((op) => (
            <SelectItem key={op} value={op}>
              {CONDITION_OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <ValueInput
          field={fieldDef}
          operator={condition.operator}
          value={condition.value}
          onChange={setValue}
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

// ── Group ─────────────────────────────────────────────────────────────────────

function ConditionGroup({
  group,
  onChange,
  onDelete,
  depth,
}: {
  group: AutomationConditionGroup;
  onChange: (g: AutomationConditionGroup) => void;
  onDelete?: () => void;
  depth: number;
}) {
  const id = useId();

  function setOperator(op: "AND" | "OR") {
    onChange({ ...group, operator: op });
  }

  function addCondition() {
    onChange({
      ...group,
      conditions: [
        ...group.conditions,
        {
          type: "condition",
          field: "subject",
          operator: "contains",
          value: "",
        } satisfies AutomationLeafCondition,
      ],
    });
  }

  function addGroup() {
    onChange({
      ...group,
      conditions: [
        ...group.conditions,
        {
          type: "group",
          operator: "AND",
          conditions: [],
        } satisfies AutomationConditionGroup,
      ],
    });
  }

  function updateChild(idx: number, child: AutomationCondition) {
    const next = [...group.conditions];
    next[idx] = child;
    onChange({ ...group, conditions: next });
  }

  function removeChild(idx: number) {
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== idx) });
  }

  const indentClass = depth === 0 ? "" : depth === 1 ? "ml-4" : "ml-8";

  return (
    <div className={`rounded-md border bg-muted/20 p-3 space-y-2 ${indentClass}`}>
      {/* AND / OR toggle + optional group delete */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Match</span>
        <div className="inline-flex rounded-md border overflow-hidden text-xs">
          {(["AND", "OR"] as const).map((op) => (
            <button
              key={op}
              type="button"
              className={`px-2.5 py-1 transition-colors font-medium ${
                group.operator === op
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => setOperator(op)}
            >
              {op === "AND" ? "ALL" : "ANY"}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">of the following conditions</span>
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 ml-auto text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>

      {/* Conditions */}
      {group.conditions.length === 0 && (
        <p className="text-xs text-muted-foreground italic pl-1">
          No conditions — rule will match every event.
        </p>
      )}

      {group.conditions.map((child, idx) =>
        child.type === "group" ? (
          <ConditionGroup
            key={`${id}-${idx}`}
            group={child}
            onChange={(g) => updateChild(idx, g)}
            onDelete={() => removeChild(idx)}
            depth={depth + 1}
          />
        ) : (
          <LeafRow
            key={`${id}-${idx}`}
            condition={child}
            onChange={(c) => updateChild(idx, c)}
            onDelete={() => removeChild(idx)}
          />
        )
      )}

      {/* Add buttons */}
      <div className="flex items-center gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addCondition}>
          <Plus className="size-3 mr-1" />
          Add condition
        </Button>
        {depth < 2 && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addGroup}>
            <Layers className="size-3 mr-1" />
            Add group
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface ConditionBuilderProps {
  value: AutomationConditionGroup;
  onChange: (v: AutomationConditionGroup) => void;
}

export default function ConditionBuilder({ value, onChange }: ConditionBuilderProps) {
  return (
    <ConditionGroup
      group={value}
      onChange={onChange}
      depth={0}
    />
  );
}
