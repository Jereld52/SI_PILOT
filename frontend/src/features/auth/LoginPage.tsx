import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowRight, Database, LockKeyhole, Network, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { BrandMark } from "@/components/layout/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError } from "@/lib/api";

const schema = z.object({
  email: z.string().email("Adresse e-mail invalide."),
  password: z.string().min(1, "Le mot de passe est requis."),
});

type LoginValues = z.infer<typeof schema>;

const pillars = [
  { icon: Network, label: "Parc et infrastructure", text: "Inventaire, affectations, réseau" },
  { icon: ShieldCheck, label: "Sécurité et conformité", text: "Incidents, RGPD, contrats" },
  { icon: Database, label: "Pilotage et budget", text: "Projets, dépenses, échéances" },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (values: LoginValues) => {
    setError(null);
    try {
      await login(values.email, values.password);
      const destination = (location.state as { from?: string } | null)?.from;
      navigate(destination && destination !== "/login" ? destination : "/", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Connexion impossible. Vérifiez le serveur et réessayez.",
      );
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden border-r border-border-soft bg-background-soft p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="grid-noise absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-primary/30 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-brand-green/10 blur-3xl" aria-hidden="true" />

        <div className="relative">
          <div className="inline-flex rounded-2xl border border-brand-cream/20 bg-brand-cream p-4 shadow-2xl shadow-black/30">
            <img
              src="/logo.png"
              alt="Parc national de forêts"
              className="h-auto w-[280px] max-w-[60vw] object-contain"
            />
          </div>
          <div className="mt-6 flex h-1 w-28 overflow-hidden rounded-full" aria-hidden="true">
            <span className="flex-1 bg-brand-burgundy" />
            <span className="flex-1 bg-accent" />
            <span className="flex-1 bg-brand-green" />
            <span className="flex-1 bg-warning" />
          </div>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
            SI PNFor PILOTE
          </p>
          <p className="mt-3 max-w-xl text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground xl:text-4xl">
            Le cockpit du système d'information du Parc national de forêts.
          </p>
          <p className="mt-4 max-w-lg text-sm leading-6 text-muted">
            Centralisez le parc, les demandes, les contrats, le budget, les projets et la sécurité.
            Une vision fiable, actualisée et exploitable au quotidien.
          </p>
        </div>

        <div className="relative mt-12 grid gap-3 xl:grid-cols-3">
          {pillars.map((pillar) => (
            <div
              key={pillar.label}
              className="rounded-xl border border-border-soft bg-surface/60 p-4 backdrop-blur-sm"
            >
              <pillar.icon className="h-4 w-4 text-accent" aria-hidden="true" />
              <p className="mt-3 text-xs font-medium text-foreground">{pillar.label}</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-2">{pillar.text}</p>
            </div>
          ))}
        </div>

        <div className="relative mt-12 flex items-center gap-2 text-[11px] text-muted-2">
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
          Accès local sécurisé — aucune donnée transmise à un service externe sans validation.
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandMark />
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Espace professionnel
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Connexion</h1>
          <p className="mt-1 text-sm text-muted">
            Identifiez-vous avec votre compte SI PNFor PILOTE.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            {error ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2.5 text-xs leading-5 text-danger"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            <div>
              <Label htmlFor="email">Adresse e-mail professionnelle</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                placeholder="prenom.nom@pnfor.fr"
                invalid={Boolean(errors.email)}
                {...register("email")}
              />
              {errors.email ? <p className="mt-1 text-[11px] text-danger">{errors.email.message}</p> : null}
            </div>

            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
                invalid={Boolean(errors.password)}
                {...register("password")}
              />
              {errors.password ? (
                <p className="mt-1 text-[11px] text-danger">{errors.password.message}</p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" loading={isSubmitting} size="lg">
              Se connecter
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>

          <div className="mt-8 rounded-lg border border-border-soft bg-surface/50 p-3 text-[11px] leading-5 text-muted-2">
            <p className="font-medium text-muted">Accès réservé</p>
            <p className="mt-1">
              Les comptes sont créés par un administrateur. Toute connexion est journalisée.
            </p>
          </div>

          <p className="mt-8 text-center text-[10px] text-muted-2">
            SI PNFor PILOTE · version 0.1.0 · Parc national de forêts
          </p>
        </div>
      </section>
    </div>
  );
}
