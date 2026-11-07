import { Compass } from "lucide-react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={Compass}
        title="Page introuvable"
        description="Cette adresse n'existe pas ou a été déplacée."
        action={
          <Link to="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Retour à la vue générale
          </Link>
        }
      />
    </Card>
  );
}
