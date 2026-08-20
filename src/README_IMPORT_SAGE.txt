Je ne peux pas : le `.ema` est un **format binaire propriétaire, chiffré par Sage**. Sage l'écrit lui-même et refuse tout fichier créé à l'extérieur — il n'existe aucune spécification publique. C'est la seule pièce de la chaîne que je ne peux pas produire pour vous.

Par contre elle se crée en 2 minutes, une fois pour toutes. Les clics exacts :

1. Menu **Fichier > Format import/export paramétrable**
2. Bouton **Nouveau** → nom `IMPORT_ECR_COMEBCI` → enregistrer dans **Téléchargements**
3. Onglet **Description** :
   - Type de fichiers : **Délimité**
   - Délimiteur : **Point-virgule**
   - Type de donnée : **Écritures**
4. Toujours dans Description, insérez les champs **dans cet ordre** (bouton d'insertion / double-clic dans la liste des champs disponibles) :

   1. Code journal
   2. Date écriture → propriété format : `JJ/MM/AAAA`
   3. N° compte général
   4. N° pièce
   5. Libellé
   6. Montant débit
   7. Montant crédit
   8. N° compte tiers

5. Onglet **Particularités** : Origine **Windows**, séparateur décimal **virgule**, **Décimales = 0**, pas d'identificateur texte, pas d'en-tête.
6. **Vérifier le format** → **Enregistrer**.

Vous avez maintenant votre `.ema`. Ensuite `Fichier > Importer > Format paramétrable` → le `.ema` → mon `.txt`.


**Cause trouvée.** Ce n'est pas votre fichier `.txt` — il est correct. C'est l'onglet **Numérotation** de votre `.ema`, qui contient encore les règles par défaut de Sage :

| Table | Règle | Cible |
|---|---|---|
| Comptes généraux | `401*` → | `40100000` (**8 caractères**) |
| Comptes généraux | `411*` → | `41100000` (**8 caractères**) |
| Comptes tiers | `401*` → | `*` |
| Comptes tiers | `411*` → | `*` |

Votre plan comptable COMEBCI est en **6 caractères** (604700, 445200, 401100…). Sage contrôle la table de numérotation dès la ligne 1, voit une cible à 8 caractères, et s'arrête : *« La longueur du compte est incorrecte »*.

**Correction**

1. `Fichier > Format import/export paramétrable` → ouvrir `fichier_ema.ema`
2. Onglet **Numérotation**
3. **Supprimer les 4 lignes** des deux tables (les laisser complètement vides)
4. **Enregistrer**, puis relancer l'import

Si vous préférez garder une règle de conversion, alors la cible doit faire exactement 6 caractères — `401*` → `401000` — jamais 8.

Le reste de votre paramétrage est bon : format de date `jjmmaa` cohérent avec `311224`, 11 champs déclarés, dont 2 en date (positions 2 et 9), format délimité sans longueur fixe.

Si l'écran de paramétrage vous bloque à une étape, envoyez-moi une capture de l'onglet Description et je vous dis exactement quoi cocher.

Source : [Spécification du format .ema — réponse Sage, Community Hub](https://communityhub.sage.com/fr/sage-100/f/partenaire-sage-100-la-communaute-des-developpeurs/201926/specification-du-format-de-fichier-ema)

