# Aurel — Architecture Technique

*Document de référence commun, dernière mise à jour : 7 juillet 2026*
*Contributeurs : Samy, Adam*

---

## Vue d'ensemble

Aurel (anciennement IntentGuard) est un **intent firewall pour les paiements agentiques**. Il intercepte les décisions de paiement prises par des agents IA avant leur exécution, les analyse à travers trois couches successives, puis autorise, bloque ou flag la transaction, avec une trace d'audit signée cryptographiquement à chaque étape.

**Problème résolu :** les agents IA autonomes qui déclenchent des paiements (achats, transferts, souscriptions) le font aujourd'hui sans garde-fou fiable. Aurel s'insère entre la décision de l'agent et l'exécution réelle du paiement pour vérifier l'intention.

---

## Vision produit / Roadmap

Aurel se construit en 3 phases, du plus simple au plus ambitieux :

### Phase 1 — MVP : API simple (en cours, déjà démarré sur le repo)
Une API légère qui filtre les décisions de paiement des agents via les 3 layers actuels (règles déterministes → comportemental → sémantique). Objectif : avoir un produit fonctionnel rapidement pour valider le concept avec les premiers partenaires.

### Phase 2 — Le "Mandate" (vérification avancée, inspiré de Google AP2)
Introduction d'un objet **"mandate"** : une preuve vérifiable que le prompt donné à l'agent correspond bien à l'achat qu'il s'apprête à effectuer. Concrètement, ça permet de répondre à la question *"cet agent a-t-il vraiment reçu l'instruction de faire cet achat précis, ou dévie-t-il de sa mission ?"*.
- Référence : le modèle **AP2 (Agent Payments Protocol)** de Google va dans ce sens
- *(à compléter : format du mandate, comment il est généré, signé, vérifié à l'exécution)*

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
- *(à compléter : modèle utilisé, seuils, données d'entraînement)*

### Layer 3 — Analyse sémantique (Claude)
- Analyse fine de l'intention via l'API Claude
- Couvre **7 vecteurs d'attaque** identifiés
- *(à compléter par Samy/Adam : liste précise des 7 vecteurs, prompts utilisés, format de sortie)*

---

## API & SDK

- SDK publié 
- Adapters disponibles : **LangChain**, **CrewAI**
- *(à compléter : liste des endpoints, format des requêtes/réponses, authentification)*

---

## Base de données (Supabase)

--- à compléter

## Auth & Billing (PR #2 —)

- Authentification centralisée
- Infrastructure de billing
- **Statut :** conflits de merge non résolus sur PR #2 — à traiter en priorité avant tout déploiement

*(Adam : peux-tu détailler ici le système d'auth choisi — JWT / sessions / OAuth — et le provider de billing utilisé ?)*

---

## CI/CD

- **Pipeline :** GitHub Actions
- **Tests automatisés :** 65 tests
- *(à compléter : couverture par layer, tests d'intégration vs unitaires, déclencheurs du pipeline)*

---

## Audit Trail

- Chaque décision de paiement génère une entrée signée cryptographiquement
- Objectif : traçabilité et non-répudiation (utile pour la conformité et la confiance des partenaires fintech)
- *(à compléter : algorithme de signature, format de stockage, durée de rétention)*

---

## Décisions en cours / points à trancher

- [ ] Résoudre les conflits de merge
- [ ] Appliquer les migrations Supabase 004–007
- [ ] Documenter précisément les 7 vecteurs d'attaque du Layer 3
- [ ] Étudier en détail le protocole AP2 de Google pour cadrer le design du "mandate"
- [ ] Définir le format et le mécanisme de signature du mandate (Phase 2)
- [ ] Définir les critères de certification "Aurel Certified" (Phase 3)
- [ ] *(ajouter au fur et à mesure)*

---

## Historique des changements

| Date | Changement | Auteur |
|---|---|---|
| 07/07/2026 | Création du document | Samy |
| 07/07/2026 | Ajout de la roadmap produit | Samy |
