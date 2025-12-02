# Guide de débogage: order_items non insérés dans Supabase

## Logs détaillés ajoutés

J'ai ajouté des logs très détaillés dans la console pour vous aider à diagnostiquer le problème des `order_items` qui ne s'insèrent pas dans Supabase.

## Que voir dans la console

Après avoir mis à jour le code et validé une commande, vous devriez voir dans la console:

```
[Sync] ═══════════════════════════════════════════════════
[Sync] 📦 DONNÉES RÉCUPÉRÉES DE LA BASE DE DONNÉES LOCALE
[Sync] ═══════════════════════════════════════════════════
[Sync] Order ID: order_1734567890123
[Sync] Participant ID: participant_xyz
[Sync] Email: client@example.com
[Sync] Status: validé
[Sync] Total Amount: 25.50
[Sync] Final Amount: 25.50
[Sync] Nombre d'items: 3
[Sync] Items détaillés: [
  {
    "id": 1,
    "product_id": "print",
    "quantity": 2,
    "unit_price": 10,
    "total_price": 20
  },
  {
    "id": 2,
    "product_id": "magnet",
    "quantity": 1,
    "unit_price": 15,
    "total_price": 15
  }
]

[Sync] ═══════════════════════════════════════════════════
[Sync] 🚀 PAYLOAD QUI SERA ENVOYÉ À L'API SUPABASE
[Sync] ═══════════════════════════════════════════════════
[Sync] URL: https://ygetxuvqrknbggplzmvy.supabase.co/functions/v1/manage-orders
[Sync] Payload complet:
{
  "customer_name": "participant_xyz",
  "customer_email": "client@example.com",
  "customer_address": null,
  "total_amount": 2550,
  "sales_point_id": "your-sales-point-id",
  "kiosk_id": "your-kiosk-id",
  "memory_session_id": null,
  "status": "pending",
  "order_items": [
    {
      "product_id": "print",
      "quantity": 2,
      "unit_price": 1000,
      "total_price": 2000
    },
    {
      "product_id": "magnet",
      "quantity": 1,
      "unit_price": 1500,
      "total_price": 1500
    }
  ]
}
[Sync] ───────────────────────────────────────────────────
[Sync] Nombre d'order_items dans le payload: 2
[Sync] Order items détaillés:
[Sync]   Item 1: { product_id: 'print', quantity: 2, unit_price: '10€', total_price: '20€' }
[Sync]   Item 2: { product_id: 'magnet', quantity: 1, unit_price: '15€', total_price: '15€' }
[Sync] ═══════════════════════════════════════════════════

[Auth] Récupération d'un nouveau token...
[Auth] ✅ Nouveau token obtenu (expire dans 3600 secondes)
[Sync] Token d'authentification récupéré

[Sync] ═══════════════════════════════════════════════════
[Sync] ✅ RÉPONSE DE L'API SUPABASE
[Sync] ═══════════════════════════════════════════════════
[Sync] Order ID: order_1734567890123 → Synchronisée avec succès!
[Sync] Réponse complète:
{
  "success": true,
  "order_id": "abc-123",
  "message": "Order created successfully"
}
[Sync] ═══════════════════════════════════════════════════
```

## Diagnostic

### 1. Vérifier que les order_items sont dans le payload

**Regardez la section "🚀 PAYLOAD QUI SERA ENVOYÉ À L'API SUPABASE"**

✅ **Si vous voyez `order_items` avec des produits dedans** → Le client envoie bien les données

❌ **Si `order_items` est vide `[]`** → Le problème vient de la base SQLite locale

### 2. Vérifier la réponse de l'API

**Regardez la section "✅ RÉPONSE DE L'API SUPABASE"**

La réponse vous dira si l'API a bien reçu et traité les données.

## Si les order_items sont bien envoyés mais pas insérés

Si vous voyez dans les logs que:
- ✅ Les `order_items` sont présents dans le payload
- ✅ L'API répond avec succès
- ❌ Mais les `order_items` n'apparaissent pas dans votre table Supabase

**Alors le problème est dans votre Edge Function `manage-orders`.**

### Solution: Modifier l'Edge Function

Votre Edge Function doit insérer les order_items. Voici le code à utiliser:

```typescript
// supabase/functions/manage-orders/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Créer le client Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parser le body
    const payload = await req.json()

    console.log('[Edge Function] Payload reçu:', payload)
    console.log('[Edge Function] Nombre d\'order_items:', payload.order_items?.length || 0)

    // 1. INSÉRER LA COMMANDE PRINCIPALE
    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .insert({
        customer_name: payload.customer_name,
        customer_email: payload.customer_email,
        customer_address: payload.customer_address,
        total_amount: payload.total_amount,
        sales_point_id: payload.sales_point_id,
        kiosk_id: payload.kiosk_id,
        memory_session_id: payload.memory_session_id,
        status: payload.status || 'pending'
      })
      .select()
      .single()

    if (orderError) {
      console.error('[Edge Function] Erreur insertion order:', orderError)
      throw orderError
    }

    console.log('[Edge Function] Order créée avec ID:', order.id)

    // 2. INSÉRER LES ORDER_ITEMS (SI PRÉSENTS)
    if (payload.order_items && payload.order_items.length > 0) {
      console.log('[Edge Function] Insertion de', payload.order_items.length, 'order_items...')

      // Mapper les items avec l'order_id
      const orderItems = payload.order_items.map(item => ({
        order_id: order.id,  // ← Lier à la commande qu'on vient de créer
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price
      }))

      console.log('[Edge Function] Order items à insérer:', orderItems)

      const { data: insertedItems, error: itemsError } = await supabaseClient
        .from('order_items')
        .insert(orderItems)
        .select()

      if (itemsError) {
        console.error('[Edge Function] Erreur insertion order_items:', itemsError)
        throw itemsError
      }

      console.log('[Edge Function] ✅', insertedItems.length, 'order_items insérés')
    } else {
      console.log('[Edge Function] ⚠️  Aucun order_item à insérer')
    }

    // 3. RETOURNER LA RÉPONSE
    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        items_count: payload.order_items?.length || 0,
        message: 'Order and items created successfully'
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Edge Function] Erreur:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
})
```

### Points clés du code Edge Function:

1. **Insertion de la commande principale** → Récupère l'ID avec `.select().single()`
2. **Vérification que order_items existe** → `if (payload.order_items && payload.order_items.length > 0)`
3. **Mappage avec order_id** → Ajoute `order_id: order.id` à chaque item
4. **Insertion des order_items** → `.insert(orderItems)` dans la table `order_items`
5. **Logs détaillés** → Pour voir ce qui se passe

## Comment vérifier l'Edge Function actuelle

1. Allez dans votre projet Supabase
2. **Edge Functions** dans la sidebar
3. Cliquez sur **`manage-orders`**
4. Regardez le code de la fonction

**Vérifiez si elle insère bien les `order_items`**

## Schéma de la table order_items

Assurez-vous que votre table `order_items` a bien ces colonnes:

```sql
CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price BIGINT NOT NULL,  -- Prix en centimes
  total_price BIGINT NOT NULL, -- Prix en centimes
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Tester

1. Récupérez le code:
```bash
git pull origin claude/fix-order-insertion-bug-011CV3asMuGakWAET9rmVHim
```

2. Lancez l'app:
```bash
npm run dev
```

3. Validez une commande

4. **Regardez les logs dans la console**

5. **Envoyez-moi** les logs complets, surtout:
   - Le nombre d'order_items dans le payload
   - La réponse de l'API

Cela me dira si le problème est côté client (electron) ou côté serveur (edge function).
