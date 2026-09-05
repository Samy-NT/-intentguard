# Aurel — Architecture Technique

*Document de référence commun, dernière mise à jour : 3 septembre 2026*
*Contributeurs : Samy, Adam*

---

## Vue d'ensemble

Aurel (anciennement IntentGuard) est un **intent firewall pour les paiements agentiques**. Il intercepte les décisions de paiement prises par des agents IA avant leur exécution, les analyse à travers trois couches successives, puis autorise, bloque ou flag la transaction, avec une trace d'audit signée cryptographiquement à chaque étape.

**Problème résolu :** les agents IA autonomes qui déclenchent des paiements (achats, transferts, souscriptions) le font aujourd'hui sans garde-fou fiable. Aurel s'insère entre la décision de l'agent et l'exécution réelle du paiement pour vérifier l'intention.

---

## Vision produit / Roadmap

Aurel se construit en 3 phases, du plus simple au plus ambitieux :

### Phase 1 — MVP : API simple (en cours, socle fonctionnel)
Une API légère qui filtre les décisions de paiement des agents via les 3 layers actuels (règles déterministes → comportemental/velocity → sémantique). Le repo contient déjà le socle exploitable : endpoint versionné, dashboard, clés API par workspace/rôle, politiques configurables, webhooks durables, exports d'audit, rétention et tests automatisés.

### Phase 2 — Le "Mandate" (vérification avancée, inspiré de Google AP2)
Introduction d'un objet **"mandate"** : une preuve vérifiable que le prompt donné à l'agent correspond bien à l'achat qu'il s'apprête à effectuer. Concrètement, ça permet de répondre à la question *"cet agent a-t-il vraiment reçu l'instruction de faire cet achat précis, ou dévie-t-il de sa mission ?"*.
- Référence : le modèle **AP2 (Agent Payments Protocol)** de Google va dans ce sens
- Format initial implémenté : payload JSON canonique signé en HMAC-SHA256 (`mandate-v1-hmac-sha256`) avec `mandate_id`, `workspace_id`, `issued_at`, `expires_at`, `mission_scope`, contraintes optionnelles d'agent, montant, devise, recipients, merchants et catégories.
- Génération : `POST /api/v1/mandates` avec clé `operator` ou `admin`.
- Vérification à l'exécution : `POST /api/v1/verify` accepte `mandate`, vérifie signature, expiration, contraintes et présence active/non révoquée dans la table `mandates`.

