import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Briefcase,
  CircleHelp,
  Link2,
  LifeBuoy,
  Printer,
  Rocket,
  Scale,
  Search,
  Server,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useBranding } from "@/features/branding/BrandingProvider";
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  getHelpArticle,
  helpCategoryLabel,
  searchHelp,
  type HelpArticle,
  type HelpBlock,
  type HelpTone,
} from "@/features/help/content";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS = {
  demarrage: Rocket,
  parc: Users,
  support: LifeBuoy,
  gestion: Briefcase,
  infrastructure: Server,
  conformite: Scale,
  administration: Settings,
  exploitation: Wrench,
  faq: CircleHelp,
} as const;

const NOTE_STYLES: Record<HelpTone, string> = {
  info: "border-info/25 bg-info/[0.06] text-info",
  warning: "border-warning/25 bg-warning/[0.06] text-warning",
  success: "border-success/25 bg-success/[0.06] text-success",
};

function NoteBlock({ tone, title, text }: { tone: HelpTone; title?: string; text: string }) {
  return (
    <div className={cn("rounded-lg border px-3.5 py-3 text-[12px] leading-6", NOTE_STYLES[tone])}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <p>{text}</p>
    </div>
  );
}

function Block({ block }: { block: HelpBlock }) {
  if (block.type === "paragraph") {
    return <p className="text-[13px] leading-7 text-muted">{block.text}</p>;
  }
  if (block.type === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return (
      <Tag className={cn("space-y-1.5 pl-5 text-[13px] leading-6 text-muted", block.ordered ? "list-decimal" : "list-disc")}>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </Tag>
    );
  }
  if (block.type === "steps") {
    return (
      <ol className="space-y-2.5">
        {block.items.map((item, index) => (
          <li key={item} className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-[10px] font-semibold text-primary-strong">
              {index + 1}
            </span>
            <p className="pt-0.5 text-[13px] leading-6 text-muted">{item}</p>
          </li>
        ))}
      </ol>
    );
  }
  if (block.type === "note") {
    return <NoteBlock tone={block.tone} title={block.title} text={block.text} />;
  }
  if (block.type === "table") {
    return (
      <div className="overflow-x-auto rounded-lg border border-border-soft">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead className="bg-surface-2/70">
            <tr>
              {block.headers.map((header) => (
                <th key={header} className="border-b border-border-soft px-3 py-2 font-semibold text-foreground">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, index) => (
              <tr key={index} className="border-b border-border-soft/60 last:border-0">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-2 align-top leading-5 text-muted">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <pre className="overflow-x-auto rounded-lg border border-border-soft bg-background px-3.5 py-3 font-mono text-[11px] leading-6 text-muted">
      {block.content}
    </pre>
  );
}

function ArticleView({ article }: { article: HelpArticle }) {
  const navigate = useNavigate();
  const index = HELP_ARTICLES.findIndex((item) => item.slug === article.slug);
  const previous = index > 0 ? HELP_ARTICLES[index - 1] : null;
  const next = index >= 0 && index < HELP_ARTICLES.length - 1 ? HELP_ARTICLES[index + 1] : null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Lien de l'article copié.");
    } catch {
      toast.error("Copie impossible dans ce navigateur.");
    }
  };

  return (
    <article className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge tone="accent">{helpCategoryLabel(article.category)}</Badge>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{article.title}</h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-6 text-muted">{article.summary}</p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => void copyLink()}>
            <Link2 className="h-3.5 w-3.5" />
            Copier le lien
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Imprimer
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {article.blocks.map((block, blockIndex) => (
          <Block key={blockIndex} block={block} />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {article.tags.map((tag) => (
          <Badge key={tag} tone="neutral">
            {tag}
          </Badge>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-4">
        {previous ? (
          <Button variant="ghost" size="sm" onClick={() => void navigate(`/aide/${previous.slug}`)}>
            <ArrowLeft className="h-3.5 w-3.5" />
            {previous.title}
          </Button>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="sm" onClick={() => void navigate("/aide")}>
          Sommaire
        </Button>
        {next ? (
          <Button variant="ghost" size="sm" onClick={() => void navigate(`/aide/${next.slug}`)}>
            {next.title}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <span />
        )}
      </div>
    </article>
  );
}

export function HelpPage() {
  const { slug } = useParams<{ slug?: string }>();
  const branding = useBranding();
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery("");
  }, [slug]);

  const article = slug ? getHelpArticle(slug) : undefined;
  const results = useMemo(() => searchHelp(query), [query]);
  const searching = query.trim().length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-border-soft bg-surface/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary-strong">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Centre d'aide</p>
            <p className="mt-0.5 text-[11px] leading-5 text-muted">
              Guides d'utilisation, procédures d'exploitation et bonnes pratiques de {branding.app_name}.
            </p>
          </div>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une aide, un module, une procédure..."
            className="pl-8"
            aria-label="Rechercher dans l'aide"
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Link
            to="/aide"
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
              !slug && !searching
                ? "border-primary/30 bg-primary/10 text-foreground"
                : "border-border-soft text-muted hover:text-foreground",
            )}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Sommaire de l'aide
          </Link>

          <nav className="space-y-3" aria-label="Catégories d'aide">
            {HELP_CATEGORIES.map((category) => {
              const Icon = CATEGORY_ICONS[category.key as keyof typeof CATEGORY_ICONS] ?? CircleHelp;
              const items = HELP_ARTICLES.filter((item) => item.category === category.key);
              return (
                <div key={category.key}>
                  <p className="flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
                    <Icon className="h-3 w-3" />
                    {category.label}
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {items.map((item) => (
                      <Link
                        key={item.slug}
                        to={`/aide/${item.slug}`}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-[11px] leading-4 transition-colors",
                          item.slug === slug
                            ? "bg-primary/10 text-primary-strong"
                            : "text-muted hover:bg-surface-2 hover:text-foreground",
                        )}
                      >
                        {item.title}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>

          <Card className="border-primary/15 bg-primary/[0.04]">
            <CardContent className="p-3">
              <p className="text-[11px] font-semibold text-foreground">Besoin d'un coup de main ?</p>
              <p className="mt-1 text-[10px] leading-5 text-muted">
                Consultez la page Système pour le diagnostic, puis contactez votre administrateur.
              </p>
              {branding.support_email ? (
                <a
                  href={`mailto:${branding.support_email}`}
                  className="mt-2 inline-block text-[10px] text-accent hover:underline"
                >
                  {branding.support_email}
                </a>
              ) : null}
            </CardContent>
          </Card>
        </aside>

        <main className="min-w-0">
          {searching ? (
            <Card>
              <CardHeader>
                <CardTitle>Résultats de recherche</CardTitle>
                <CardDescription>
                  {results.length} article(s) pour « {query.trim()} ».
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {results.length === 0 ? (
                  <EmptyState
                    icon={Search}
                    title="Aucun résultat"
                    description="Essayez un mot plus général : ticket, sauvegarde, logo, WAPT, réservation..."
                  />
                ) : (
                  results.map((item) => (
                    <Link
                      key={item.slug}
                      to={`/aide/${item.slug}`}
                      className="block rounded-lg border border-border-soft bg-background-soft/40 px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-primary/5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[12px] font-medium text-foreground">{item.title}</p>
                        <Badge tone="neutral">{helpCategoryLabel(item.category)}</Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-5 text-muted-2">{item.summary}</p>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          ) : slug ? (
            article ? (
              <ArticleView article={article} />
            ) : (
              <Card>
                <EmptyState
                  icon={CircleHelp}
                  title="Article introuvable"
                  description="Cet article n'existe pas ou a été renommé."
                  action={
                    <Button variant="secondary" onClick={() => void window.history.back()}>
                      Retour
                    </Button>
                  }
                />
              </Card>
            )
          ) : (
            <div className="space-y-4">
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-foreground">Comment pouvons-nous vous aider ?</h1>
                <p className="mt-1 text-[12px] leading-6 text-muted">
                  Parcourez les guides par thème ou utilisez la recherche. Chaque article décrit les
                  écrans, les permissions et les bonnes pratiques.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {HELP_CATEGORIES.map((category) => {
                  const Icon = CATEGORY_ICONS[category.key as keyof typeof CATEGORY_ICONS] ?? CircleHelp;
                  const items = HELP_ARTICLES.filter((item) => item.category === category.key);
                  const first = items[0];
                  return (
                    <Link
                      key={category.key}
                      to={first ? `/aide/${first.slug}` : "/aide"}
                      className="group rounded-xl border border-border-soft bg-surface/40 p-4 transition-colors hover:border-primary/30 hover:bg-primary/[0.04]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary-strong">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="text-[10px] text-muted-2">{items.length} article(s)</span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-foreground">{category.label}</p>
                      <p className="mt-1 text-[11px] leading-5 text-muted-2">{category.description}</p>
                      <span className="mt-3 inline-flex items-center gap-1 text-[10px] text-accent">
                        Ouvrir
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  );
                })}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Guides les plus consultés</CardTitle>
                  <CardDescription>Les points d'entrée essentiels pour prendre en main l'outil.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2">
                  {HELP_ARTICLES.slice(0, 8).map((item) => (
                    <Link
                      key={item.slug}
                      to={`/aide/${item.slug}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border-soft px-3 py-2 text-[11px] text-muted transition-colors hover:border-primary/30 hover:text-foreground"
                    >
                      <span>{item.title}</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
