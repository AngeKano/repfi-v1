# 📘 PostgreSQL - Documentation Complète

Guide de référence rapide pour PostgreSQL avec Docker.

---

## 📌 Table des matières

* [Connexion](https://claude.ai/chat/afea5c9c-9f3c-4f24-8c14-1718a16066da#-connexion)
* [Navigation](https://claude.ai/chat/afea5c9c-9f3c-4f24-8c14-1718a16066da#-navigation)
* [Gestion des bases de données](https://claude.ai/chat/afea5c9c-9f3c-4f24-8c14-1718a16066da#-gestion-des-bases-de-donn%C3%A9es)
* [Gestion des tables](https://claude.ai/chat/afea5c9c-9f3c-4f24-8c14-1718a16066da#-gestion-des-tables)
* [Vider les données](https://claude.ai/chat/afea5c9c-9f3c-4f24-8c14-1718a16066da#-vider-les-donn%C3%A9es)
* [Requêtes CRUD](https://claude.ai/chat/afea5c9c-9f3c-4f24-8c14-1718a16066da#-requ%C3%AAtes-crud)
* [Backup et Restore](https://claude.ai/chat/afea5c9c-9f3c-4f24-8c14-1718a16066da#-backup-et-restore)
* [Permissions et utilisateurs](https://claude.ai/chat/afea5c9c-9f3c-4f24-8c14-1718a16066da#-permissions-et-utilisateurs)
* [Informations système](https://claude.ai/chat/afea5c9c-9f3c-4f24-8c14-1718a16066da#-informations-syst%C3%A8me)
* [Astuces Docker](https://claude.ai/chat/afea5c9c-9f3c-4f24-8c14-1718a16066da#-astuces-docker)

---

## 🔌 Connexion

### Via Docker

```bash
# Connexion basique
docker exec -it <container_name> psql -U <username>

# Connexion à une base spécifique
docker exec -it <container_name> psql -U <username> -d <database>

# Exemple concret
docker exec -it bo88ss8s48c00w888g4sosg4 psql -U postgres
```

### Connexion directe

```bash
psql -h <host> -p <port> -U <username> -d <database>

# Exemple
psql -h localhost -p 5432 -U postgres -d mydb
```

### Variables d'environnement

```bash
export PGHOST=localhost
export PGPORT=5432
export PGUSER=postgres
export PGPASSWORD=secret
export PGDATABASE=mydb

psql  # Se connecte automatiquement
```

---

## 🧭 Navigation

| Commande          | Description                                   |
| ----------------- | --------------------------------------------- |
| `\l`            | Lister toutes les bases de données           |
| `\l+`           | Lister les bases avec détails (taille)       |
| `\c <database>` | Se connecter à une base                      |
| `\dt`           | Lister les tables du schéma courant          |
| `\dt+`          | Lister les tables avec taille                 |
| `\dt *.*`       | Lister toutes les tables de tous les schémas |
| `\d <table>`    | Décrire la structure d'une table             |
| `\d+ <table>`   | Description détaillée d'une table           |
| `\dn`           | Lister les schémas                           |
| `\du`           | Lister les utilisateurs/rôles                |
| `\df`           | Lister les fonctions                          |
| `\di`           | Lister les index                              |
| `\dv`           | Lister les vues                               |
| `\ds`           | Lister les séquences                         |
| `\q`            | Quitter psql                                  |
| `\?`            | Aide sur les commandes psql                   |
| `\h <command>`  | Aide sur une commande SQL                     |

---

## 🗄️ Gestion des bases de données

### Créer une base

```sql
CREATE DATABASE nom_db;

-- Avec options
CREATE DATABASE nom_db
    WITH OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.utf8'
    LC_CTYPE = 'en_US.utf8'
    TEMPLATE = template0;
```

### Supprimer une base

```sql
DROP DATABASE nom_db;
DROP DATABASE IF EXISTS nom_db;
```

### Renommer une base

```sql
ALTER DATABASE nom_db RENAME TO nouveau_nom;
```

### Changer le propriétaire

```sql
ALTER DATABASE nom_db OWNER TO nouveau_owner;
```

---

## 📋 Gestion des tables

### Créer une table

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    age INTEGER CHECK (age >= 0),
    salary DECIMAL(10, 2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Avec clé étrangère
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    total DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Supprimer une table

```sql
DROP TABLE users;
DROP TABLE IF EXISTS users;
DROP TABLE users CASCADE;  -- Supprime aussi les dépendances
```

### Modifier une table

```sql
-- Renommer
ALTER TABLE users RENAME TO clients;

-- Ajouter une colonne
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- Supprimer une colonne
ALTER TABLE users DROP COLUMN phone;

-- Renommer une colonne
ALTER TABLE users RENAME COLUMN name TO full_name;

-- Modifier le type
ALTER TABLE users ALTER COLUMN name TYPE TEXT;

-- Ajouter une contrainte NOT NULL
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- Supprimer NOT NULL
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Ajouter une valeur par défaut
ALTER TABLE users ALTER COLUMN is_active SET DEFAULT true;

-- Ajouter une contrainte unique
ALTER TABLE users ADD CONSTRAINT unique_email UNIQUE (email);

-- Ajouter une clé étrangère
ALTER TABLE orders ADD CONSTRAINT fk_user 
    FOREIGN KEY (user_id) REFERENCES users(id);
```

---

## 🧹 Vider les données

### TRUNCATE (rapide)

```sql
-- Vider une table
TRUNCATE users;

-- Reset les séquences auto-increment
TRUNCATE users RESTART IDENTITY;

-- Ignorer les contraintes de clé étrangère
TRUNCATE users CASCADE;

-- Vider plusieurs tables d'un coup
TRUNCATE table1, table2, table3 CASCADE;

-- Exemple complet
TRUNCATE client_assignments, clients, companies, comptable_file_history, comptable_files, comptable_periods, file_type_patterns, folders, normal_file_history, normal_files, social_networks, users CASCADE;
```

### DELETE (plus lent, avec conditions)

```sql
-- Tout supprimer
DELETE FROM users;

-- Avec condition
DELETE FROM users WHERE created_at < '2024-01-01';
DELETE FROM users WHERE id > 100;
DELETE FROM users WHERE is_active = false;
```

### Différence TRUNCATE vs DELETE

| Aspect         | TRUNCATE         | DELETE       |
| -------------- | ---------------- | ------------ |
| Vitesse        | Très rapide     | Plus lent    |
| WHERE          | Non supporté    | Supporté    |
| Rollback       | Non (DDL)        | Oui (DML)    |
| Triggers       | Non déclenchés | Déclenchés |
| Reset sequence | Optionnel        | Non          |

---

## 📝 Requêtes CRUD

### SELECT (Read)

```sql
-- Basique
SELECT * FROM users;
SELECT id, name, email FROM users;

-- Avec conditions
SELECT * FROM users WHERE id = 1;
SELECT * FROM users WHERE age > 18 AND is_active = true;
SELECT * FROM users WHERE name LIKE 'A%';
SELECT * FROM users WHERE email IS NOT NULL;

-- Tri et limite
SELECT * FROM users ORDER BY created_at DESC;
SELECT * FROM users ORDER BY name ASC LIMIT 10;
SELECT * FROM users LIMIT 10 OFFSET 20;

-- Agrégations
SELECT COUNT(*) FROM users;
SELECT AVG(age) FROM users;
SELECT MAX(salary), MIN(salary) FROM users;
SELECT is_active, COUNT(*) FROM users GROUP BY is_active;

-- Jointures
SELECT u.name, o.total 
FROM users u 
JOIN orders o ON u.id = o.user_id;
```

### INSERT (Create)

```sql
-- Une ligne
INSERT INTO users (name, email) VALUES ('Ange', 'ange@mail.com');

-- Plusieurs lignes
INSERT INTO users (name, email) VALUES 
    ('Alice', 'alice@mail.com'),
    ('Bob', 'bob@mail.com'),
    ('Charlie', 'charlie@mail.com');

-- Avec retour de l'ID
INSERT INTO users (name, email) VALUES ('Ange', 'ange@mail.com') RETURNING id;

-- Depuis une autre table
INSERT INTO users_backup SELECT * FROM users;
```

### UPDATE

```sql
-- Simple
UPDATE users SET name = 'Nouveau Nom' WHERE id = 1;

-- Plusieurs colonnes
UPDATE users SET name = 'Nouveau', email = 'new@mail.com' WHERE id = 1;

-- Avec calcul
UPDATE products SET price = price * 1.1;  -- +10%

-- Avec sous-requête
UPDATE orders SET status = 'cancelled' 
WHERE user_id IN (SELECT id FROM users WHERE is_active = false);
```

### DELETE

```sql
DELETE FROM users WHERE id = 1;
DELETE FROM users WHERE created_at < NOW() - INTERVAL '1 year';
```

---

## 💾 Backup et Restore

### Backup

```bash
# SQL plain text
docker exec <container> pg_dump -U <user> <database> > backup.sql

# Format compressé (recommandé)
docker exec <container> pg_dump -U <user> -F c <database> > backup.dump

# Backup de toutes les bases
docker exec <container> pg_dumpall -U <user> > all_databases.sql

# Avec options
docker exec <container> pg_dump -U <user> \
    --no-owner \
    --no-privileges \
    --format=custom \
    <database> > backup.dump
```

### Restore

```bash
# Depuis SQL
docker exec -i <container> psql -U <user> <database> < backup.sql

# Depuis dump compressé
docker exec -i <container> pg_restore -U <user> -d <database> backup.dump

# Créer la base et restaurer
docker exec -i <container> pg_restore -U <user> --create -d postgres backup.dump
```

### Backup automatique (cron)

```bash
# Ajouter au crontab
0 2 * * * docker exec postgres pg_dump -U postgres mydb > /backups/mydb_$(date +\%Y\%m\%d).sql
```

---

## 👥 Permissions et utilisateurs

### Créer un utilisateur

```sql
-- Basique
CREATE USER nom_user WITH PASSWORD 'motdepasse';

-- Avec options
CREATE USER nom_user WITH 
    PASSWORD 'motdepasse'
    CREATEDB
    LOGIN
    VALID UNTIL '2025-12-31';

-- Super utilisateur
CREATE USER admin WITH PASSWORD 'secret' SUPERUSER;
```

### Modifier un utilisateur

```sql
-- Changer mot de passe
ALTER USER nom_user WITH PASSWORD 'nouveau_mdp';

-- Donner des droits
ALTER USER nom_user CREATEDB;
ALTER USER nom_user SUPERUSER;
```

### Supprimer un utilisateur

```sql
DROP USER nom_user;
DROP USER IF EXISTS nom_user;
```

### Permissions (GRANT / REVOKE)

```sql
-- Sur une base
GRANT ALL PRIVILEGES ON DATABASE nom_db TO nom_user;
GRANT CONNECT ON DATABASE nom_db TO nom_user;

-- Sur toutes les tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nom_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO nom_user;

-- Sur une table spécifique
GRANT SELECT ON users TO nom_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO nom_user;

-- Révoquer
REVOKE ALL ON DATABASE nom_db FROM nom_user;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nom_user;

-- Permissions par défaut pour futures tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nom_user;
```

---

## ℹ️ Informations système

### Taille des objets

```sql
-- Taille d'une base
SELECT pg_size_pretty(pg_database_size('nom_db'));

-- Taille de toutes les bases
SELECT datname, pg_size_pretty(pg_database_size(datname)) 
FROM pg_database ORDER BY pg_database_size(datname) DESC;

-- Taille des tables
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;

-- Taille d'une table spécifique
SELECT pg_size_pretty(pg_total_relation_size('users'));
```

### Connexions et activité

```sql
-- Connexions actives
SELECT * FROM pg_stat_activity;

-- Connexions par base
SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;

-- Requêtes en cours
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;

-- Tuer une connexion
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'nom_db' AND pid <> pg_backend_pid();
```

### Informations diverses

```sql
-- Version PostgreSQL
SELECT version();

-- Base courante
SELECT current_database();

-- Utilisateur courant
SELECT current_user;

-- Date/heure serveur
SELECT NOW();

-- Paramètres de configuration
SHOW ALL;
SHOW max_connections;
SHOW shared_buffers;
```

---

## 🐳 Astuces Docker

### Commandes utiles

```bash
# Lister les containers PostgreSQL
docker ps | grep postgres

# Logs
docker logs <container> -f

# Exécuter une requête directement
docker exec <container> psql -U postgres -c "SELECT * FROM users;"

# Copier un fichier dans le container
docker cp backup.sql <container>:/tmp/

# Copier depuis le container
docker cp <container>:/tmp/backup.sql ./
```

### Docker Compose exemple

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    container_name: my-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: mydb
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

---

## 🔧 Résolution de problèmes

### Erreur "syntax error"

```sql
-- Vérifier qu'il n'y a pas de commande précédente en attente
-- Le prompt postgres-# indique une commande incomplète
-- Taper ; pour terminer ou \r pour reset
```

### Erreur "permission denied"

```sql
-- Vérifier les droits
\du
GRANT ALL PRIVILEGES ON DATABASE mydb TO myuser;
```

### Erreur "database in use"

```sql
-- Fermer les connexions avant de supprimer
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'mydb';
DROP DATABASE mydb;
```

### Erreur "foreign key constraint"

```sql
-- Utiliser CASCADE
TRUNCATE users CASCADE;
DELETE FROM users CASCADE;
DROP TABLE users CASCADE;
```

---

## 📚 Ressources

* [Documentation officielle PostgreSQL](https://www.postgresql.org/docs/)
* [PostgreSQL Tutorial](https://www.postgresqltutorial.com/)
* [Wiki PostgreSQL](https://wiki.postgresql.org/)

---

*Dernière mise à jour : Janvier 2025*
