# Fix: Foreign Key Constraint Error sur memory_session_id

## Erreur rencontrée

```
HTTP 400: {
  "error": "insert or update on table \"orders\" violates foreign key constraint \"orders_memory_session_id_fkey\""
}
```

## Cause

La table `orders` dans Supabase a une contrainte de clé étrangère sur la colonne `memory_session_id` qui référence probablement une table `memory_sessions` ou `participants`.

Le problème est que:
- Le `participant_id` existe dans la base SQLite locale du kiosque
- Mais il n'existe **PAS** dans la base Supabase distante
- Donc la contrainte de clé étrangère échoue

## Solutions possibles

### Solution 1: Rendre memory_session_id NULLABLE (Recommandé)

Dans votre base Supabase, rendez la colonne `memory_session_id` nullable:

```sql
-- Dans Supabase SQL Editor
ALTER TABLE orders
ALTER COLUMN memory_session_id DROP NOT NULL;
```

Le code envoie maintenant `memory_session_id: null` dans le payload.

### Solution 2: Supprimer la contrainte de clé étrangère

Si vous n'avez pas besoin de la relation avec la table `memory_sessions`:

```sql
-- Trouver le nom de la contrainte
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'orders'
  AND constraint_type = 'FOREIGN KEY'
  AND constraint_name LIKE '%memory_session%';

-- Supprimer la contrainte
ALTER TABLE orders
DROP CONSTRAINT orders_memory_session_id_fkey;
```

### Solution 3: Supprimer complètement le champ du payload

Si le champ n'est pas utilisé dans votre API, supprimez-le du payload:

Dans `main.js`, ligne 865, commentez ou supprimez:
```javascript
const payload = {
  customer_name: orderWithItems.participant_id || 'Anonymous',
  customer_email: orderWithItems.email || 'no-email@cancelled.order',
  customer_address: null,
  total_amount: Math.round(totalAmount * 100),
  sales_point_id: API_SYNC_CONFIG.salesPointId,
  kiosk_id: API_SYNC_CONFIG.kioskId,
  // memory_session_id: null,  // ← Commenté ou supprimé
  status: apiStatus,
  order_items: [...]
};
```

### Solution 4: Créer le participant dans Supabase avant la commande

Si vous voulez vraiment lier les commandes aux sessions:

1. Modifiez l'Edge Function `manage-orders` pour créer automatiquement le participant s'il n'existe pas
2. Ou créez une API séparée pour synchroniser les participants

## Implémentation actuelle

Le code a été modifié pour envoyer `memory_session_id: null`.

**Si l'erreur persiste**, cela signifie que la colonne est NOT NULL dans Supabase. Vous devez alors:
- Appliquer la **Solution 1** (recommandé) pour rendre la colonne nullable
- OU appliquer la **Solution 3** pour supprimer le champ du payload

## Vérifier le schéma Supabase

Pour vérifier la définition de la table:

```sql
-- Voir la structure de la table orders
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;

-- Voir les contraintes de clé étrangère
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'orders';
```

## Recommandation

Je recommande **Solution 1** (rendre nullable) car:
- ✅ Permet de lier les commandes aux sessions si nécessaire plus tard
- ✅ N'impacte pas les autres parties de votre système
- ✅ Simple à implémenter
- ✅ Flexible pour l'avenir

Exécutez simplement cette commande dans Supabase SQL Editor:
```sql
ALTER TABLE orders ALTER COLUMN memory_session_id DROP NOT NULL;
```

Puis testez à nouveau la synchronisation.