### Phase 3 — Marque de confiance : "Aurel Certified"
Une fois le mandate fiabilisé, transformer Aurel en label de confiance pour l'écosystème des paiements agentiques, un badge **"Aurel Certified"** que les plateformes/agents peuvent afficher pour prouver qu'ils opèrent sous vérification Aurel.
- *(à compléter : critères de certification, processus d'audit, positionnement marketing/business)*

---

## Architecture des 3 layers (état actuel — Phase 1)

### Layer 1 — Règles déterministes (sub-ms)
- Vérifications instantanées basées sur des règles fixes (montants max, whitelist/blacklist, limites de fréquence, etc.)
- Objectif : filtrer très vite les cas évidents sans consommer de ressources IA
- Latence cible : < 1ms

### Layer 2 — Analyse comportementale
- Détection d'anomalies dans le pattern de comportement de l'agent (fréquence inhabituelle, montants atypiques, séquences suspectes)
- Contrôle déterministe pré-LLM (`preScreenContext`) sur autorité, urgence, confidentialité,
  provenance et dérive de mission, puis vélocité persistée dans `verify_logs`.
- Les signaux sont bornés à 0–60 avant l'appel sémantique. Le mode production est fail-closed par défaut
  (`AUREL_VELOCITY_FAIL_MODE=closed` implicite); l'ouverture explicite est réservée aux pilotes avec
  `AUREL_VELOCITY_FAIL_MODE=open`.

### Layer 3 — Analyse sémantique (Claude)
- Analyse fine de l'intention via l'API Claude
- Couvre **7 vecteurs d'attaque** identifiés
- Sept vecteurs : `direct_injection`, `social_engineering`, `urgency_manipulation`,
  `authority_spoofing`, `mission_drift`, `suspicious_provenance`, `confidentiality_request`.
- Claude Sonnet est appelé avec sortie structurée via outil; score 0–100, explication bornée,
  vecteurs fusionnés avec le pré-screening et mode de panne configurable (`allow`, `flag`, `block`).

---

## API & SDK

- SDK publié 
- Adapters disponibles : OpenClaw, Hermes, Claude Code, MCP, Codex, CrewAI, LangGraph et OpenAI Agents.
- Endpoints principaux : `POST /api/v1/verify` (paiement), `POST /api/v1/actions/evaluate` (outil),
  `POST /api/v1/actions/telemetry` (post-exécution), `GET /api/v1/workspace/*` (opérations).
  Les clients serveur utilisent `x-api-key`; le dashboard utilise Supabase Auth + session httpOnly + CSRF.

---

## Base de données (Supabase)

- `workspaces` : configuration workspace, policy JSONB, endpoints webhook/SIEM, fail mode sémantique
- `api_keys` : clés scoppées workspace, rôles `admin` / `operator` / `viewer`, révocation et suivi `last_used_at`
- `workspace_members` : liaison Supabase Auth user → workspace + rôle dashboard, révocable sans dépendre de `user_metadata`
- `rules` : règles déterministes managées par workspace
- `verify_logs` : audit trail, source velocity, review queue, signature HMAC des décisions
- `verification_usage_reservations` / `verification_usage_counters` : réservations atomiques d'entitlements par workspace/période et intent idempotent
- `action_audit_logs` : décisions de preflight génériques signées, idempotentes par workspace/action et liées à un hash du payload
- `action_telemetry_events` : événements post-exécution bornés et redactés, dédupliqués par hash et consultables par action
- `mandates` : mandats signés, révocables, scoppés workspace pour autoriser des paiements agentiques contraints
- `webhook_jobs` / `webhook_deliveries` : file durable et historique de livraison

## Auth & Billing

- Authentification API par `x-api-key`, hash côté serveur, rôles par clé
- UI login par Supabase Auth magic link ou clé API workspace. Après validation, le dashboard utilise une session signée en cookie httpOnly (`aurel_dashboard_session`) avec revérification de la clé backing ou de la membership Supabase active à chaque requête.
- Les mutations authentifiées par cookie exigent le header `x-aurel-csrf`, lié au token signé renvoyé par `/api/auth/login` ou `/api/auth/supabase/session`.
- Les SDK et intégrations continuent d'utiliser `x-api-key`; Supabase Auth sert uniquement aux opérateurs humains du dashboard.
- Le signup public reste contrôlé par provisioning de membership workspace; `/dashboard/members` et `GET` / `POST` / `DELETE /api/v1/workspace/members` permettent aux admins de lister, inviter/lier et désactiver les opérateurs dashboard sans autorisation via `user_metadata`.
- Billing manuel par défaut, avec checkout Stripe optionnel, portail client à session courte, webhook signé idempotent et réconciliation admin (`/api/billing/*`)
- Entitlements dans `policy` : `workspace_status`, `billing_plan`, `monthly_verification_limit`, `limit_period_start`; les événements provider et snapshots de réconciliation sont dédupliqués dans `billing_events`
- `/api/v1/verify` bloque les workspaces suspendus et réserve atomiquement les nouveaux checks hors quota avant les règles et l'analyse sémantique

Stripe est le premier provider implémenté; l'abstraction garde le domaine indépendant du provider.

---

## CI/CD

- **Pipeline :** GitHub Actions
- **Gates :** type-check, lint, test suite, intégrations agent, build Next.js, smoke prod-readiness, packaging des intégrations
- **Tests automatisés :** 51 fichiers / 380 tests
- **Smoke prod-readiness :** démarre `npm run start`, attend `/api/health`, puis vérifie `/api/v1/readiness`, `/auth/login`, la redirection dashboard sans session et le `401` attendu sur `/api/v1/mandates`
- **Déclencheurs :** push sur `main` et pull requests

---

## Audit Trail

- Chaque décision de paiement génère une entrée persistée dans `verify_logs`
- Les nouvelles entrées portent une signature HMAC-SHA256 canonique (`audit-v1-hmac-sha256`) sur les champs critiques du verdict
- Secret recommandé : `AUDIT_SIGNING_SECRET` ; fallback actuel : `INTENTGUARD_SECRET`, puis `SUPABASE_SERVICE_ROLE_KEY`
- Objectif : traçabilité et non-répudiation (utile pour la conformité et la confiance des partenaires fintech)
- Les exports JSON/CSV incluent `audit_signature` et `audit_signature_version`
- Vérification disponible via `POST /api/v1/audit/verify` pour les exports et `GET /api/v1/workspace/audit-verify` pour les logs stockés
- Backfill disponible via cron quotidien et `/api/cron/audit-backfill`
- Rotation disponible via `AUDIT_SIGNING_PREVIOUS_SECRETS` et `MANDATE_SIGNING_PREVIOUS_SECRETS`, qui gardent les anciennes signatures vérifiables pendant que les nouvelles signatures utilisent la clé active.

---

## Décisions en cours / points à trancher

- [x] Résoudre les conflits de merge
- [ ] Appliquer les migrations Supabase `001`–`013`, `20260901102012_signed_mandates.sql`, puis `20260903112359_workspace_members.sql` sur le projet cible
- [ ] Documenter précisément les 7 vecteurs d'attaque du Layer 3
- [x] Ajouter un endpoint de vérification externe des signatures d'audit
- [x] Ajouter une action UI de vérification d'un log signé
- [x] Backfiller les signatures sur les logs historiques
- [ ] Étudier en détail le protocole AP2 de Google pour cadrer le design long terme du "mandate"
- [x] Définir le format et le mécanisme de signature initial du mandate (Phase 2)
- [x] Durcir les téléchargements d'artefacts plugin par allowlist, chemin canonique sous `outputs` et tests anti-traversal
- [ ] Définir les critères de certification "Aurel Certified" (Phase 3)
- [ ] *(ajouter au fur et à mesure)*

---

## Historique des changements

| Date | Changement | Auteur |
|---|---|---|
| 07/07/2026 | Création du document | Samy |
| 07/07/2026 | Ajout de la roadmap produit | Samy |
