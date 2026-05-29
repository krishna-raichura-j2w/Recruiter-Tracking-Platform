export type Module =
  | "dashboard"
  | "clients"
  | "consultants"
  | "cadence"
  | "tickets"
  | "incidents"
  | "communication"
  | "notifications"
  | "exits"
  | "activity_log";

export type Action = "read" | "create" | "update" | "delete" | "export";

type PermissionMap = Partial<Record<Module, Partial<Record<Action, boolean>>>>;

// Single source of truth for UI-level role permissions.
// To support a new role: add a new key below with its permission map.
const ROLE_PERMISSIONS: Record<string, PermissionMap> = {
  hrbp: {
    dashboard:     { read: true },
    clients:       { read: true, create: true,  update: true,  delete: false },
    consultants:   { read: true, create: true,  update: true,  delete: false },
    cadence:       { read: true, create: true,  update: true,  delete: false, export: true },
    tickets:       { read: true, create: true,  update: true,  delete: false },
    incidents:     { read: true, create: true,  update: true,  delete: false },
    communication: { read: true },
    notifications: { read: true },
    exits:         { read: true, create: true,  update: true,  delete: false },
  },

  bh: {
    dashboard:     { read: true },
    clients:       { read: true, create: false, update: false, delete: false },
    consultants:   { read: true, create: false, update: false, delete: false },
    cadence:       { read: true, create: false, update: false, delete: false, export: true },
    tickets:       { read: true, create: true,  update: true,  delete: false },
    incidents:     { read: true, create: true,  update: true,  delete: false },
    communication: { read: true },
    notifications: { read: true },
    exits:         { read: true, create: false, update: true,  delete: false },
  },

  admin: {
    dashboard:     { read: true },
    clients:       { read: true, create: true,  update: true,  delete: true },
    consultants:   { read: true, create: true,  update: true,  delete: true },
    cadence:       { read: true, create: true,  update: true,  delete: true, export: true },
    tickets:       { read: true, create: true,  update: true,  delete: true },
    incidents:     { read: true, create: true,  update: true,  delete: true },
    communication: { read: true },
    notifications: { read: true },
    exits:         { read: true, create: true,  update: true,  delete: true },
  },

  ops_head: {
    dashboard:     { read: true },
    clients:       { read: true },
    consultants:   { read: true },
    cadence:       { read: true, export: true },
    tickets:       { read: true, create: false, update: false, delete: false },
    incidents:     { read: true },
    communication: { read: true },
    notifications: { read: true },
    exits:         { read: true },
    activity_log:  { read: true },
  },

  coo: {
    dashboard:     { read: true },
    clients:       { read: true },
    consultants:   { read: true },
    cadence:       { read: true, export: true },
    tickets:       { read: true, create: false, update: false, delete: false },
    incidents:     { read: true },
    communication: { read: true },
    notifications: { read: true },
    exits:         { read: true },
    activity_log:  { read: true },
  },

  ceo: {
    dashboard:     { read: true },
    clients:       { read: true },
    consultants:   { read: true },
    cadence:       { read: true },
    tickets:       { read: true, create: false, update: false, delete: false },
    incidents:     { read: true },
    communication: { read: true },
    notifications: { read: true },
    exits:         { read: true },
    activity_log:  { read: true },
  },
};

/**
 * Returns true if the given role is allowed to perform the action on the module.
 * Returns false for unknown roles or missing entries — fail closed.
 */
export function can(role: string | undefined, module: Module, action: Action): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.[module]?.[action] ?? false;
}
