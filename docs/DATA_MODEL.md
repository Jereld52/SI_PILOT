# Modèle de données

86 tables métier, réparties par domaine. Schéma géré par Alembic.

## Conventions

- Clés primaires UUID (`sqlalchemy.Uuid`) sauf `audit_logs` (`BIGINT`).
- `created_at`, `updated_at` en `TIMESTAMPTZ` UTC.
- Montants `NUMERIC(12,2)`, devise EUR.
- États fixes en `VARCHAR` + `CHECK`; référentiels en tables dédiées.
- Clés étrangères `RESTRICT` par défaut, `SET NULL` pour les liens facultatifs.
- Suppression logique ou anonymisation pour les données sensibles.
- `document_sequences` pour les références métier (`TCK-2026-000001`, etc.) et les numéros
  d'inventaire (`asset:{categorie}`, remise à zéro annuelle ou séquence globale).

## Domaines

### Socle et sécurité

`users`, `roles`, `permissions`, `role_permissions`, `user_permission_overrides`,
`auth_sessions`, `password_reset_tokens`, `audit_logs`, `notifications`, `settings`,
`user_preferences`, `attachments`, `comments`, `document_sequences`.

### Organisation

`services`, `locations`, `agents`, `agent_accounts`, `checklist_templates`,
`checklist_template_items`, `checklist_runs`, `checklist_run_items`.

### Parc informatique

`asset_categories` (dont `tag_prefix`, `tag_template`, `tag_sequence_mode`), `suppliers`,
`supplier_contacts`, `assets` (dont `external_id` pour les imports WAPT), `asset_assignments`,
`stock_movements`, `licenses`, `renewal_plans`.

### Téléphonie mobile

`mobile_lines` : ligne, titulaire, fonction, statut, forfait, terminal, IMEI, dates,
engagements, contrat, CF, format SIM et identifiants métier. Les PIN, PUK, EID, CSIM et QR
de carte SIM ne sont pas stockés.

### Demandes et interventions

`ticket_categories`, `ticket_statuses`, `ticket_priorities`, `tickets`, `ticket_assets`,
`ticket_comments`, `ticket_history`, `ticket_time_entries`, `interventions`,
`intervention_assets`.

### Infrastructure

`infra_equipments`, `infra_dependencies`, `monitoring_checks`, `monitoring_results`.

### Cybersécurité

`security_incidents`, `security_incident_assets`, `security_incident_agents`,
`security_actions`, `vulnerabilities`, `backup_checks`, `certificates`, `security_audits`.

### Contrats et budget

`contract_categories`, `contracts`, `budgets`, `budget_categories`, `budget_lines`,
`budget_commitments`, `budget_invoices`, `budget_commitment_assets`.

### Projets

`projects`, `project_members`, `project_milestones`, `project_tasks`, `project_risks`,
`project_decisions`.

### RGPD

`processing_activities`, `data_collections`, `dpo_requests`, `rights_requests`, `data_breaches`.

### Documentation

`document_categories`, `documents`, `document_versions`, `tags`, `document_tags`,
`document_acl`.

### Calendrier et actions

`calendar_events`, `actions`.

### Automatisations, SylvIA, imports

`automation_rules`, `automation_runs`, `email_outbox`, `sylvia_runs`, `sylvia_proposals`,
`import_jobs`, `import_rows`.

## Relations structurantes

```text
Agent 1 ── N AssetAssignment N ── 1 Asset
Agent 1 ── N Ticket N ── 1 TicketStatus / Priority / Category
Ticket 1 ── N TicketComment / TicketHistory / TicketTimeEntry
Ticket 1 ── N Intervention N ── 1 Supplier
Asset 1 ── N License / RenewalPlan / Document
Contract 1 ── N BudgetCommitment / BudgetInvoice
BudgetLine 1 ── N BudgetCommitment 1 ── N BudgetInvoice
Project 1 ── N Milestone / Task / Risk / Decision
ProcessingActivity 1 ── N DataCollection / RightsRequest
Document 1 ── N DocumentVersion
Document 1 ── N DocumentAcl
```

## Règles de calcul

- **Budget engagé** : engagements `ordered`/`delivered` non facturés.
- **Budget consommé** : factures `validated`/`paid`.
- **Disponible** : voté − engagé − réalisé.
- **Tickets ouverts** : statuts nouveau, à qualifier, en cours, en attente utilisateur/prestataire.
- **Contrats à échéance** : contrats actifs dont la fin est dans les 90 jours.
- **Score de renouvellement** : âge 35 %, garantie 15 %, état 20 %, incidents 20 %,
  criticité 10 % (seuil configurable).
