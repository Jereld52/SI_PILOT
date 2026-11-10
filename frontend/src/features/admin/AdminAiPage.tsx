import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  KeyRound,
  Save,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import type { AiConfig, AiTestResponse } from "@/types/api";

interface ProviderPreset {
  value: string;
  label: string;
  baseUrl: string;
  model: string;
  description: string;
  requiresKey: boolean;
}

const providers: ProviderPreset[] = [
  {
    value: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    description: "API officielle OpenAI (GPT-4.1, GPT-4o, o-series).",
    requiresKey: true,
  },
  {
    value: "azure_openai",
    label: "Azure OpenAI",
    baseUrl:
      "https://<ressource>.openai.azure.com/openai/deployments/<deploiement>",
    model: "<nom-du-deploiement>",
    description: "Déploiement Azure OpenAI avec en-tête api-key.",
    requiresKey: true,
  },
  {
    value: "mistral",
    label: "Mistral AI",
    baseUrl: "https://api.mistral.ai/v1",
    model: "mistral-small-latest",
    description: "API Mistral, hébergée en Europe.",
    requiresKey: true,
  },
  {
    value: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    description: "Inférence rapide compatible OpenAI.",
    requiresKey: true,
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4.1-mini",
    description: "Passerelle multi-fournisseurs compatible OpenAI.",
    requiresKey: true,
  },
  {
    value: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    description: "Point d'accès compatible OpenAI de Gemini.",
    requiresKey: true,
  },
  {
    value: "anthropic",
    label: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
    description: "API Messages d'Anthropic.",
    requiresKey: true,
  },
  {
    value: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.2",
    description: "Modèle local, aucune donnée envoyée à l'extérieur.",
    requiresKey: false,
  },
  {
    value: "openwebui",
    label: "Open WebUI",
    baseUrl: "https://ai.example.org/api",
    model: "",
    description: "Instance Open WebUI auto-hébergée, endpoint compatible OpenAI.",
    requiresKey: false,
  },
  {
    value: "custom",
    label: "Compatible OpenAI (autre)",
    baseUrl: "",
    model: "",
    description: "Tout endpoint /chat/completions compatible OpenAI.",
    requiresKey: true,
  },
];

const capabilities = [
  "Résumer l'état du parc, les pannes et les renouvellements",
  "Identifier les postes avec des mises à jour WAPT en attente",
  "Préparer un bilan mensuel ou une synthèse pour la direction",
  "Analyser les demandes ouvertes et proposer des priorités",
  "Anticiper les échéances de contrats, garanties et renouvellements",
  "Rédiger un compte rendu, une communication ou une procédure",
  "Aider à qualifier un incident ou une demande IT",
  "Préparer un plan d'action sécurité ou RGPD",
];

