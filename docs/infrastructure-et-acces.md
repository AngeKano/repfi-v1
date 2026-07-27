# Infrastructure & Accès — REPFI / ClickInsight

> Inventaire des applications, services et accès du projet.
>
> 🔒 **SÉCURITÉ — À LIRE** : ne **jamais** committer ce fichier avec les vrais secrets (clés API, mots de passe). Un secret poussé dans Git reste dans l'historique **même après suppression**. Deux options :
> 1. Garder ce fichier comme **modèle** (placeholders `‹ … ›`) et stocker les vraies valeurs dans un **gestionnaire de mots de passe** (1Password, Bitwarden…) + les variables d'environnement **Coolify**.
> 2. Si tu remplis les vraies valeurs ici, **exclure ce fichier de Git** (voir §5).
>
> Dernière mise à jour : ‹ date ›

---

## 1. Applications & services

| Service | Rôle | Console / URL | Où sont les accès |
|---|---|---|---|
| **Coolify** | Déploiement (PaaS auto-hébergé), variables d'env, redeploy | ‹ https://coolify.‹domaine› › | Login Coolify + variables d'env du projet |
| **Hostinger** | Hébergement + **DNS** (domaines) | https://hpanel.hostinger.com | Compte Hostinger |
| **GitHub** | Dépôt de code (branches `main` / `preprod` / `develop`) | ‹ https://github.com/‹org›/‹repo› › | Compte GitHub / token |
| **Resend** | Envoi d'emails (formulaire démo /presentation) | https://resend.com | `RESEND_API_KEY` |
| **PostgreSQL** | Base applicative (utilisateurs, clients, périodes) via Prisma | ‹ hôte:port › | `DATABASE_URL` |
| **ClickHouse** | Données comptables (`grand_livre`) pour le reporting | ‹ http://hôte:8123 › | `CLICKHOUSE_HOST/USER/PASSWORD` |
| **AWS S3** | Stockage de fichiers (uploads comptables/normaux) | https://console.aws.amazon.com/s3 | Clés IAM `AWS_ACCESS_KEY_ID/SECRET` |
| **Apache Airflow** | Orchestration des pipelines (alimentation ClickHouse) | `AIRFLOW_API_URL` | `AIRFLOW_USERNAME/PASSWORD` |
| **NextAuth** | Authentification de l'app | (intégré à l'app) | `NEXTAUTH_SECRET` |

---

## 2. Variables d'environnement (configurées dans Coolify)

> Valeurs à renseigner dans **Coolify → Environment Variables** (pas ici). Ne mettre **aucun guillemet** autour des valeurs.

| Variable | Service | Valeur | Notes |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL | `‹ à compléter ›` | Chaîne de connexion Prisma |
| `CLICKHOUSE_HOST` | ClickHouse | `‹ http://hôte:8123 ›` | |
| `CLICKHOUSE_USER` | ClickHouse | `‹ à compléter ›` | |
| `CLICKHOUSE_PASSWORD` | ClickHouse | `‹ à compléter ›` | |
| `NEXTAUTH_SECRET` | NextAuth | `‹ à compléter ›` | Secret de signature des sessions |
| `NEXTAUTH_URL` | NextAuth | `‹ https://‹domaine-app› ›` | URL publique de l'app (recommandé) |
| `RESEND_API_KEY` | Resend | `‹ re_… ›` | Clé complète (attention à ne pas la tronquer) |
| `DEMO_EMAIL_FROM` | Resend | `ClickInsight <noreply@clickinsight.org>` | Domaine **vérifié** requis dans Resend |
| `DEMO_EMAIL_TO` | Resend | `contact@clickinsight.org` | Destinataire des demandes de démo |
| `AWS_ACCESS_KEY_ID` | AWS S3 | `‹ à compléter ›` | |
| `AWS_SECRET_ACCESS_KEY` | AWS S3 | `‹ à compléter ›` | |
| `AWS_REGION` | AWS S3 | `‹ ex: eu-west-1 ›` | |
| `AWS_S3_BUCKET` | AWS S3 | `‹ à compléter ›` | |
| `AWS_S3_BUCKET_NAME` | AWS S3 | `‹ à compléter ›` | (variante utilisée dans le code) |
| `AIRFLOW_API_URL` | Airflow | `‹ à compléter ›` | |
| `AIRFLOW_USERNAME` | Airflow | `‹ à compléter ›` | |
| `AIRFLOW_PASSWORD` | Airflow | `‹ à compléter ›` | |
| `NODE_ENV` | App | `production` | (géré par le Dockerfile) |

---

## 3. Comptes & consoles d'administration

> Login / mot de passe à conserver dans le **gestionnaire de mots de passe**, pas ici.

| Plateforme | URL | Identifiant | Mot de passe |
|---|---|---|---|
| Coolify | ‹ url › | `‹ à compléter ›` | ‹ coffre-fort › |
| Hostinger | https://hpanel.hostinger.com | `‹ à compléter ›` | ‹ coffre-fort › |
| Resend | https://resend.com | `angedesire.kano@envolperformances.onmicrosoft.com` | ‹ coffre-fort › |
| AWS (IAM) | https://console.aws.amazon.com | `‹ à compléter ›` | ‹ coffre-fort › |
| GitHub | https://github.com | `‹ à compléter ›` | ‹ coffre-fort / PAT › |
| Airflow | ‹ AIRFLOW_API_URL › | `‹ AIRFLOW_USERNAME ›` | ‹ coffre-fort › |

---

## 4. Domaines & DNS (Hostinger)

| Domaine | Usage | Statut |
|---|---|---|
| `envolperformance.com` | Domaine vérifié Resend (historique) | Vérifié |
| `clickinsight.org` | Domaine cible (emails `noreply@` / `contact@`) | ⚠️ à **vérifier dans Resend** (DKIM + SPF `send`) avant envoi |
| `repfi.‹…›` / sous-domaine app | Application déployée | ‹ à compléter › |

Enregistrements Resend à ajouter chez Hostinger pour `clickinsight.org` :
- **DKIM** : `TXT resend._domainkey`
- **SPF (Enable Sending)** : `MX send → feedback-smtp.eu-west-1.amazonses.com` (prio 10) **et** `TXT send → v=spf1 include:amazonses.com ~all`

---

## 5. Ne pas versionner les secrets

Si tu remplis les vraies valeurs dans ce fichier, ajoute-le à `.gitignore` :

```
# Secrets — ne pas committer
docs/infrastructure-et-acces.md
```

Puis, s'il a déjà été committé une fois avec des secrets, considère la **rotation** des clés concernées (les régénérer), car l'historique Git les conserve.
