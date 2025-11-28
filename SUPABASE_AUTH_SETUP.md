# Configuration de l'authentification Supabase

Ce guide explique comment configurer l'authentification automatique avec Supabase pour la synchronisation des commandes.

## Problème résolu

L'erreur `HTTP 401: Invalid API key` se produit lorsque la clé Supabase `anon` n'est pas correcte ou n'est pas configurée.

## Étapes de configuration

### 1. Récupérer votre clé Supabase Anon

1. Connectez-vous à votre dashboard Supabase: https://supabase.com/dashboard
2. Sélectionnez votre projet: `ygetxuvqrknbggplzmvy`
3. Allez dans **Settings** (⚙️) dans la sidebar
4. Cliquez sur **API** dans le menu Settings
5. Sous **Project API keys**, copiez la clé **`anon` / `public`**

### 2. Mettre à jour votre fichier `.env`

Ouvrez votre fichier `.env` et remplacez la valeur de `API_SUPABASE_ANON_KEY` par votre clé:

```bash
# Remplacer par votre clé anon depuis Supabase Dashboard > Settings > API
API_SUPABASE_ANON_KEY=votre_cle_anon_ici
```

### 3. Vérifier les autres paramètres

Assurez-vous que ces valeurs sont correctes dans votre `.env`:

```bash
# Email et mot de passe de votre compte utilisateur Supabase
API_AUTH_EMAIL=dev@selfizee.fr
API_AUTH_PASSWORD=admin123

# URL de l'endpoint d'authentification (normalement pas besoin de changer)
API_AUTH_URL=https://ygetxuvqrknbggplzmvy.supabase.co/auth/v1/token?grant_type=password
```

### 4. Redémarrer l'application

```bash
npm run dev
```

## Comment ça fonctionne

1. **Avant chaque synchronisation**, l'app appelle l'API Supabase `/auth/v1/token`
2. **Headers envoyés**:
   - `apikey`: Votre clé publique Supabase (anon key)
   - `Authorization: Bearer <anon_key>`: Même clé en Bearer token
   - `Content-Type: application/json`
3. **Body envoyé**:
   ```json
   {
     "email": "dev@selfizee.fr",
     "password": "admin123"
   }
   ```
4. **Réponse attendue**:
   ```json
   {
     "access_token": "eyJhbGc...",
     "token_type": "bearer",
     "expires_in": 3600,
     "refresh_token": "..."
   }
   ```
5. Le `access_token` est ensuite utilisé pour appeler l'API de synchronisation

## Vérification

Pour vérifier que l'authentification fonctionne, regardez les logs dans la console:

**Succès**:
```
[Auth] Récupération d'un nouveau token...
[Auth] ✅ Nouveau token obtenu (expire dans 3600 secondes)
[Sync] Token d'authentification récupéré
[Sync] Envoi commande à l'API distante: order_xxx
```

**Échec** (mauvaise clé):
```
[Auth] Récupération d'un nouveau token...
[Auth] ❌ Erreur récupération token: HTTP 401: {"message":"Invalid API key"...}
```

## Dépannage

### Erreur: "Invalid API key"

**Cause**: La clé `API_SUPABASE_ANON_KEY` n'est pas correcte

**Solution**:
1. Vérifiez que vous avez bien copié la clé **`anon`** et non la clé `service_role`
2. Vérifiez qu'il n'y a pas d'espaces avant/après la clé dans le `.env`
3. Assurez-vous que la clé correspond bien à VOTRE projet Supabase

### Erreur: "Invalid login credentials"

**Cause**: L'email ou le mot de passe est incorrect

**Solution**:
1. Vérifiez `API_AUTH_EMAIL` et `API_AUTH_PASSWORD` dans `.env`
2. Assurez-vous que cet utilisateur existe dans votre projet Supabase
3. Créez l'utilisateur si nécessaire via: Supabase Dashboard > Authentication > Users > Add User

### La clé anon fonctionne mais j'ai toujours HTTP 401 sur la sync

**Cause**: Le token récupéré n'a pas les permissions pour appeler `/manage-orders`

**Solution**:
1. Vérifiez les Row Level Security (RLS) policies dans Supabase
2. Assurez-vous que l'utilisateur authentifié a le droit d'écrire dans vos tables
3. Vérifiez les permissions de votre Edge Function `manage-orders`

## Variables d'environnement complètes

Voici un exemple complet de configuration dans `.env`:

```bash
# ============================================
# API Authentication (Supabase)
# ============================================

API_AUTH_EMAIL=dev@selfizee.fr
API_AUTH_PASSWORD=admin123
API_AUTH_URL=https://ygetxuvqrknbggplzmvy.supabase.co/auth/v1/token?grant_type=password

# ⚠️ Remplacer par votre clé depuis Supabase Dashboard > Settings > API
API_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ============================================
# Order Synchronization
# ============================================

SALES_POINT_ID=votre-sales-point-uuid
KIOSK_ID=votre-kiosk-uuid
ENABLE_API_SYNC=true
SYNC_RETRY_INTERVAL_MS=60000
SYNC_MAX_ATTEMPTS=5
```

## Sécurité

⚠️ **Important**:
- La clé `anon` est publique et peut être exposée côté client
- Elle est limitée par les Row Level Security (RLS) policies de Supabase
- Ne JAMAIS exposer la clé `service_role` qui a tous les droits
- Toujours utiliser RLS pour protéger vos données

## Support

Si vous rencontrez toujours des problèmes:
1. Vérifiez les logs dans la console de l'application
2. Vérifiez les logs dans le dashboard Supabase (Logs > Edge Functions)
3. Testez l'authentification manuellement avec curl:

```bash
curl -X POST 'https://ygetxuvqrknbggplzmvy.supabase.co/auth/v1/token?grant_type=password' \
  -H 'apikey: VOTRE_CLE_ANON' \
  -H 'Authorization: Bearer VOTRE_CLE_ANON' \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@selfizee.fr","password":"admin123"}'
```

Si cette commande curl fonctionne, alors le problème est ailleurs dans l'application.