export function AdminAiPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("ai.configure");

  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [apiKey, setApiKey] = useState("");
  const [temperature, setTemperature] = useState("0.2");
  const [maxTokens, setMaxTokens] = useState("1200");
  const [timeoutSeconds, setTimeoutSeconds] = useState("60");
  const [includeContext, setIncludeContext] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AiTestResponse | null>(null);

  const configQuery = useQuery({
    queryKey: ["admin", "ai", "config"],
    queryFn: () => apiFetch<AiConfig>("/admin/ai/config"),
    enabled: canManage,
  });
  const config = configQuery.data;

  useEffect(() => {
    if (!config) return;
    const preset = providers.find((item) => item.value === config.provider);
    setEnabled(config.enabled);
    setProvider(config.provider);
    setBaseUrl(config.base_url || preset?.baseUrl || "");
    setModel(config.model || preset?.model || "");
    setApiKey("");
    setTemperature(String(config.temperature));
    setMaxTokens(String(config.max_tokens));
    setTimeoutSeconds(String(config.timeout_seconds));
    setIncludeContext(config.include_fleet_context);
    setTestResult(null);
  }, [config]);

  const applyPreset = (value: string) => {
    const preset = providers.find((item) => item.value === value);
    setProvider(value);
    if (preset) {
      if (preset.baseUrl) setBaseUrl(preset.baseUrl);
      if (preset.model) setModel(preset.model);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch<AiConfig>("/admin/ai/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled,
          provider,
          base_url: baseUrl,
          model,
          api_key: apiKey || null,
          temperature: Number(temperature) || 0.2,
          max_tokens: Number(maxTokens) || 1200,
          timeout_seconds: Number(timeoutSeconds) || 60,
          include_fleet_context: includeContext,
        }),
      });
      toast.success("Configuration de l'assistant IA enregistrée.");
      setApiKey("");
      void configQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch<AiTestResponse>("/admin/ai/test", {
        method: "POST",
      });
      setTestResult(result);
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Test impossible.");
    } finally {
      setTesting(false);
    }
  };

  if (!canManage) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Accès refusé"
        description="Votre rôle ne permet pas de configurer l'assistant IA."
      />
    );
  }

  const activePreset = providers.find((item) => item.value === provider);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Fournisseur de l'assistant IA</h2>
            <p className="mt-1 text-xs text-muted">
              Connectez OpenAI, Azure OpenAI, Mistral, Gemini, Anthropic, un modèle local Ollama ou
              tout endpoint compatible OpenAI.
            </p>
          </div>
          <Badge tone={config?.configured ? "success" : "warning"}>
            {config?.configured ? "Configuré" : "Non configuré"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="ai-provider">Fournisseur</Label>
              <Select
                id="ai-provider"
                value={provider}
                onChange={(event) => applyPreset(event.target.value)}
              >
                {providers.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
              {activePreset ? (
                <p className="mt-1 text-[10px] text-muted-2">{activePreset.description}</p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ai-base-url">URL de base</Label>
              <Input
                id="ai-base-url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                className="font-mono text-[11px]"
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div>
              <Label htmlFor="ai-model">Modèle</Label>
              <Input
                id="ai-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="gpt-4.1-mini"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ai-api-key">Clé d'API</Label>
              <Input
                id="ai-api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  config?.api_key_set ? "Laisser vide pour conserver" : "Clé d'API du fournisseur"
                }
              />
              <p className="mt-1 text-[10px] text-muted-2">
                Stockée chiffrée en base avec FIELD_ENCRYPTION_KEY. Jamais renvoyée par l'API.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label htmlFor="ai-temperature">Température</Label>
              <Input
                id="ai-temperature"
                type="number"
                min={0}
                max={2}
                step="0.1"
                value={temperature}
                onChange={(event) => setTemperature(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ai-max-tokens">Réponse max (jetons)</Label>
              <Input
                id="ai-max-tokens"
                type="number"
                min={100}
                max={8000}
                value={maxTokens}
                onChange={(event) => setMaxTokens(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ai-timeout">Délai (secondes)</Label>
              <Input
                id="ai-timeout"
                type="number"
                min={10}
                max={300}
                value={timeoutSeconds}
                onChange={(event) => setTimeoutSeconds(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 pt-5 text-[11px] text-muted">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              Assistant actif
            </label>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-border-soft bg-background/40 px-3 py-2.5 text-[11px] text-muted">
            <input
              type="checkbox"
              className="mt-0.5 h-3.5 w-3.5 accent-primary"
              checked={includeContext}
              onChange={(event) => setIncludeContext(event.target.checked)}
            />
            <span>
              Envoyer un contexte agrégé du parc (compteurs, pannes, renouvellements, mises à jour,
              demandes ouvertes, contrats, alertes). Les secrets et données personnelles détaillées
              ne sont pas inclus.
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button loading={saving} onClick={() => void save()}>
              <Save className="h-3.5 w-3.5" />
              Enregistrer
            </Button>
            <Button variant="secondary" loading={testing} onClick={() => void test()}>
              <Wand2 className="h-3.5 w-3.5" />
              Tester la connexion
            </Button>
          </div>

          {testResult ? (
            <div className="rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-[11px] text-success">
              <p className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {testResult.message}
              </p>
              <p className="mt-1 text-[10px] text-success/90">
                Modèle : {testResult.model || "—"}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Usages pour la gestion du parc</h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  Ce que l'assistant peut apporter aux équipes IT.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {capabilities.map((capability) => (
                <li
                  key={capability}
                  className="flex items-start gap-1.5 text-[11px] leading-5 text-muted"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary-strong" />
                  {capability}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Garde-fous</h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  L'assistant reste un outil d'aide, sans écriture automatique.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-[11px] leading-5 text-muted">
            <p className="flex items-start gap-2">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-strong" />
              La clé d'API est chiffrée et n'est jamais exposée au navigateur.
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-strong" />
              Aucune modification de données : les actions proposées doivent être réalisées dans
              l'application par un utilisateur habilité.
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-strong" />
              Chaque échange est journalisé dans les exécutions IA (demande, statut, durée), sans
              stocker la clé.
            </p>
            <p className="text-[10px] text-muted-2">
              Les données envoyées au fournisseur dépendent du contexte activé. Pour un usage
              souverain, privilégiez Ollama ou une instance interne compatible OpenAI.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
