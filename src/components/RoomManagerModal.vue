<template>
    <div class="fixed inset-0 z-[10060]">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="close"></div>

        <div class="absolute left-1/2 top-1/2 w-[min(980px,94vw)] h-[min(720px,92vh)] -translate-x-1/2 -translate-y-1/2
             rounded-2xl border border-white/10 bg-[#0b0f12] shadow-2xl overflow-hidden flex flex-col"
             @click.stop>
            <!-- Header -->
            <div class="h-14 px-4 flex items-center justify-between border-b border-white/10">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">🚪</div>
                    <div class="min-w-0">
                        <div class="font-extrabold text-green-200 leading-tight truncate">ניהול הבית</div>
                        <div class="text-[11px] text-white/45 truncate">
                            {{ houseName }} • {{ activeRooms.length }} פעילים
                            <span v-if="archivedRooms.length" class="text-white/30"> • {{ archivedRooms.length }} בארכיון</span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <button class="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/40 transition text-sm font-bold"
                            @click="reload"
                            :disabled="roomsStore.loading"
                            title="Reload">
                        ⟳
                    </button>

                    <button class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:border-red-500/40 transition"
                            @click="close"
                            title="Close">
                        ✕
                    </button>
                </div>
            </div>

            <!-- Body -->
            <div class="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[360px_1fr]">
                <!-- Left list -->
                <div class="min-h-0 border-b md:border-b-0 md:border-r border-white/10 flex flex-col">
                    <div class="p-3 border-b border-white/10 flex items-center justify-between gap-2">
                        <div class="text-xs text-white/45">חדרים</div>

                        <label class="flex items-center gap-2 text-xs text-white/60 select-none">
                            <input type="checkbox" v-model="showArchived" class="accent-green-500" />
                            ארכיון
                        </label>
                    </div>

                    <div class="flex-1 min-h-0 overflow-auto p-2 space-y-1">
                        <button v-for="r in listRooms"
                                :key="r.id"
                                class="w-full rounded-xl border px-3 py-2 transition flex items-center justify-between gap-3 text-right"
                                :class="selectedId === r.id
                ? 'bg-white/5 border-green-500/30'
                : 'bg-black/20 border-white/10 hover:border-white/20'"
                                @click="selectRoom(r.id)"
                                :draggable="isDraggable(r)"
                                @dragstart="onDragStart(r, $event)"
                                @dragover.prevent="onDragOver(r)"
                                @drop.prevent="onDrop(r)">
                            <div class="flex items-center gap-2 min-w-0">
                                <span class="text-lg">{{ r.icon || "🚪" }}</span>

                                <div class="min-w-0 flex-1">
                                    <!-- INLINE RENAME -->
                                    <div v-if="renamingId === r.id" class="min-w-0">
                                        <input ref="renameInput"
                                               v-model="renameDraft"
                                               class="w-full bg-black/50 border border-green-500/25 rounded-lg px-2 py-1 text-sm outline-none
                             focus:border-green-500/40 focus:ring-2 focus:ring-green-500/10"
                                               @keydown.enter.prevent="commitRename(r)"
                                               @keydown.esc.prevent="cancelRename"
                                               @blur="cancelRename" />
                                    </div>

                                    <div v-else class="min-w-0">
                                        <div class="font-bold truncate text-sm"
                                             @dblclick.stop.prevent="beginRename(r)"
                                             :title="'Double click to rename'">
                                            {{ r.name || r.key }}
                                            <span v-if="isLiving(r)" class="text-[11px] text-white/35">• locked</span>
                                            <span v-if="isArchived(r)" class="text-[11px] text-yellow-300/80">• archived</span>
                                        </div>
                                        <div class="text-[11px] text-white/35 truncate">{{ r.key }}</div>
                                    </div>
                                </div>
                            </div>

                            <!-- reorder buttons -->
                            <div class="flex items-center gap-1 shrink-0">
                                <button class="w-8 h-8 rounded-lg bg-white/5 border border-white/10 hover:border-green-500/30 transition disabled:opacity-30"
                                        title="Up"
                                        @click.stop="moveRoom(r.id, -1)"
                                        :disabled="!canMove(r, -1)">
                                    ↑
                                </button>
                                <button class="w-8 h-8 rounded-lg bg-white/5 border border-white/10 hover:border-green-500/30 transition disabled:opacity-30"
                                        title="Down"
                                        @click.stop="moveRoom(r.id, +1)"
                                        :disabled="!canMove(r, +1)">
                                    ↓
                                </button>
                            </div>
                        </button>

                        <div v-if="roomsStore.loading" class="text-xs text-white/50 px-2 py-3">טוען…</div>
                        <div v-else-if="listRooms.length === 0" class="text-xs text-white/50 px-2 py-3">
                            אין חדרים להצגה
                        </div>
                    </div>

                    <div v-if="dirtyOrder" class="mt-2 flex items-center justify-between gap-2">
                        <div class="text-[11px] text-yellow-300/90">סידור השתנה</div>
                        <div class="flex gap-2">
                            <button class="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition text-xs font-bold"
                                    @click="resetLocalOrder">
                                בטל
                            </button>
                            <button class="px-3 py-1.5 rounded-xl bg-green-500 text-black hover:bg-green-400 transition text-xs font-extrabold"
                                    @click="saveOrder">
                                שמור סדר
                            </button>
                        </div>
                    </div>

                    <div class="p-3 border-t border-white/10">
                        <button class="w-full px-3 py-2 rounded-xl bg-green-500 text-black font-extrabold hover:bg-green-400 transition active:scale-[0.99]"
                                @click="startCreate">
                            + הוסף חדר
                        </button>


                    </div>
                </div>

                <!-- Right side: lightweight settings -->
                <div class="min-h-0 flex flex-col">
                    <div class="p-4 border-b border-white/10">
                        <div class="text-xs text-white/45 mb-2">Room settings</div>

                        <div v-if="!selectedRoom" class="text-white/50 text-sm">
                            בחר חדר משמאל.
                        </div>

                        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div class="space-y-1">
                                <label class="text-xs text-white/45">שם</label>
                                <input v-model="edit.name"
                                       type="text"
                                       class="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 outline-none
                         focus:border-green-500/40 focus:ring-2 focus:ring-green-500/10" />
                            </div>

                            <div class="space-y-1">
                                <label class="text-xs text-white/45">אייקון</label>
                                <input v-model="edit.icon"
                                       type="text"
                                       class="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 outline-none
                         focus:border-green-500/40 focus:ring-2 focus:ring-green-500/10"
                                       placeholder="🚪" />
                            </div>

                            

                            <div class="md:col-span-2 flex gap-2 pt-2">
                                <button class="px-4 py-2 rounded-xl bg-green-500 text-black font-extrabold hover:bg-green-400 transition disabled:opacity-40"
                                        @click="saveRoom"
                                        :disabled="saving || !canSave">
                                    שמור
                                </button>

                                <button v-if="isCreating"
                                        class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition font-bold"
                                        @click="cancelCreate"
                                        :disabled="saving">
                                    ביטול
                                </button>

                                <button v-if="!isCreating && selectedRoom && !isArchived(selectedRoom)"
                                        class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-yellow-500/40 transition font-bold disabled:opacity-40"
                                        @click="archiveSelected"
                                        :disabled="saving || isLiving(selectedRoom)">
                                    ארכב
                                </button>

                                <button v-if="!isCreating && selectedRoom && isArchived(selectedRoom)"
                                        class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/40 transition font-bold"
                                        @click="restoreSelected"
                                        :disabled="saving">
                                    החזר
                                </button>
                            </div>

                            <div v-if="isLiving(selectedRoom)" class="md:col-span-2 text-[12px] text-yellow-300/80 pt-1">
                                living הוא חדר בסיס: לא ניתן לארכב.
                            </div>
                        </div>
                    </div>

                    <div class="flex-1 min-h-0 overflow-auto p-4 space-y-3">
                        <div v-if="roomsStore.error" class="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
                            <div class="font-extrabold text-red-200 mb-1">שגיאה</div>
                            <div class="text-sm text-red-100/80">{{ roomsStore.error.message || roomsStore.error }}</div>
                        </div>

                    </div>

                    <div class="p-4 border-t border-white/10 flex items-center justify-between">
                        <div class="text-[11px] text-white/35">
                            <span v-if="roomsStore.loading">טוען…</span>
                            <span v-else-if="dirtyOrder">שכחת לשמור סדר 🙂</span>
                            <span v-else>מוכן.</span>
                        </div>
                        <button class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition font-bold" @click="close">
                            סגור
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed, nextTick, onMounted, ref, watch } from "vue";
    import { useRoomsStore } from "../stores/rooms";
    import { useHouseStore } from "../stores/house";
    import { useUIStore } from "../stores/ui";

    const emit = defineEmits(["close"]);

    const roomsStore = useRoomsStore();
    const house = useHouseStore();
    const ui = useUIStore();

    const showArchived = ref(false);
    const selectedId = ref(null);

    const saving = ref(false);
    const isCreating = ref(false);

    const edit = ref({ id: null, house_id: null, name: "", icon: "", key: "" });

    const localOrder = ref([]); // active ids
    const dirtyOrder = ref(false);

    const renamingId = ref(null);
    const renameDraft = ref("");
    const renameInput = ref(null);

    const houseName = computed(() => {
        const h = (house.myHouses ?? []).find((x) => x.id === house.currentHouseId);
        return h?.is_public ? "GIO HOUSE" : (h?.name || "My House");
    });

    const activeRooms = computed(() => roomsStore.activeRooms ?? []);
    const archivedRooms = computed(() => (roomsStore.rooms ?? []).filter((r) => r?.is_archived));

    const orderedActiveRooms = computed(() => {
        const map = new Map(activeRooms.value.map((r) => [r.id, r]));
        const ordered = localOrder.value.map((id) => map.get(id)).filter(Boolean);

        // safety: append any room missing from localOrder (shouldn't happen but ok)
        const missing = activeRooms.value.filter((r) => !localOrder.value.includes(r.id));
        return [...ordered, ...missing];
    });

    const listRooms = computed(() => {
        if (!showArchived.value) return orderedActiveRooms.value;
        return [...orderedActiveRooms.value, ...archivedRooms.value];
    });

    const selectedRoom = computed(() => (roomsStore.rooms ?? []).find((r) => r.id === selectedId.value) ?? null);

    function isLiving(r) {
        return (r?.key ?? "") === "living";
    }
    function isArchived(r) {
        return !!r?.is_archived;
    }
    function isDraggable(r) {
        return !isArchived(r) && !isLiving(r);
    }

    function close() {
        emit("close");
    }

    async function reload() {
        if (!house.currentHouseId) return;
        await roomsStore.loadForHouse(house.currentHouseId, { force: true });
        initLocalOrder();
    }

    function initLocalOrder() {
        localOrder.value = activeRooms.value.map((r) => r.id);
        dirtyOrder.value = false;
    }

    function selectRoom(id) {
        // cancel rename if switching
        cancelRename();

        selectedId.value = id;
        isCreating.value = false;
        hydrateEditFromSelected();
    }

    function hydrateEditFromSelected() {
        const r = selectedRoom.value;
        if (!r) return;
        edit.value = {
            id: r.id,
            house_id: r.house_id,
            name: r.name ?? "",
            icon: r.icon ?? "",
            key: r.key ?? "",
        };
    }

    // ---------- Inline rename ----------
    function beginRename(r) {
        if (!r || isArchived(r)) return;
        renamingId.value = r.id;
        renameDraft.value = r.name || r.key || "";
        nextTick(() => {
            renameInput.value?.focus?.();
            renameInput.value?.select?.();
        });
    }

    function cancelRename() {
        renamingId.value = null;
        renameDraft.value = "";
    }

    async function commitRename(r) {
        const name = String(renameDraft.value || "").trim();
        if (!name) {
            ui.toast("⚠️ שם לא יכול להיות ריק");
            return;
        }

        saving.value = true;
        try {
            await roomsStore.updateRoom(r.id, { name });
            ui.toast("💾 נשמר");

            // refresh selection editor if needed
            if (selectedId.value === r.id) {
                await nextTick();
                hydrateEditFromSelected();
            }
        } catch (e) {
            console.error(e);
            ui.toast("💥 שינוי שם נכשל");
        } finally {
            saving.value = false;
            cancelRename();
        }
    }

    // ---------- Create ----------
    function normalizeKey(k) {
        return String(k || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-_]/g, "");
    }

    function suggestKeyFromName(name) {
        const base = normalizeKey(name) || "room";
        const keys = new Set((roomsStore.rooms ?? []).map((r) => r.key));
        if (!keys.has(base)) return base;
        let i = 2;
        while (keys.has(`${base}-${i}`)) i++;
        return `${base}-${i}`;
    }

    function startCreate() {
        cancelRename();
        isCreating.value = true;
        const key = suggestKeyFromName("room");
        selectedId.value = "__new__";
        edit.value = { id: null, house_id: house.currentHouseId, name: "חדר חדש", icon: "🚪", key };
    }

    function cancelCreate() {
        isCreating.value = false;
        selectedId.value = activeRooms.value[0]?.id ?? null;
        hydrateEditFromSelected();
    }

    const canSave = computed(() => {
        if (!house.currentHouseId) return false;
        if (!String(edit.value.name || "").trim()) return false;
        return true;
    });

    async function saveRoom() {
        if (saving.value) return;
        if (!canSave.value) return;

        saving.value = true;
        try {
            const name = String(edit.value.name || "").trim();
            const icon = String(edit.value.icon || "").trim() || null;

            if (isCreating.value) {
                const key = suggestKeyFromName(name); // ✅ auto key from name
                await roomsStore.createRoom({ houseId: house.currentHouseId, name, key, icon });
                ui.toast("✅ חדר נוצר");

                isCreating.value = false;

                // select by key
                const created = (roomsStore.rooms ?? []).find((r) => r.key === key);
                selectedId.value = created?.id ?? activeRooms.value[0]?.id ?? null;
                hydrateEditFromSelected();
                initLocalOrder();
                return;
            }

            if (!selectedRoom.value) return;
            await roomsStore.updateRoom(selectedRoom.value.id, { name, icon });
            ui.toast("💾 נשמר");
            hydrateEditFromSelected();
        } catch (e) {
            console.error(e);
            ui.toast("💥 שמירה נכשלה");
        } finally {
            saving.value = false;
        }
    }

    async function archiveSelected() {
        if (!selectedRoom.value) return;
        if (isLiving(selectedRoom.value)) {
            ui.toast("🛋️ living לא נכנס לארכיון");
            return;
        }
        saving.value = true;
        try {
            await roomsStore.archiveRoom(selectedRoom.value.id);
            ui.toast("🗃️ אורכב");
            selectedId.value = activeRooms.value.find((r) => r.id !== selectedRoom.value.id)?.id ?? null;
            hydrateEditFromSelected();
            initLocalOrder();
        } catch (e) {
            console.error(e);
            ui.toast("💥 ארכוב נכשל");
        } finally {
            saving.value = false;
        }
    }

    async function restoreSelected() {
        if (!selectedRoom.value) return;
        saving.value = true;
        try {
            await roomsStore.updateRoom(selectedRoom.value.id, { is_archived: false });
            ui.toast("♻️ הוחזר");
            initLocalOrder();
            hydrateEditFromSelected();
        } catch (e) {
            console.error(e);
            ui.toast("💥 שחזור נכשל");
        } finally {
            saving.value = false;
        }
    }

    // ---------- Reorder ----------
    const dragState = ref({ draggingId: null, overId: null });

    function onDragStart(room, ev) {
        if (!isDraggable(room)) return;
        dragState.value.draggingId = room.id;
        ev.dataTransfer?.setData?.("text/plain", room.id);
        ev.dataTransfer?.setDragImage?.(document.createElement("div"), 0, 0);
    }

    function onDragOver(room) {
        if (!isDraggable(room)) return;
        dragState.value.overId = room.id;
    }

    function onDrop(targetRoom) {
        const fromId = dragState.value.draggingId;
        const toId = targetRoom.id;
        dragState.value.draggingId = null;
        dragState.value.overId = null;

        if (!fromId || !toId || fromId === toId) return;

        const arr = localOrder.value.slice();
        const fromIndex = arr.indexOf(fromId);
        const toIndex = arr.indexOf(toId);
        if (fromIndex === -1 || toIndex === -1) return;

        arr.splice(fromIndex, 1);
        arr.splice(toIndex, 0, fromId);

        localOrder.value = arr;
        dirtyOrder.value = true;
    }

    function canMove(room, dir) {
        if (!room || !isDraggable(room)) return false;

        const arr = localOrder.value;
        const i = arr.indexOf(room.id);
        if (i === -1) return false;

        // איפה living נמצא ברשימת הסדר הפעילה
        const living = activeRooms.value.find(r => isLiving(r));
        const livingIndex = living ? arr.indexOf(living.id) : -1;

        const j = i + dir;

        // גבולות רגילים
        if (j < 0 || j >= arr.length) return false;

        // ✅ אסור לעבור לפני living
        // כלומר: יעד קטן/שווה ל-index של living (מעבר למעלה לפניו)
        if (livingIndex !== -1 && dir < 0 && j <= livingIndex) return false;

        return true;
    }


    function moveRoom(id, dir) {
        const room = (roomsStore.rooms ?? []).find(r => r.id === id);
        if (!canMove(room, dir)) return;

        const arr = localOrder.value.slice();
        const i = arr.indexOf(id);
        const j = i + dir;

        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;

        localOrder.value = arr;
        dirtyOrder.value = true;
    }


    function resetLocalOrder() {
        initLocalOrder();
        ui.toast("↩️ בוטל");
    }

    async function saveOrder() {
        if (!dirtyOrder.value) return;
        saving.value = true;
        try {
            const pairs = localOrder.value.map((id, idx) => ({ id, sort_order: idx }));
            await roomsStore.reorderRooms(pairs);
            ui.toast("✅ סדר נשמר");
            initLocalOrder();
        } catch (e) {
            console.error(e);
            ui.toast("💥 שמירת סדר נכשלה");
        } finally {
            saving.value = false;
        }
    }

    // ---------- bootstrap ----------
    watch(
        () => house.currentHouseId,
        async (hid) => {
            if (!hid) return;
            await roomsStore.loadForHouse(hid, { force: true });
            initLocalOrder();
            if (!selectedId.value || selectedId.value === "__new__") {
                selectedId.value = activeRooms.value[0]?.id ?? null;
                hydrateEditFromSelected();
            }
        },
        { immediate: true }
    );

    onMounted(async () => {
        
    });
</script>
