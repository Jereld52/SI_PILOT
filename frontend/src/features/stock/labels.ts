export const stockCategoryLabels: Record<string, string> = {
  keyboard: "Claviers",
  mouse: "Souris",
  monitor: "Écrans",
  headset: "Casques",
  dock: "Stations d'accueil",
  webcam: "Webcams",
  cable: "Câbles",
  adapter: "Adaptateurs",
  toner: "Toners",
  paper: "Papier",
  battery: "Batteries",
  consumable: "Consommables",
  other: "Autres",
};

export const stockCategoryOptions = Object.entries(stockCategoryLabels).map(([value, label]) => ({
  value,
  label: label.replace(/s$/, ""),
}));

export const stockDirectionLabels: Record<string, string> = {
  in: "Entrée",
  out: "Sortie",
  adjustment: "Ajustement",
};

export const stockDirectionTones: Record<string, "success" | "warning" | "info"> = {
  in: "success",
  out: "warning",
  adjustment: "info",
};
