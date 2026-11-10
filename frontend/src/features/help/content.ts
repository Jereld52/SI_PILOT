export type HelpTone = "info" | "warning" | "success";

export type HelpBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "steps"; items: string[] }
  | { type: "note"; tone: HelpTone; title?: string; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; content: string };

export interface HelpCategory {
  key: string;
  label: string;
  description: string;
}

export interface HelpArticle {
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  blocks: HelpBlock[];
}

const p = (text: string): HelpBlock => ({ type: "paragraph", text });
const list = (items: string[], ordered = false): HelpBlock => ({ type: "list", items, ordered });
const steps = (items: string[]): HelpBlock => ({ type: "steps", items });
const note = (tone: HelpTone, text: string, title?: string): HelpBlock => ({
  type: "note",
  tone,
  title,
  text,
});
const table = (headers: string[], rows: string[][]): HelpBlock => ({
  type: "table",
  headers,
  rows,
});
const code = (content: string): HelpBlock => ({ type: "code", content });

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    key: "demarrage",
    label: "Prise en main",
    description: "Connexion, navigation, rôles et tableau de bord.",
  },
  {
    key: "parc",
    label: "Parc, agents et téléphonie",
    description: "Référentiels, agents, équipements, affectations et lignes mobiles.",
  },
  {
    key: "support",
    label: "Support et matériel",
    description: "Demandes IT, interventions, réservations et stock.",
  },
  {
    key: "communication",
    label: "Communication",
    description: "Communications aux utilisateurs, réunions, formations et points de suivi.",
  },
  {
    key: "gestion",
    label: "Gestion et pilotage",
    description: "Fournisseurs, contrats, budget, projets, documentation et calendrier.",
  },
  {
    key: "infrastructure",
    label: "Infrastructure et sécurité",
    description: "Réseau, dépendances, supervision, incidents et certificats.",
  },
  {
    key: "conformite",
    label: "Conformité",
    description: "RGPD, journal d'audit et traçabilité.",
  },
  {
    key: "administration",
    label: "Administration",
    description: "Comptes, identité, e-mails, WAPT, LDAP, imports et système.",
  },
  {
    key: "exploitation",
    label: "Installation et exploitation",
    description: "Première installation, sauvegarde, mise à jour et dépannage.",
  },
  {
    key: "faq",
    label: "Questions fréquentes",
    description: "Bonnes pratiques et réponses aux problèmes courants.",
  },
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "premiere-connexion",
    title: "Première connexion",
    summary: "Se connecter à SI PILOT, changer son mot de passe et comprendre les sessions.",
    category: "demarrage",
    tags: ["connexion", "mot de passe", "session", "première fois"],
    blocks: [
      p(
        "L'accès à SI PILOT se fait avec un compte nominatif créé par un administrateur. Aucun accès anonyme n'est possible, y compris pour les fiches ouvertes par QR code.",
      ),
      steps([
        "Ouvrir l'adresse de l'application fournie par votre administrateur.",
        "Saisir l'adresse e-mail professionnelle et le mot de passe.",
        "Cliquer sur « Se connecter ».",
        "Si un bandeau indique que le mot de passe doit être changé, ouvrir le menu du compte puis « Changer le mot de passe ».",
      ]),
      note(
        "warning",
        "Après cinq échecs consécutifs, le compte est temporairement verrouillé pendant quinze minutes.",
        "Verrouillage",
      ),
      p(
        "Les sessions sont stockées côté serveur et expirent après une période d'inactivité. La modification du mot de passe révoque les autres sessions ouvertes.",
      ),
      note(
        "info",
        "Si vous avez oublié votre mot de passe, contactez un administrateur : la réinitialisation se fait depuis l'administration des utilisateurs.",
      ),
    ],
  },
  {
    slug: "double-authentification",
    title: "Double authentification (TOTP)",
    summary: "Activer un code temporaire avec une application d'authentification, sans SMTP.",
    category: "demarrage",
    tags: ["MFA", "2FA", "TOTP", "authenticator", "sécurité", "code de secours"],
    blocks: [
      p(
        "La double authentification ajoute un code temporaire à la connexion. Elle utilise le standard TOTP et fonctionne avec Google Authenticator, Microsoft Authenticator, FreeOTP, Bitwarden, 1Password ou toute application compatible. Elle ne dépend pas du serveur SMTP.",
      ),
      steps([
        "Ouvrir le menu du profil puis « Sécurité du compte ».",
        "Cliquer sur « Configurer la MFA ».",
        "Scanner le QR code avec l'application d'authentification.",
        "Saisir le code à 6 chiffres généré pour activer la MFA.",
        "Conserver les codes de secours affichés : ils permettent de se connecter si le téléphone est perdu.",
      ]),
      p(
        "À la connexion, SI PILOT demande le mot de passe puis le code TOTP ou un code de secours. Chaque code de secours ne sert qu'une seule fois.",
      ),
      note(
        "warning",
        "Si vous perdez l'application et les codes de secours, un administrateur peut réinitialiser la MFA depuis Administration → Utilisateurs. Toutes vos sessions seront alors révoquées.",
      ),
      note(
        "info",
        "La page Administration → Système indique combien d'administrateurs ont activé la MFA. Les cookies de session sont automatiquement marqués Secure lorsque l'application est servie en HTTPS.",
      ),
    ],
  },
  {
    slug: "navigation-et-recherche",
    title: "Navigation, onglets et recherche globale",
    summary: "Comprendre le menu, les onglets, les filtres, le tri et la recherche transverse.",
    category: "demarrage",
    tags: ["navigation", "recherche", "onglets", "filtres", "tri"],
    blocks: [
      p(
        "Le menu latéral regroupe les modules en sections repliables : Pilotage, Support & parc, Infrastructure, Gestion et Conformité. La section active s'ouvre automatiquement.",
      ),
      list([
        "Le bouton de repli réduit le menu aux icônes et libère de l'espace.",
        "Les pages chargées de données sont organisées en onglets pour limiter le défilement.",
        "Les tableaux se trient en cliquant sur l'en-tête d'une colonne.",
        "Les filtres de recherche, de statut, de type et de site se combinent.",
      ]),
      p(
        "La recherche globale est accessible dans la barre supérieure. Elle couvre tous les modules autorisés par vos permissions : agents, parc, téléphonie, infrastructure, stock, tickets, interventions, fournisseurs, licences, contrats, budget, projets, cybersécurité, RGPD, réservations, calendrier et documentation.",
      ),
      p(
        "Chaque résultat ouvre la page correspondante avec le filtre prérempli. Les onglets concernés sont sélectionnés automatiquement lorsque nécessaire.",
      ),
      note(
        "success",
        "La recherche et les listes ne montrent que les données auxquelles votre rôle vous donne accès.",
      ),
    ],
  },
  {
    slug: "roles-et-permissions",
    title: "Rôles, permissions et portées de données",
    summary: "Comprendre qui peut voir et modifier quoi, et comment demander un accès.",
    category: "demarrage",
    tags: ["rôles", "permissions", "sécurité", "accès", "DPO"],
    blocks: [
      p(
        "Les droits sont attribués par rôle, puis affinés par des permissions et une portée de données. Un utilisateur peut aussi recevoir des permissions supplémentaires à titre individuel.",
      ),
      table(
        ["Rôle", "Usage principal"],
        [
          ["Administrateur", "Configuration complète, comptes, rôles, audit et identité."],
          ["Responsable informatique", "Pilotage du parc, du support, des contrats et du budget."],
          ["Technicien", "Traitement des demandes, interventions, parc et infrastructure."],
          ["Lecteur", "Consultation des données autorisées, sans modification."],
          ["DPO", "Registre RGPD, demandes, droits, violations, audit et documents."],
          ["Gestionnaire de réservations", "Catalogue, planning, sorties et retours de matériel."],
        ],
      ),
      p(
        "La portée de données peut restreindre la visibilité à son service, son site ou l'ensemble de la structure. Les exports et la recherche respectent ces restrictions.",
      ),
      note(
        "info",
        "Si une page ou un bouton n'apparaît pas, votre rôle ne dispose probablement pas de la permission correspondante. Demandez à un administrateur, qui pourra ajuster le rôle ou vous accorder une permission ciblée.",
      ),
    ],
  },
  {
    slug: "tableau-de-bord",
    title: "Tableau de bord et tuiles personnalisables",
    summary: "Lire le cockpit, les analyses et les alertes, puis choisir ses tuiles.",
    category: "demarrage",
    tags: ["tableau de bord", "cockpit", "indicateurs", "tuiles", "alertes"],
    blocks: [
      p(
        "Le tableau de bord est organisé en trois onglets : Cockpit, Analyses et Alertes & activité. Il s'appuie uniquement sur les données réelles de l'application.",
      ),
      list([
        "Cockpit : chiffres clés, état des modules, échéances à 90 jours et alertes prioritaires.",
        "Analyses : graphiques et répartitions sur le parc, le support, les contrats, le budget et la sécurité.",
        "Alertes & activité : actions attendues et dernières opérations enregistrées.",
      ]),
      p(
        "Chaque utilisateur peut choisir les tuiles de modules affichées et leur ordre. La préférence est enregistrée sur son compte et les tuiles restent filtrées par ses permissions.",
      ),
      note(
        "warning",
        "Un indicateur à zéro peut simplement signifier qu'aucune donnée n'a encore été saisie. L'application n'injecte aucune donnée fictive.",
      ),
    ],
  },
  {
    slug: "profil-et-mot-de-passe",
    title: "Profil et mot de passe",
    summary: "Modifier son mot de passe et adopter les bonnes pratiques de sécurité.",
    category: "demarrage",
    tags: ["profil", "mot de passe", "sécurité", "session"],
    blocks: [
      p(
        "Le menu du compte, en haut à droite, permet de changer le mot de passe et de se déconnecter. La déconnexion révoque la session courante.",
      ),
      steps([
        "Ouvrir le menu du compte puis « Changer le mot de passe ».",
        "Saisir le mot de passe actuel.",
        "Choisir un mot de passe d'au moins 12 caractères, avec majuscule, minuscule et chiffre.",
        "Valider : les autres sessions sont révoquées automatiquement.",
      ]),
      note(
        "warning",
        "Ne partagez jamais votre compte. Toutes les actions sont journalisées avec l'identité de l'utilisateur connecté.",
      ),
    ],
  },
  {
    slug: "themes-interface",
    title: "Thèmes clair, sombre et moderne",
    summary: "Changer l'apparence de l'interface tout en conservant la couleur principale.",
    category: "demarrage",
    tags: ["thème", "clair", "sombre", "moderne", "apparence", "couleur"],
    blocks: [
      p(
        "Le thème est un choix personnel, enregistré dans le navigateur. Il ne modifie pas les données ni l'identité globale de l'application.",
      ),
      steps([
        "Ouvrir le menu du compte en haut à droite.",
        "Descendre à la section « Thème de l'interface ».",
        "Choisir Sombre, Clair ou Moderne.",
      ]),
      list([
        "Sombre : fond profond vert et bordeaux, adapté aux pièces peu éclairées.",
        "Clair : fond crème chaleureux, texte sombre, plus confortable en plein jour.",
        "Moderne : fond clair froid, cartes nettes et accents plus techniques.",
      ]),
      p(
        "La couleur principale configurée dans Administration → Paramètres → Identité de l'application reste appliquée dans les trois thèmes. Les nuances de boutons, de navigation active et de graphiques sont recalculées pour conserver un contraste lisible.",
      ),
      note(
        "info",
        "Le thème est propre à chaque navigateur et à chaque utilisateur. Il se réapplique automatiquement à la prochaine connexion.",
      ),
    ],
  },
  {
    slug: "referentiels",
    title: "Référentiels",
    summary: "Gérer les services, sites et catégories utilisés dans toute l'application.",
    category: "parc",
    tags: ["référentiels", "services", "sites", "catégories", "administration"],
    blocks: [
      p(
        "Les référentiels structurent les fiches agents, le parc, l'infrastructure et les imports. Ils se trouvent dans Administration → Référentiels.",
      ),
      list([
        "Services et sous-services, avec code et responsable.",
        "Sites et localisations.",
        "Catégories d'équipements, avec préfixe de numéro d'inventaire et durée de vie indicative.",
        "Catégories de contrats, de budget et de documents.",
      ]),
      note(
        "info",
        "Un référentiel utilisé par des fiches ne doit généralement pas être supprimé. Utilisez la désactivation lorsqu'elle est disponible, afin de conserver l'historique.",
      ),
    ],
  },
  {
    slug: "agents",
    title: "Agents",
    summary: "Créer et gérer les fiches agents, leurs comptes et leurs équipements.",
    category: "parc",
    tags: ["agents", "services", "comptes", "affectations", "import"],
    blocks: [
      p(
        "La page Agents centralise l'identité professionnelle, le service, le site, les coordonnées et les comptes applicatifs de chaque personne.",
      ),
      list([
        "Création et modification d'une fiche agent.",
        "Rattachement à un service et à un site.",
        "Comptes applicatifs associés (messagerie, métier, etc.).",
        "Équipements affectés et historique des affectations.",
        "Import CSV/XLSX avec prévisualisation et détection des doublons.",
      ]),
      note(
        "success",
        "La recherche globale retrouve un agent par nom, e-mail, service ou équipement affecté.",
      ),
    ],
  },
  {
    slug: "parc-informatique",
    title: "Parc informatique",
    summary: "Exploiter les fiches équipements, les statuts, le QR code et les données WAPT.",
    category: "parc",
    tags: ["parc", "équipements", "WAPT", "QR", "garantie", "renouvellement"],
    blocks: [
      p(
        "Le parc informatique recense les postes, écrans, imprimantes, serveurs, équipements réseau et accessoires. Chaque fiche porte un numéro d'inventaire, un statut, un site et éventuellement un agent affecté.",
      ),
      list([
        "Identité : numéro d'inventaire, catégorie, marque, modèle, numéro de série.",
        "Réseau et système : nom machine, IP, MAC, système d'exploitation.",
        "Achat et cycle de vie : dates, prix, garantie, fin de vie indicative.",
        "Affectation : agent, service, site et historique.",
        "Données WAPT : état en ligne, dernière connexion, dernier utilisateur, domaine et groupes.",
      ]),
      p(
        "Le QR code de l'équipement ouvre sa fiche après authentification. Il peut être régénéré : l'ancien lien devient alors inutilisable.",
      ),
      note(
        "info",
        "Les exports XLSX et PDF reprennent les colonnes détaillées de la fiche. Les secrets éventuels ne sont jamais inclus.",
      ),
    ],
  },
  {
    slug: "logiciels",
    title: "Logiciels du parc",
    summary: "Suivre les versions installées, les mises à jour WAPT et déployer par poste.",
    category: "parc",
    tags: ["logiciel", "WAPT", "mise à jour", "version", "déploiement", "installation"],
    blocks: [
      p(
        "Support & parc → Logiciels présente le parc logiciel remonté par WAPT : versions installées, nombre de postes concernés et mises à jour disponibles.",
      ),
      list([
        "Vue d'ensemble : nombre de logiciels, installations, mises à jour disponibles et postes concernés.",
        "Recherche par nom de logiciel ou de version.",
        "Dépliage d'un logiciel pour afficher les postes concernés et la version disponible.",
        "Onglet « Par poste » : logiciels installés, installation depuis le catalogue WAPT et désinstallation.",
      ]),
      note(
        "info",
        "Les mises à jour sont détectées à partir du statut WAPT NEED-UPGRADE et de la version du catalogue. Lancez « Synchroniser les logiciels » après une mise à jour du dépôt WAPT.",
      ),
      note(
        "warning",
        "L'installation et la désinstallation directes nécessitent une action signée avec la clé privée WAPT. Sinon, utilisez la console WAPT.",
      ),
    ],
  },
  {
    slug: "affectations-et-historique",
    title: "Affectations et historique",
    summary: "Retracer qui a utilisé quel équipement, quand et pour quel motif.",
    category: "parc",
    tags: ["affectation", "historique", "agent", "service", "site"],
    blocks: [
      p(
        "Une affectation relie un équipement à un agent, un service ou un site, avec une date de début, une date de fin et un motif.",
      ),
      steps([
        "Ouvrir la fiche de l'équipement.",
        "Choisir « Affecter » et renseigner le bénéficiaire.",
        "Renseigner la date et le motif.",
        "Valider : l'affectation précédente est clôturée si nécessaire.",
      ]),
      p(
        "L'historique complet reste consultable depuis la fiche et dans l'export du parc. Il permet de savoir qui détenait l'équipement lors d'un incident ou d'un contrôle.",
      ),
    ],
  },
  {
    slug: "qr-code-equipement",
    title: "QR code équipement",
    summary: "Imprimer, scanner et régénérer le QR code d'un équipement.",
    category: "parc",
    tags: ["QR", "étiquette", "équipement", "sécurité"],
    blocks: [
      p(
        "Chaque équipement possède un jeton opaque. Le QR code ouvre directement sa fiche, mais uniquement après connexion : aucun accès anonyme n'est possible.",
      ),
      list([
        "Imprimer le QR code depuis la fiche équipement.",
        "Le scanner avec un téléphone ouvre la fiche correspondante.",
        "Régénérer le QR invalide immédiatement l'ancien lien.",
      ]),
      note(
        "warning",
        "Si une étiquette est perdue ou compromise, régénérez le QR code et remplacez l'étiquette.",
      ),
    ],
  },
  {
    slug: "telephonie-mobile",
    title: "Téléphonie mobile",
    summary: "Gérer les lignes, les terminaux, les échéances et les codes PIN/PUK.",
    category: "parc",
    tags: ["téléphonie", "mobile", "PIN", "PUK", "forfait", "engagement"],
    blocks: [
      p(
        "La page Téléphonie mobile gère les lignes, leurs titulaires, les forfaits, les terminaux et les échéances d'engagement.",
      ),
      list([
        "Création, modification et suppression auditée des lignes.",
        "Titulaire, fonction, service, opérateur, forfait et statut.",
        "Terminal, IMEI et date de fin d'engagement.",
        "Codes PIN/PUK gérés séparément, avec des permissions dédiées.",
      ]),
      note(
        "warning",
        "Les codes PIN et PUK ne doivent jamais être communiqués dans un ticket, un e-mail ou un export. Ils sont chiffrés et révélés uniquement aux utilisateurs autorisés.",
      ),
      p(
        "Les exports détaillés des lignes mobiles excluent systématiquement les secrets. La suppression d'une ligne conserve un instantané dans le journal d'audit.",
      ),
    ],
  },
  {
    slug: "imports-de-donnees",
    title: "Imports CSV et XLSX",
    summary: "Préparer un fichier, prévisualiser, corriger les erreurs et appliquer un import.",
    category: "parc",
    tags: ["import", "CSV", "XLSX", "doublons", "modèles"],
    blocks: [
      p(
        "Administration → Import / Export permet d'importer des agents, des équipements, des lignes mobiles, des fournisseurs, des licences et de l'infrastructure.",
      ),
      steps([
        "Télécharger le modèle correspondant au type de données.",
        "Remplir le fichier sans modifier les en-têtes.",
        "Choisir le fichier et lancer la prévisualisation.",
        "Corriger les erreurs et les doublons signalés.",
        "Appliquer l'import : l'opération est auditée et un rapport est conservé.",
      ]),
      list([
        "Les doublons sont détectés avant l'application.",
        "Les lignes en erreur n'empêchent pas de corriger le fichier puis de recommencer.",
        "L'historique des imports permet de retrouver les rapports.",
      ]),
      note(
        "info",
        "Pour les agents et les équipements, le CSV reste le format de référence. Les lignes mobiles acceptent également le XLSX.",
      ),
    ],
  },
  {
    slug: "demandes-it",
    title: "Demandes IT et tickets",
    summary: "Créer, qualifier, assigner et suivre une demande jusqu'à sa clôture.",
    category: "support",
    tags: ["ticket", "demande", "SLA", "priorité", "Kanban", "commentaire"],
    blocks: [
      p(
        "Les demandes IT sont identifiées par une référence automatique DEM-AAAA-NNNN. Elles suivent un cycle de vie : nouveau, à qualifier, en cours, en attente, résolu, clos.",
      ),
      list([
        "Objet, description, catégorie, priorité et demandeur.",
        "Priorités avec délais de réponse et de résolution ; échéance calculée.",
        "Assignation à un utilisateur et liaison à un ou plusieurs équipements.",
        "Commentaires publics ou internes et temps passé.",
        "Historique des changements de statut, priorité, assignation et catégorie.",
      ]),
      steps([
        "Créer la demande avec un objet explicite et une description actionnable.",
        "Qualifier la priorité et la catégorie.",
        "Prendre en charge, puis assigner si nécessaire.",
        "Ajouter les commentaires et le temps passé.",
        "Marquer résolu, puis clore après confirmation.",
      ]),
      note(
        "info",
        "Le Kanban et les filtres permettent de visualiser les demandes par statut, priorité, assigné ou service.",
      ),
    ],
  },
  {
    slug: "interventions",
    title: "Interventions",
    summary: "Planifier et tracer une intervention technique ou prestataire.",
    category: "support",
    tags: ["intervention", "technicien", "prestataire", "coût", "compte rendu"],
    blocks: [
      p(
        "Une intervention est identifiée par INT-AAAA-NNNN. Elle peut être rattachée à une demande IT ou à un équipement.",
      ),
      list([
        "Type, statut et planification.",
        "Technicien interne ou prestataire.",
        "Coût et durée.",
        "Compte rendu et pièces liées.",
      ]),
      p(
        "Les interventions alimentent les statistiques consolidées et l'activité du tableau de bord.",
      ),
    ],
  },
  {
    slug: "reservations-materiel",
    title: "Réservations de matériel",
    summary: "Réserver un créneau, gérer les conflits, les récurrences, les sorties et retours.",
    category: "support",
    tags: ["réservation", "matériel", "conflit", "ICS", "QR", "sortie", "retour"],
    blocks: [
      p(
        "Le module Réservations gère le matériel partagé : vidéoprojecteurs, sonorisation, écrans, mallettes de micros, enregistreurs et tout matériel ajouté au catalogue.",
      ),
      steps([
        "Choisir le matériel et le créneau.",
        "Renseigner le demandeur, l'e-mail, le motif et les notes.",
        "Vérifier la disponibilité : un conflit bloque la validation.",
        "Valider la réservation.",
        "Le jour venu, enregistrer la sortie puis le retour.",
      ]),
      list([
        "Réservations récurrentes quotidiennes, hebdomadaires ou mensuelles.",
        "Indisponibilités pour maintenance, panne ou prêt externe.",
        "Export ICS pour Outlook ou l'agenda du téléphone.",
        "QR code par matériel pour ouvrir directement la réservation.",
        "Notifications in-app et e-mail à la création, modification, annulation, sortie et retour.",
      ]),
      note(
        "warning",
        "Une réservation retournée libère immédiatement le créneau. Pensez à enregistrer le retour pour permettre la réservation suivante.",
      ),
    ],
  },
  {
    slug: "stock-it",
    title: "Stock IT",
    summary: "Suivre les consommables et accessoires par mouvements et seuils d'alerte.",
    category: "support",
    tags: ["stock", "consommable", "entrée", "sortie", "seuil", "inventaire"],
    blocks: [
      p(
        "Le stock IT concerne les accessoires et consommables : claviers, souris, écrans, casques, câbles, toners, papier, batteries, etc.",
      ),
      list([
        "Fiche article avec référence automatique STK-AAAA-NNNN.",
        "Catégorie, marque, modèle, fournisseur, emplacement et prix unitaire.",
        "Quantité et seuil d'alerte.",
        "Mouvements d'entrée, de sortie et d'ajustement d'inventaire.",
      ]),
      p(
        "La quantité ne se modifie pas directement : elle évolue uniquement par mouvement. Une sortie supérieure au stock disponible est refusée.",
      ),
      note(
        "warning",
        "Un ajustement d'inventaire doit correspondre à un comptage physique. Il est tracé dans l'historique avec l'opérateur.",
      ),
    ],
  },
  {
    slug: "communication",
    title: "Communication, réunions et formations",
    summary: "Informer les utilisateurs, organiser les réunions et suivre les formations.",
    category: "communication",
    tags: ["communication", "réunion", "formation", "points", "responsable", "notification"],
    blocks: [
      p(
        "Le menu Communication regroupe quatre espaces : Communications, Réunions, Formations et Points 1:1.",
      ),
      list([
        "Communications : rédaction, ciblage des destinataires, publication, suivi de lecture et archivage.",
        "Réunions : équipe, service, projet, cellule de crise ou point avec la responsable, avec ordre du jour, compte rendu et décisions.",
        "Formations : organisme, dates, durée, coût, caractère obligatoire et participants.",
        "Points 1:1 : sujets en cours avec la responsable, priorité, échéance, prochaine revue et historique des échanges.",
      ]),
      p(
        "Une communication peut cibler tous les utilisateurs, un service, un rôle ou une sélection nominative. La publication crée une notification interne et, si le canal le prévoit, un e-mail via la configuration SMTP.",
      ),
      note(
        "info",
        "Le suivi de lecture comptabilise les utilisateurs ayant marqué la communication comme lue. Les brouillons ne sont visibles que des profils autorisés à gérer les communications.",
      ),
      note(
        "warning",
        "Les communications sensibles doivent rester dans les canaux maîtrisés par la structure. Vérifiez les destinataires avant publication.",
      ),
    ],
  },
  {
    slug: "fournisseurs-et-licences",
    title: "Fournisseurs et licences",
    summary: "Centraliser les contacts, les contrats fournisseurs et les sièges logiciels.",
    category: "gestion",
    tags: ["fournisseur", "licence", "sièges", "SIRET", "contrat"],
    blocks: [
      p(
        "Les fournisseurs regroupent les coordonnées, le SIRET, les contacts et les éléments rattachés : équipements, licences et contrats.",
      ),
      list([
        "Fiche fournisseur active ou inactive.",
        "Licences avec éditeur, type, sièges disponibles et utilisés, dates et coût annuel.",
        "Contrôle automatique : les sièges utilisés ne peuvent pas dépasser les sièges disponibles.",
      ]),
      note(
        "info",
        "Désactiver un fournisseur conserve les éléments rattachés et l'historique.",
      ),
    ],
  },
  {
    slug: "contrats",
    title: "Contrats et prestataires",
    summary: "Suivre les échéances, préavis, reconductions et montants.",
    category: "gestion",
    tags: ["contrat", "préavis", "échéance", "reconduction", "fournisseur"],
    blocks: [
      p(
        "Les contrats sont rattachés à un fournisseur et portent une référence, un objet, une catégorie, des dates, des montants HT/TTC, un préavis et un responsable interne.",
      ),
      list([
        "Calcul de l'échéance et de la date limite de résiliation.",
        "Niveaux d'alerte : critique à 30 jours, avertissement à 90 jours, vigilance à 180 jours.",
        "Filtre « échéance 90 jours » et lien depuis les alertes du tableau de bord.",
        "Résiliation sans suppression : le contrat passe au statut résilié.",
      ]),
      note(
        "warning",
        "Vérifiez systématiquement le préavis avant la date limite de résiliation. Une reconduction tacite peut prolonger le contrat.",
      ),
    ],
  },
  {
    slug: "budget",
    title: "Budget informatique",
    summary: "Gérer exercices, lignes, engagements, factures et disponible réel.",
    category: "gestion",
    tags: ["budget", "exercice", "engagement", "facture", "TVA", "disponible"],
    blocks: [
      p(
        "Le budget est organisé par exercice annuel, avec des statuts brouillon, voté et clôturé. Les lignes budgétaires sont classées par catégorie.",
      ),
      list([
        "Montants prévus et votés par ligne.",
        "Engagements : devis, commandes, livraisons et facturation.",
        "Factures : numéro, dates, montants, TVA, statut et paiement.",
        "Calcul automatique du budget engagé, facturé, payé et du disponible réel.",
      ]),
      note(
        "warning",
        "Une ligne utilisée par un engagement ou une facture ne peut pas être supprimée. Un budget clôturé n'est plus modifiable.",
      ),
      p(
        "La validation d'un budget en brouillon enregistre le valideur et la date dans l'audit.",
      ),
    ],
  },
  {
    slug: "projets",
    title: "Projets informatiques",
    summary: "Piloter jalons, tâches, risques, décisions et avancement.",
    category: "gestion",
    tags: ["projet", "jalon", "tâche", "risque", "décision", "avancement"],
    blocks: [
      p(
        "Un projet porte un code, des objectifs, un responsable, des dates, un budget prévu, une priorité et un statut.",
      ),
      list([
        "Jalons pondérés avec échéance et statut.",
        "Tâches avec jalon, priorité, assignation, échéance et statut.",
        "Avancement recalculé à partir des tâches terminées.",
        "Registre des risques avec probabilité, impact, score et mitigation.",
        "Registre des décisions avec date, décideur et description.",
      ]),
      note(
        "info",
        "L'annulation d'un projet conserve les données et l'historique.",
      ),
    ],
  },
  {
    slug: "documentation",
    title: "Documentation",
    summary: "Gérer les documents, versions, tags, visibilité et fichiers.",
    category: "gestion",
    tags: ["document", "version", "fichier", "SHA-256", "tag", "visibilité"],
    blocks: [
      p(
        "Le référentiel documentaire centralise les procédures, guides, schémas, comptes rendus et documents fournisseurs.",
      ),
      list([
        "Titre, type, catégorie, description, visibilité, statut et tags.",
        "Versions successives avec numéro, auteur, taille, empreinte SHA-256 et changelog.",
        "Téléversement et téléchargement protégés par permissions.",
        "Archivage sans suppression des fichiers.",
      ]),
      note(
        "info",
        "Les fichiers sont stockés localement dans le répertoire de stockage de l'application. Pensez à les inclure dans la sauvegarde.",
      ),
    ],
  },
  {
    slug: "calendrier",
    title: "Calendrier et actions",
    summary: "Visualiser les événements, les réservations et les actions à réaliser.",
    category: "gestion",
    tags: ["calendrier", "événement", "action", "réservation", "échéance"],
    blocks: [
      p(
        "Le calendrier propose les vues jour, semaine, mois et année. Il regroupe les événements, les réservations de matériel et les actions à réaliser.",
      ),
      list([
        "Création d'un événement avec lieu, responsable, priorité, statut et description.",
        "Création directe d'une réservation de matériel depuis le calendrier.",
        "Types : maintenance, intervention, échéance, renouvellement, audit, projet, réunion, action.",
        "Actions avec module, priorité, échéance, responsable et statut.",
      ]),
      note(
        "info",
        "Le tableau de bord affiche la semaine en cours avec un accès direct au calendrier complet.",
      ),
    ],
  },
  {
    slug: "infrastructure-reseau",
    title: "Infrastructure et réseau",
    summary: "Inventorier serveurs, VM, réseau et dépendances.",
    category: "infrastructure",
    tags: ["infrastructure", "serveur", "VM", "réseau", "dépendance", "IP"],
    blocks: [
      p(
        "L'inventaire infrastructure couvre les serveurs, VM, switches, routeurs, pare-feu, NAS, points d'accès et onduleurs.",
      ),
      list([
        "Rattachement facultatif à un équipement du parc, à un site et à un responsable.",
        "Adresse IP, MAC, système, rôle, criticité, statut et configuration.",
        "Dépendances réseau, alimentation, stockage, authentification ou applicatif.",
      ]),
      p(
        "Les dépendances servent à l'analyse d'impact : avant une maintenance, identifiez les services qui dépendent de l'équipement.",
      ),
      note(
        "warning",
        "L'application n'exécute aucune sonde réseau sans action explicite. Un contrôle de supervision doit être autorisé avant activation.",
      ),
    ],
  },
  {
    slug: "supervision-plans",
    title: "Supervision et plans",
    summary: "Créer des plans, charger une image et positionner les équipements.",
    category: "infrastructure",
    tags: ["supervision", "plan", "bâtiment", "baie", "image", "placement"],
    blocks: [
      p(
        "La page Supervision affiche une carte visuelle des équipements d'infrastructure. Elle accepte plusieurs plans : site, bâtiment, étage, baie/rack ou autre.",
      ),
      steps([
        "Ouvrir Supervision puis « Gérer les plans ».",
        "Créer un plan et choisir son type.",
        "Téléverser une image PNG, JPEG ou WEBP (12 Mo maximum).",
        "Sélectionner le plan dans l'en-tête de la page.",
        "Activer « Placer les équipements » puis glisser-déposer les nœuds.",
      ]),
      list([
        "Les positions sont enregistrées en pourcentage et rattachées au plan.",
        "Le placement automatique en grille replace les équipements non placés.",
        "Un équipement peut être retiré du plan sans supprimer sa fiche.",
        "L'archivage d'un plan conserve les équipements et leurs positions.",
        "Les liens de dépendance sont dessinés entre les équipements placés.",
      ]),
      note(
        "info",
        "Les contrôles ping, SNMP, HTTP, TCP ou agent sont préparés, mais aucune sonde active n'est lancée automatiquement.",
      ),
    ],
  },
  {
    slug: "partages-reseau",
    title: "Partages réseau et alertes de volumétrie",
    summary: "Suivre l'espace libre des lecteurs et partages réseau avec des seuils d'alerte.",
    category: "infrastructure",
    tags: ["partage", "réseau", "UNC", "volumétrie", "espace disque", "alerte"],
    blocks: [
      p(
        "La page Infrastructure → Partages réseau surveille l'espace disponible des lecteurs mappés et des partages UNC accessibles depuis le serveur d'application.",
      ),
      steps([
        "Cliquer sur « Ajouter un partage ».",
        "Renseigner un nom, le chemin UNC (\\\\serveur\\partage) ou la lettre de lecteur.",
        "Choisir le site et le responsable.",
        "Définir le seuil d'alerte, le seuil critique et éventuellement un libre minimum en Go.",
        "Enregistrer puis lancer « Tout vérifier » ou le contrôle d'un partage.",
      ]),
      list([
        "Le pourcentage libre est calculé à partir de l'espace total et de l'espace libre.",
        "Le statut passe en alerte ou critique selon les seuils configurés.",
        "Un partage inaccessible est signalé en erreur avec le message remonté.",
        "Les partages archivés ne sont plus contrôlés mais leur historique est conservé.",
      ]),
      note(
        "warning",
        "Le contrôle est exécuté avec le compte du serveur d'application. Le chemin doit être accessible depuis ce serveur et les droits réseau doivent être accordés au compte de service.",
      ),
      note(
        "info",
        "Les contrôles sont lancés manuellement. Un contrôle peut prendre quelques secondes si le partage réseau est lent ou injoignable.",
      ),
    ],
  },
  {
    slug: "securite-incidents",
    title: "Cybersécurité",
    summary: "Suivre incidents, actions, vulnérabilités, sauvegardes, certificats et audits.",
    category: "infrastructure",
    tags: ["sécurité", "incident", "CVE", "certificat", "sauvegarde", "audit"],
    blocks: [
      p(
        "Le module Cybersécurité centralise les incidents, les actions correctives, les vulnérabilités, les sauvegardes, les certificats et les audits.",
      ),
      list([
        "Incidents INC-AAAA-NNNN avec gravité, catégorie, détection, responsable et retour d'expérience.",
        "Actions correctives ou préventives avec priorité, échéance, responsable et preuve.",
        "Vulnérabilités avec CVE, score CVSS, gravité, équipement et remédiation.",
        "Sauvegardes avec résultat, taille, durée et test de restauration.",
        "Certificats avec validité, émetteur et alerte à 30, 90 et 180 jours.",
      ]),
      note(
        "warning",
        "Un incident se clôture sans suppression. Conservez les mesures prises et le retour d'expérience pour l'audit.",
      ),
    ],
  },
  {
    slug: "rgpd",
    title: "RGPD et rôle DPO",
    summary: "Tenir le registre, suivre les demandes et les droits des personnes.",
    category: "conformite",
    tags: ["RGPD", "DPO", "traitement", "collecte", "droits", "violation"],
    blocks: [
      p(
        "Le module RGPD est accessible au rôle DPO et aux rôles disposant des permissions correspondantes.",
      ),
      list([
        "Registre des traitements : finalité, base légale, données, personnes, destinataires, conservation et mesures.",
        "Registre des collectes : formulaire, enquête, contacts, inscription, événement.",
        "Demandes DPO avec objet, réponse, recommandations et échéance.",
        "Droits des personnes : accès, rectification, effacement, opposition, portabilité, limitation.",
        "Violations de données : gravité, personnes affectées, containment, notification CNIL.",
      ]),
      p(
        "Les exports d'un dossier de droits ou des données personnelles d'un agent sont audités. Les secrets mobiles restent exclus.",
      ),
      note(
        "warning",
        "L'échéance par défaut d'une demande de droits est de 30 jours. Surveillez les indicateurs de la vue d'ensemble.",
      ),
    ],
  },
  {
    slug: "audit-et-tracabilite",
    title: "Journal d'audit",
    summary: "Comprendre la traçabilité et rechercher une opération.",
    category: "conformite",
    tags: ["audit", "traçabilité", "hash", "sécurité", "journal"],
    blocks: [
      p(
        "Le journal d'audit enregistre les créations, modifications, suppressions, connexions et opérations sensibles. Chaque entrée est chaînée par un hash : une altération directe en base casse la chaîne.",
      ),
      list([
        "Filtrer par module, action, utilisateur, entité ou période.",
        "Consulter le détail avant/après d'une modification.",
        "Retrouver l'adresse IP, l'agent utilisateur et l'identifiant de requête.",
      ]),
      note(
        "info",
        "Les suppressions sont généralement des archivages. L'audit conserve l'état avant et après l'opération.",
      ),
    ],
  },
  {
    slug: "utilisateurs-et-roles",
    title: "Utilisateurs, rôles et permissions",
    summary: "Créer un compte, réinitialiser un mot de passe et ajuster les droits.",
    category: "administration",
    tags: ["utilisateur", "rôle", "permission", "mot de passe", "compte"],
    blocks: [
      p(
        "Administration → Utilisateurs permet de créer les comptes, de les désactiver, de réinitialiser un mot de passe et d'ajuster leur rôle ou leur portée de données.",
      ),
      steps([
        "Créer l'utilisateur avec son adresse e-mail professionnelle.",
        "Choisir un rôle et une portée de données.",
        "Communiquer le mot de passe initial par un canal sûr.",
        "Demander à l'utilisateur de le changer à la première connexion.",
      ]),
      p(
        "Administration → Rôles & permissions présente la matrice des permissions. Les rôles système sont protégés ; les permissions individuelles peuvent compléter un rôle.",
      ),
      note(
        "warning",
        "Principe du moindre privilège : n'accordez que les permissions nécessaires. Vérifiez les accès lors d'un départ ou d'un changement de fonction.",
      ),
    ],
  },
  {
    slug: "identite-personnalisation",
    title: "Identité et personnalisation",
    summary: "Changer le nom, la structure, le logo, la couleur et le contact.",
    category: "administration",
    tags: ["identité", "logo", "couleur", "structure", "personnalisation"],
    blocks: [
      p(
        "Administration → Paramètres → Identité de l'application permet de personnaliser l'application sans redémarrage.",
      ),
      list([
        "Nom de l'application et nom de la structure.",
        "Accroche et description de l'écran de connexion.",
        "Adresse de contact affichée aux utilisateurs.",
        "Logo PNG, JPEG ou WEBP (4 Mo maximum).",
        "Couleur principale de l'interface et des exports PDF.",
      ]),
      p(
        "Ces valeurs sont appliquées à l'écran de connexion, à la sidebar, au navigateur, aux e-mails, aux notifications et aux PDF. Chaque modification est auditée.",
      ),
      note(
        "info",
        "Le logo est réencodé en PNG et stocké localement. Sans logo personnalisé, l'emblème générique SI PILOT est utilisé.",
      ),
    ],
  },
  {
    slug: "smtp-notifications",
    title: "SMTP et notifications",
    summary: "Configurer l'envoi d'e-mails, tester et consulter la boîte d'envoi.",
    category: "administration",
    tags: ["SMTP", "e-mail", "notification", "TLS", "boîte d'envoi"],
    blocks: [
      p(
        "Administration → Paramètres → Serveur SMTP permet de configurer un serveur externe pour les notifications et les tests.",
      ),
      steps([
        "Renseigner le serveur, le port et l'identifiant.",
        "Saisir le mot de passe SMTP (chiffré en base).",
        "Choisir STARTTLS ou SSL direct, jamais les deux.",
        "Renseigner l'adresse et le nom d'expédition.",
        "Envoyer un e-mail de test vers une adresse de contrôle.",
        "Activer l'envoi des e-mails.",
      ]),
      p(
        "Les envois sont historisés dans la boîte d'envoi interne avec leur statut et leur erreur éventuelle. Les réservations génèrent des notifications in-app et e-mail.",
      ),
      note(
        "warning",
        "Le mot de passe SMTP est chiffré avec FIELD_ENCRYPTION_KEY. La perte de cette clé rend les secrets illisibles.",
      ),
    ],
  },
  {
    slug: "assistant-ia",
    title: "Assistant IA",
    summary: "Connecter OpenAI, Mistral, Gemini, Anthropic, Ollama ou un endpoint compatible.",
    category: "administration",
    tags: ["IA", "OpenAI", "Mistral", "Gemini", "Anthropic", "Ollama", "assistant"],
    blocks: [
      p(
        "Administration → Assistant IA connecte l'assistant à un fournisseur externe ou local. La configuration est facultative : SI PILOT fonctionne sans IA.",
      ),
      list([
        "Fournisseurs pris en charge : OpenAI, Azure OpenAI, Mistral, Groq, OpenRouter, Google Gemini, Anthropic Claude, Ollama local, Open WebUI et tout endpoint compatible OpenAI.",
        "URL de base, modèle, clé d'API, température, nombre de jetons et délai sont configurables.",
        "La clé d'API est chiffrée en base et n'est jamais renvoyée au navigateur.",
        "Le bouton « Tester la connexion » vérifie le fournisseur et le modèle.",
        "Un contexte agrégé du parc peut être envoyé : compteurs, pannes, renouvellements, mises à jour WAPT, demandes, contrats et alertes.",
      ]),
      p(
        "Usages : bilan du parc, identification des postes à renouveler ou en panne, suivi des mises à jour WAPT, analyse des demandes, anticipation des échéances, rédaction de synthèses et comptes rendus.",
      ),
      note(
        "warning",
        "L'assistant ne modifie aucune donnée. Les actions proposées doivent être réalisées dans l'application par un utilisateur habilité. Pour un usage souverain, privilégiez Ollama ou une instance interne.",
      ),
    ],
  },
  {
    slug: "wapt",
    title: "Connexion WAPT",
    summary: "Configurer la connexion au serveur WAPT et synchroniser le parc.",
    category: "administration",
    tags: ["WAPT", "connexion", "inventaire", "API", "poste"],
    blocks: [
      p(
        "Administration → Connexion WAPT regroupe uniquement les paramètres de connexion au serveur. Les logiciels, installations et mises à jour se consultent dans Support & parc → Logiciels.",
      ),
      list([
        "Configuration de l'URL, des identifiants, du mot de passe chiffré et des chemins API.",
        "Test de connexion et synchronisation de l'inventaire.",
        "Création ou mise à jour des fiches du parc : nom machine, IP, MAC, série, fabricant, modèle, système, dernier utilisateur, groupes et domaine.",
        "Catalogue via `/api/v3/packages` et paquets installés via `/api/v1/host_data?uuid=...&field=installed_packages` sur WAPT 2.4.",
        "Signature des actions : renseignez la clé privée (`C:\\Users\\<compte>\\private\\key.pem`), le certificat (`key.crt`) et le mot de passe de la clé.",
        "L'installation et la désinstallation passent par `/api/v3/trigger_host_action` avec une action `trigger_install_packages` ou `trigger_remove_packages` signée.",
        "Le bouton « Tester la signature » vérifie que la clé correspond au certificat et affiche l'empreinte utilisée.",
      ]),
      note(
        "warning",
        "Une erreur 404 sur l'installation signifie que l'ancien chemin `/api/v1/hosts/{uuid}/install` n'existe pas sur WAPT 2.4. Ce n'est pas un problème de certificat TLS : il faut configurer la clé de signature des actions.",
      ),
    ],
  },
  {
    slug: "ldap-rdm",
    title: "LDAP, Active Directory et RDM",
    summary: "Importer et enrichir les agents et l'infrastructure depuis vos sources.",
    category: "administration",
    tags: ["LDAP", "Active Directory", "RDM", "synchronisation", "import"],
    blocks: [
      p(
        "Administration → Sources de données regroupe les connexions d'enrichissement LDAP/LDAPS et Remote Desktop Manager.",
      ),
      list([
        "LDAP : URL, base de recherche, compte de service, filtre utilisateurs et vérification TLS.",
        "Test de connexion et prévisualisation des utilisateurs avant import.",
        "Création et mise à jour des agents par correspondance e-mail ou identifiant.",
        "RDM : import CSV des serveurs, VM et équipements réseau.",
      ]),
      note(
        "warning",
        "Les identifiants, mots de passe et secrets RDM sont exclus. Le fichier brut n'est pas conservé. Le mot de passe du compte de service est chiffré.",
      ),
    ],
  },
  {
    slug: "annuaire-ad",
    title: "Annuaire Active Directory : utilisateurs et groupes",
    summary: "Créer, modifier des comptes AD et gérer leur appartenance aux groupes.",
    category: "administration",
    tags: ["Active Directory", "LDAP", "utilisateur", "groupe", "annuaire", "LDAPS"],
    blocks: [
      p(
        "L'onglet Administration → Sources de données → Utilisateurs & groupes permet d'agir directement dans Active Directory, en plus de la synchronisation des agents.",
      ),
      list([
        "Recherche des utilisateurs par nom, identifiant ou e-mail.",
        "Création d'un compte dans l'OU configurée.",
        "Modification du prénom, du nom, de l'e-mail, du service, de la fonction et du téléphone.",
        "Activation ou désactivation du compte.",
        "Ajout et retrait de l'utilisateur dans les groupes AD.",
      ]),
      steps([
        "Renseigner l'URL, la base de recherche et le compte de service dans l'onglet Active Directory.",
        "Configurer l'OU de création des utilisateurs et la base des groupes.",
        "Activer « Gestion de l'annuaire » et enregistrer.",
        "Ouvrir l'onglet Utilisateurs & groupes.",
        "Créer ou modifier un utilisateur, puis gérer ses groupes.",
      ]),
      note(
        "warning",
        "La définition ou la réinitialisation d'un mot de passe nécessite une connexion LDAPS. Sans mot de passe, le compte est créé désactivé et doit être activé depuis Active Directory.",
      ),
      note(
        "warning",
        "Le compte de service doit disposer des droits d'écriture sur les OU concernées. Appliquez le moindre privilège et auditez les opérations.",
      ),
      p(
        "Toutes les créations, modifications, activations et changements de groupes sont audités. Les mots de passe ne sont jamais écrits dans le journal d'audit.",
      ),
    ],
  },
  {
    slug: "imports-exports",
    title: "Imports, exports et PDF",
    summary: "Produire un export ciblé, un PDF ou un fichier XLSX de référence.",
    category: "administration",
    tags: ["export", "import", "PDF", "XLSX", "CSV", "sur mesure"],
    blocks: [
      p(
        "Les exports sont disponibles depuis les pages métier, la page Exports et Administration → Import / Export.",
      ),
      list([
        "Parc, lignes mobiles, infrastructure, tickets, statistiques et RGPD en XLSX ou PDF.",
        "Exports sur mesure : choix du jeu de données, des colonnes, des filtres et du format.",
        "Les PDF reprennent le logo, le nom de la structure, le titre, l'en-tête, la pagination et la couleur principale.",
        "Les PIN/PUK et autres secrets sont exclus des exports.",
      ]),
      note(
        "info",
        "Un export peut contenir des données personnelles. Manipulez-le selon les règles RGPD et supprimez les fichiers temporaires.",
      ),
    ],
  },
  {
    slug: "systeme-diagnostic",
    title: "Diagnostic et état du système",
    summary: "Vérifier la base, le stockage, les migrations, les sauvegardes et la sécurité.",
    category: "administration",
    tags: ["diagnostic", "système", "migration", "stockage", "sauvegarde", "sécurité"],
    blocks: [
      p(
        "Administration → Système regroupe le diagnostic, les informations de version et la procédure de mise à jour.",
      ),
      list([
        "État de la base de données, version du schéma et migration attendue.",
        "Disponibilité et espace du répertoire de stockage.",
        "Configuration SMTP, WAPT et LDAP, avec dernière synchronisation.",
        "Dernière sauvegarde détectée.",
        "Contrôles de sécurité : environnement, debug, cookies, MFA et sauvegarde.",
        "Volumétrie : comptes, agents, équipements, tickets et réservations.",
      ]),
      p(
        "Le rapport peut être téléchargé en JSON pour être transmis à un administrateur ou conservé lors d'une intervention.",
      ),
      note(
        "warning",
        "Un statut « à surveiller » n'empêche pas l'application de fonctionner, mais doit être traité. Un statut « erreur » nécessite une action rapide.",
      ),
    ],
  },
  {
    slug: "sauvegarde-restauration",
    title: "Sauvegarde et restauration",
    summary: "Protéger la base et les fichiers, puis savoir restaurer.",
    category: "exploitation",
    tags: ["sauvegarde", "restauration", "dump", "stockage", "backup"],
    blocks: [
      p(
        "Administration → Sauvegarde permet d'exporter et d'importer la configuration et la base sans passer par la ligne de commande. Les scripts Windows restent disponibles dans scripts/windows pour les sauvegardes planifiées.",
      ),
      list([
        "Exporter la configuration en JSON : paramètres, identité, SMTP, WAPT, LDAP et secrets chiffrés.",
        "Exporter la base PostgreSQL au format custom (pg_dump) ou une archive ZIP complète avec les fichiers utilisateurs.",
        "Importer une configuration JSON pour restaurer les paramètres.",
        "Restaurer une base depuis un fichier .dump, .sql ou une archive ZIP, après saisie de la confirmation RESTAURER.",
        "Une sauvegarde de sécurité est créée automatiquement avant toute restauration.",
      ]),
      note(
        "warning",
        "La restauration remplace la base actuelle. La clé FIELD_ENCRYPTION_KEY n'est pas incluse dans les exports : sans elle, les secrets chiffrés restent illisibles après réinstallation.",
      ),
      note(
        "warning",
        "Une sauvegarde non testée n'est pas une sauvegarde fiable. Vérifiez régulièrement la restauration et conservez au moins une copie hors site.",
      ),
      p(
        "La page Système indique la dernière sauvegarde détectée dans .runtime/backups. La procédure détaillée est décrite dans docs/BACKUP_RESTORE.md.",
      ),
    ],
  },
  {
    slug: "installation-initiale",
    title: "Première installation",
    summary: "Préparer le serveur et créer le premier administrateur via l'assistant.",
    category: "exploitation",
    tags: ["installation", "première fois", "administrateur", "assistant", "déploiement"],
    blocks: [
      p(
        "L'installation se déroule en deux temps : préparation technique du serveur, puis assistant web de première configuration.",
      ),
      steps([
        "Installer Python, Node.js et PostgreSQL, ou utiliser le script Windows fourni.",
        "Lancer scripts/windows/setup-windows.ps1 pour préparer l'environnement, la base et les migrations.",
        "Démarrer l'application avec scripts/windows/start-app.ps1.",
        "Ouvrir l'application : l'assistant de première installation s'affiche s'il n'existe aucun administrateur.",
        "Renseigner la structure, le logo, la couleur et le compte administrateur.",
        "Se connecter, puis vérifier la page Système et configurer le SMTP.",
      ]),
      note(
        "success",
        "L'assistant crée le compte administrateur et applique l'identité. Aucun mot de passe par défaut n'est généré.",
      ),
      note(
        "warning",
        "Après l'installation, vérifiez les sauvegardes, les cookies sécurisés derrière HTTPS et les permissions des comptes.",
      ),
    ],
  },
  {
    slug: "mise-a-jour",
    title: "Mise à jour de l'application",
    summary: "Mettre à jour le code, les dépendances, le schéma et le frontend.",
    category: "exploitation",
    tags: ["mise à jour", "migration", "alembic", "build", "version"],
    blocks: [
      p(
        "Une mise à jour doit être planifiée et précédée d'une sauvegarde vérifiée de la base et du stockage.",
      ),
      steps([
        "Sauvegarder la base et le répertoire des fichiers.",
        "Arrêter l'application.",
        "Récupérer la nouvelle version du code.",
        "Mettre à jour les dépendances Python et frontend.",
        "Exécuter les migrations Alembic.",
        "Reconstruire le frontend.",
        "Redémarrer et vérifier la page Système puis les parcours principaux.",
      ]),
      code("cd backend\n.\\.venv\\Scripts\\alembic.exe upgrade head"),
      code("cd frontend\nnpm ci\nnpm run build"),
      note(
        "warning",
        "Ne jamais lancer une migration sans sauvegarde. En cas de doute, testez la mise à jour sur une base de recette.",
      ),
    ],
  },
  {
    slug: "depannage",
    title: "Dépannage courant",
    summary: "Résoudre les problèmes de connexion, d'e-mail, de migration ou de stockage.",
    category: "faq",
    tags: ["dépannage", "erreur", "connexion", "SMTP", "migration", "stockage"],
    blocks: [
      p("Voici les vérifications de base avant de solliciter un administrateur."),
      table(
        ["Symptôme", "Vérifications"],
        [
          [
            "Application inaccessible",
            "Serveur démarré, port 8000 accessible, PostgreSQL démarré, page /health.",
          ],
          [
            "Connexion refusée",
            "Adresse e-mail exacte, compte actif, mot de passe correct, compte non verrouillé.",
          ],
          [
            "E-mails non envoyés",
            "SMTP configuré et activé, test d'envoi, boîte d'envoi interne, TLS/SSL, pare-feu.",
          ],
          [
            "Migration en échec",
            "Sauvegarde disponible, version Alembic actuelle, logs, espace disque.",
          ],
          [
            "Téléversement impossible",
            "Répertoire de stockage accessible en écriture, taille du fichier, format accepté.",
          ],
          [
            "WAPT ou LDAP indisponible",
            "URL, identifiants, certificat TLS, connectivité réseau, test depuis l'administration.",
          ],
        ],
      ),
      note(
        "info",
        "La page Administration → Système fournit un diagnostic et un rapport JSON à transmettre en cas d'incident.",
      ),
    ],
  },
  {
    slug: "questions-frequentes",
    title: "Questions fréquentes",
    summary: "Réponses rapides sur les données, les droits, les exports et la personnalisation.",
    category: "faq",
    tags: ["FAQ", "données", "droits", "exports", "personnalisation", "assistant IA"],
    blocks: [
      p("Cette section répond aux questions les plus courantes."),
      list([
        "Les données sont-elles fictives ? Non. L'application n'injecte aucune donnée de démonstration dans les indicateurs.",
        "Puis-je utiliser SI PILOT sans assistant IA ? Oui. L'assistant IA reste facultatif et désactivé par défaut.",
        "Puis-je changer le logo et le nom ? Oui, dans Administration → Paramètres → Identité de l'application.",
        "Qui peut voir les PIN/PUK ? Uniquement les utilisateurs disposant des permissions dédiées. Les secrets ne figurent jamais dans les exports.",
        "Les suppressions sont-elles définitives ? La plupart des objets sont archivés ou clôturés. Les suppressions réelles sont auditées.",
        "Comment obtenir de l'aide ? Utiliser ce centre d'aide, la page Système, puis contacter l'administrateur ou le support indiqué sur l'écran de connexion.",
      ]),
      note(
        "warning",
        "Ne jamais transmettre un mot de passe, un PIN/PUK ou une clé de chiffrement dans un ticket ou un e-mail.",
      ),
    ],
  },
  {
    slug: "bonnes-pratiques",
    title: "Bonnes pratiques",
    summary: "Adopter les réflexes qui protègent les données et facilitent l'exploitation.",
    category: "faq",
    tags: ["bonnes pratiques", "sécurité", "sauvegarde", "qualité", "permissions"],
    blocks: [
      list([
        "Créer un compte nominatif par utilisateur, jamais de compte partagé.",
        "Appliquer le moindre privilège et revoir les accès après un départ.",
        "Utiliser des mots de passe longs et uniques, stockés dans un gestionnaire.",
        "Sauvegarder la base et le stockage, puis tester la restauration.",
        "Renseigner les dates d'achat, de garantie et de fin de vie des équipements.",
        "Conserver les références et les motifs dans les tickets et interventions.",
        "Vérifier les échéances contrats, certificats, garanties et engagements mobiles.",
        "Exporter les données personnelles uniquement lorsque c'est nécessaire et les supprimer ensuite.",
        "Consulter régulièrement la page Système et le journal d'audit.",
      ]),
      note(
        "success",
        "La qualité des indicateurs dépend directement de la qualité et de la fraîcheur des données saisies.",
      ),
    ],
  },
];

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((article) => article.slug === slug);
}

export function helpCategoryLabel(key: string): string {
  return HELP_CATEGORIES.find((category) => category.key === key)?.label ?? key;
}

export function searchHelp(query: string): HelpArticle[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return HELP_ARTICLES;
  return HELP_ARTICLES.filter((article) => {
    const text = [
      article.title,
      article.summary,
      article.tags.join(" "),
      ...article.blocks.map((block) => {
        if (block.type === "paragraph" || block.type === "note") return block.text;
        if (block.type === "list" || block.type === "steps") return block.items.join(" ");
        if (block.type === "table") return [...block.headers, ...block.rows.flat()].join(" ");
        return block.content;
      }),
    ]
      .join(" ")
      .toLowerCase();
    return text.includes(normalized);
  });
}
