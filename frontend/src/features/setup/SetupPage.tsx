import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ImageUp,
  Palette,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { BrandMark } from "@/components/layout/BrandMark";
import { useBranding } from "@/features/branding/BrandingProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import type { SetupResult, SetupStatus } from "@/types/api";

const STEPS = [
  { key: "structure", label: "Structure", icon: Building2 },
  { key: "identity", label: "Identité", icon: Palette },
  { key: "admin", label: "Administrateur", icon: UserRound },
];

interface SetupForm {
  organizationName: string;
  appName: string;
  tagline: string;
  description: string;
  primaryColor: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 12) issues.push("au moins 12 caractères");
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    issues.push("une majuscule et une minuscule");
  }
  if (!/[0-9]/.test(password)) issues.push("au moins un chiffre");
  return issues;
}

export function SetupPage() {
  const branding = useBranding();
  const { login } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [form, setForm] = useState<SetupForm>({
    organizationName: "",
    appName: branding.app_name || "SI PILOT",
    tagline: branding.tagline || "Cockpit du système d'information",
    description: branding.description,
    primaryColor: branding.primary_color || "#772B2F",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const statusQuery = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => apiFetch<SetupStatus>("/setup/status"),
    staleTime: 0,
  });

  useEffect(() => {
    if (!logo) {
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logo);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  const update = (field: keyof SetupForm, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const organization = form.organizationName.trim();
  const stepValid = useMemo(() => {
    if (step === 0) return Boolean(organization);
    if (step === 1) return /^#[0-9a-fA-F]{6}$/.test(form.primaryColor);
    return (
      Boolean(form.firstName.trim()) &&
      Boolean(form.lastName.trim()) &&
      EMAIL_PATTERN.test(form.email.trim()) &&
      passwordIssues(form.password).length === 0 &&
      form.password === form.confirmPassword
    );
  }, [step, organization, form]);

  if (statusQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-lg">
          <ErrorState
            message={
              statusQuery.error instanceof Error
                ? statusQuery.error.message
                : "Impossible de vérifier l'état de l'installation."
            }
            onRetry={() => void statusQuery.refetch()}
          />
        </Card>
      </div>
    );
  }

  if (statusQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-xl space-y-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (statusQuery.data && !statusQuery.data.needs_setup) {
    return <Navigate to="/login" replace />;
  }

  const next = () => {
    setError(null);
    if (step === 0 && !organization) {
      setError("Le nom de la structure est obligatoire.");
      return;
    }
    if (step === 1 && !/^#[0-9a-fA-F]{6}$/.test(form.primaryColor)) {
      setError("La couleur doit être au format #RRGGBB.");
      return;
    }
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const submit = async () => {
    setError(null);
    if (!stepValid) {
      if (form.password !== form.confirmPassword) {
        setError("Les deux mots de passe ne correspondent pas.");
      } else {
        setError(`Le mot de passe doit contenir ${passwordIssues(form.password).join(", ")}.`);
      }
      return;
    }
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append("organization_name", organization);
      data.append("app_name", form.appName.trim() || "SI PILOT");
      data.append("tagline", form.tagline.trim());
      data.append("description", form.description.trim());
      data.append("primary_color", form.primaryColor);
      data.append("first_name", form.firstName.trim());
      data.append("last_name", form.lastName.trim());
      data.append("email", form.email.trim());
      data.append("password", form.password);
      if (logo) data.append("logo", logo);
      await apiFetch<SetupResult>("/setup/initialize", {
        method: "POST",
        body: data,
      });
      await login(form.email.trim(), form.password);
      toast.success("Installation terminée. Bienvenue dans SI PILOT.");
      await queryClient.invalidateQueries({ queryKey: ["branding"] });
      await queryClient.invalidateQueries({ queryKey: ["setup-status"] });
      navigate("/", { replace: true });
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : "Installation impossible. Réessayez.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <BrandMark />
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-2">
              Première installation
            </p>
            <p className="text-xs text-muted">Configuration de votre structure</p>
          </div>
        </header>

        <main className="mt-10 grid flex-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <div className="rounded-xl border border-border-soft bg-surface/50 p-4">
              <p className="text-xs font-semibold text-foreground">Assistant d'installation</p>
              <p className="mt-1 text-[11px] leading-5 text-muted">
                Trois étapes pour préparer l'application. Aucun compte n'existe encore.
              </p>
            </div>
            <ol className="space-y-1.5">
              {STEPS.map((item, index) => {
                const active = index === step;
                const done = index < step;
                return (
                  <li
                    key={item.key}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-xs ${
                      active
                        ? "border-primary/30 bg-primary/10 text-foreground"
                        : "border-border-soft text-muted"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] ${
                        done
                          ? "border-success/30 bg-success/15 text-success"
                          : active
                            ? "border-primary/40 bg-primary/20 text-primary-strong"
                            : "border-border-soft text-muted-2"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    <span className="font-medium">{item.label}</span>
                  </li>
                );
              })}
            </ol>
            <div className="rounded-xl border border-border-soft bg-background-soft/50 p-3 text-[10px] leading-4 text-muted-2">
              <ShieldCheck className="mb-1.5 h-3.5 w-3.5 text-accent" />
              Les données restent sur ce serveur. Le compte créé dispose de tous les droits
              d'administration.
            </div>
          </aside>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {step === 0 ? <Building2 className="h-4 w-4 text-accent" /> : null}
                {step === 1 ? <Palette className="h-4 w-4 text-accent" /> : null}
                {step === 2 ? <UserRound className="h-4 w-4 text-accent" /> : null}
                {step === 0
                  ? "Votre structure"
                  : step === 1
                    ? "Votre identité visuelle"
                    : "Votre compte administrateur"}
              </CardTitle>
              <CardDescription>
                {step === 0
                  ? "Ces informations seront affichées dans l'interface, les e-mails et les exports."
                  : step === 1
                    ? "Ajoutez votre logo et choisissez la couleur principale. Vous pourrez les modifier plus tard."
                    : "Le premier compte dispose de tous les droits. Vous pourrez créer les autres comptes ensuite."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {step === 0 ? (
                <>
                  <div>
                    <Label htmlFor="setup-organization">Nom de la structure *</Label>
                    <Input
                      id="setup-organization"
                      value={form.organizationName}
                      onChange={(event) => update("organizationName", event.target.value)}
                      placeholder="Parc national de forêts, Mairie de..., Université de..."
                      autoFocus
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="setup-app-name">Nom de l'application</Label>
                      <Input
                        id="setup-app-name"
                        value={form.appName}
                        onChange={(event) => update("appName", event.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="setup-tagline">Accroche</Label>
                      <Input
                        id="setup-tagline"
                        value={form.tagline}
                        onChange={(event) => update("tagline", event.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="setup-description">Description</Label>
                    <Textarea
                      id="setup-description"
                      value={form.description}
                      onChange={(event) => update("description", event.target.value)}
                      rows={3}
                    />
                  </div>
                </>
              ) : null}

              {step === 1 ? (
                <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <div className="flex h-32 items-center justify-center overflow-hidden rounded-xl border border-border-soft bg-white p-3">
                      {logoPreview ? (
                        <img
                          src={logoPreview}
                          alt="Aperçu du logo"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <div className="text-center text-[10px] text-slate-500">
                          <ImageUp className="mx-auto mb-1 h-6 w-6" />
                          Aucun logo
                        </div>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        const selected = event.target.files?.[0] ?? null;
                        if (selected && selected.size > 4 * 1024 * 1024) {
                          toast.error("Le logo ne doit pas dépasser 4 Mo.");
                          return;
                        }
                        setLogo(selected);
                      }}
                      className="block w-full text-[10px] text-muted file:mr-2 file:rounded-md file:border-0 file:bg-primary/15 file:px-2 file:py-1.5 file:text-[10px] file:text-primary-strong"
                    />
                    <p className="text-[10px] leading-4 text-muted-2">
                      PNG, JPEG ou WEBP, 4 Mo maximum. Optionnel.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="setup-color">Couleur principale</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label="Choisir la couleur principale"
                          value={form.primaryColor}
                          onChange={(event) => update("primaryColor", event.target.value)}
                          className="h-9 w-12 cursor-pointer rounded-md border border-border-soft bg-background p-1"
                        />
                        <Input
                          id="setup-color"
                          value={form.primaryColor}
                          onChange={(event) => update("primaryColor", event.target.value)}
                          className="font-mono text-[11px] uppercase"
                          maxLength={7}
                        />
                      </div>
                    </div>
                    <div className="rounded-lg border border-border-soft bg-background-soft/50 p-3 text-[11px] leading-5 text-muted">
                      Cette couleur est utilisée pour les boutons, la navigation active et les
                      en-têtes des exports PDF. Les nuances sont calculées automatiquement.
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="setup-first-name">Prénom *</Label>
                      <Input
                        id="setup-first-name"
                        value={form.firstName}
                        onChange={(event) => update("firstName", event.target.value)}
                        autoFocus
                      />
                    </div>
                    <div>
                      <Label htmlFor="setup-last-name">Nom *</Label>
                      <Input
                        id="setup-last-name"
                        value={form.lastName}
                        onChange={(event) => update("lastName", event.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="setup-email">Adresse e-mail *</Label>
                    <Input
                      id="setup-email"
                      type="email"
                      value={form.email}
                      onChange={(event) => update("email", event.target.value)}
                      placeholder="prenom.nom@exemple.fr"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="setup-password">Mot de passe *</Label>
                      <Input
                        id="setup-password"
                        type="password"
                        value={form.password}
                        onChange={(event) => update("password", event.target.value)}
                        placeholder="12 caractères minimum"
                      />
                    </div>
                    <div>
                      <Label htmlFor="setup-confirm">Confirmation *</Label>
                      <Input
                        id="setup-confirm"
                        type="password"
                        value={form.confirmPassword}
                        onChange={(event) => update("confirmPassword", event.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] leading-4 text-muted-2">
                    Au moins 12 caractères, une majuscule, une minuscule et un chiffre.
                  </p>
                  <div className="rounded-lg border border-border-soft bg-background-soft/50 p-3 text-[11px] leading-5 text-muted">
                    <span className="font-medium text-foreground">Récapitulatif :</span>{" "}
                    {organization} · {form.appName || "SI PILOT"} · {form.email || "adresse à renseigner"}
                  </div>
                </>
              ) : null}

              {error ? (
                <div
                  role="alert"
                  className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2.5 text-xs leading-5 text-danger"
                >
                  {error}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-4">
                <div>
                  {step > 0 ? (
                    <Button variant="ghost" onClick={() => setStep((current) => current - 1)}>
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Retour
                    </Button>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {step < STEPS.length - 1 ? (
                    <Button onClick={next}>
                      Continuer
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button loading={submitting} onClick={() => void submit()}>
                      <Check className="h-3.5 w-3.5" />
                      Terminer l'installation
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </main>

        <footer className="mt-8 text-center text-[10px] text-muted-2">
          {branding.app_name} · version {branding.version} · installation guidée
        </footer>
      </div>
    </div>
  );
}
