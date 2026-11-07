import { type ClassValue, clsx } from "clsx";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function toDate(value: string | Date): Date {
  return typeof value === "string" ? parseISO(value) : value;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    return format(toDate(value), "dd/MM/yyyy", { locale: fr });
  } catch {
    return "—";
  }
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    return format(toDate(value), "dd/MM/yyyy HH:mm", { locale: fr });
  } catch {
    return "—";
  }
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    return formatDistanceToNow(toDate(value), { addSuffix: true, locale: fr });
  } catch {
    return "—";
  }
}

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits }).format(value);
}

export function formatCurrency(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits,
  }).format(value);
}

export function initials(firstName?: string, lastName?: string): string {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

export function fullName(firstName?: string, lastName?: string): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "—";
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return value;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Une erreur inattendue est survenue.";
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
