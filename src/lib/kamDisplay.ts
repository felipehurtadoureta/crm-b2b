/** Iniciales por palabra: "Felipe Hurtado Ureta" → "FHU" */
export function initialsFromFullName(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 12)
}

/** Texto corto para columnas: abreviatura guardada o iniciales automáticas */
export function kamAbbrOrInitials(k: {
  full_name: string
  display_abbr?: string | null
}): string {
  const a = (k.display_abbr ?? '').trim()
  if (a) return a
  return initialsFromFullName(k.full_name)
}
