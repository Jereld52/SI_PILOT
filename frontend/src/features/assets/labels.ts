export const assetStatusLabels: Record<string, string> = {
  in_service: "En service",
  in_stock: "En stock",
  maintenance: "Maintenance",
  broken: "En panne",
  to_renew: "À renouveler",
  retired: "Réformé",
};

export const assetStatusTones: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = {
  in_service: "success",
  in_stock: "info",
  maintenance: "warning",
  broken: "danger",
  to_renew: "warning",
  retired: "neutral",
};

export const assetConditionLabels: Record<string, string> = {
  new: "Neuf",
  good: "Bon",
  fair: "Moyen",
  poor: "Mauvais",
  out_of_service: "Hors service",
};

export const assetConditionTones: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = {
  new: "info",
  good: "success",
  fair: "warning",
  poor: "danger",
  out_of_service: "neutral",
};

export function renderTagPreview(template: string, prefix: string | null, code: string): string {
  const year = new Date().getFullYear();
  return template
    .replaceAll("{PREFIX}", (prefix || code).toUpperCase())
    .replaceAll("{CATEGORY}", code.toUpperCase())
    .replaceAll("{YEAR}", String(year))
    .replace(/\{SEQ(?::(\d+))?\}/g, (_match, width: string | undefined) =>
      "1".padStart(Number(width || 4), "0"),
    );
}
