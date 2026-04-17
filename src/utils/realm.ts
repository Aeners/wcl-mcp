/**
 * Converts a realm name to its WCL slug format.
 * "Area 52" -> "area-52", "Bleeding Hollow" -> "bleeding-hollow"
 */
export function realmToSlug(realm: string): string {
  return realm
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Title-cases a realm slug for display. "area-52" -> "Area 52" */
export function realmToDisplay(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
