// Better Auth roles: owner | admin | member. A member can have several,
// stored comma-separated. Members can view workspace data but not change it.

function roles(role: string) {
  return role.split(",").map((r) => r.trim());
}

/** Can create, edit and delete workspace data such as lists. */
export function canManage(role: string) {
  return roles(role).some((r) => r === "owner" || r === "admin");
}
