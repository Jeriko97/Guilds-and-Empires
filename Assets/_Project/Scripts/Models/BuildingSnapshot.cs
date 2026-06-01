using System.Collections.Generic;

namespace GuildsAndEmpires.Models
{
    // ── Slot de production ────────────────────────────────────────────────────

    /// <summary>
    /// État d'un slot de production tel que retourné par resolveLoginState.
    /// Immuable — le client ne mute jamais ces données directement.
    /// </summary>
    public sealed class SlotSnapshot
    {
        /// <summary>Index du slot dans le bâtiment (0, 1 ou 2 en Phase 1).</summary>
        public int SlotIndex { get; }

        /// <summary>
        /// Recette en cours de production, ou null si le slot est inactif.
        /// Valeurs possibles : "logs", "planks", "reconstruction_kits".
        /// </summary>
        public string RecipeId { get; }

        /// <summary>
        /// Instant de démarrage de la production, en millisecondes epoch UTC.
        /// 0L si le slot est inactif (startedAt null côté serveur).
        /// </summary>
        public long StartedAtMs { get; }

        /// <summary>
        /// Dernier instant de calcul de production, en millisecondes epoch UTC.
        /// 0L si le slot n'a jamais été calculé (lastProcessedAt null côté serveur).
        /// </summary>
        public long LastProcessedAtMs { get; }

        public SlotSnapshot(int slotIndex, string recipeId, long startedAtMs, long lastProcessedAtMs)
        {
            SlotIndex        = slotIndex;
            RecipeId         = recipeId;
            StartedAtMs      = startedAtMs;
            LastProcessedAtMs = lastProcessedAtMs;
        }
    }

    // ── Bâtiment ─────────────────────────────────────────────────────────────

    /// <summary>
    /// État d'un bâtiment tel que retourné par resolveLoginState.
    /// Contient l'id Firestore du document (nécessaire pour startProductionSlot).
    /// Immuable — le client ne mute jamais ces données directement.
    /// </summary>
    public sealed class BuildingSnapshot
    {
        /// <summary>
        /// Identifiant Firestore du document building (ex. "sawmill_0").
        /// Source de vérité server-authoritative — ne jamais reconstruire côté client.
        /// Requis par startProductionSlot, collectProduction et tout appel CF ciblant un bâtiment.
        /// </summary>
        public string Id { get; }

        /// <summary>Type de bâtiment (ex. "sawmill").</summary>
        public string BuildingType { get; }

        /// <summary>Niveau du bâtiment (toujours 1 en Phase 1).</summary>
        public int Level { get; }

        /// <summary>État des slots de production. Toujours 3 slots en Phase 1.</summary>
        public IReadOnlyList<SlotSnapshot> Slots { get; }

        public BuildingSnapshot(string id, string buildingType, int level, IReadOnlyList<SlotSnapshot> slots)
        {
            Id           = id;
            BuildingType = buildingType;
            Level        = level;
            Slots        = slots;
        }
    }
}
