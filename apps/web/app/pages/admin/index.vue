<script setup lang="ts">
/**
 * Platform administration page (NF-WF-018B): gateway/model/profile
 * management and the routing overview, SUPER_ADMIN only.
 *
 * Authorization is enforced server-side (every platform route 403s for
 * non-SUPER_ADMIN); the gating here is progressive enhancement. A
 * workspace OWNER never sees the admin content.
 */
import { ref, computed, onMounted } from "vue";
import {
  usePlatformAdmin,
  type PlatformRole,
  type GatewayView,
  type ModelView,
  type ProfileMapping,
  type PlatformAuditLogEntry,
  type CreateGatewayInput,
  type UpdateGatewayInput,
} from "../../composables/usePlatformAdmin";
import { useLocale } from "../../composables/useLocale";
import { usePagedList } from "../../composables/usePagedList";
import GatewayList from "../../components/platform-admin/GatewayList.vue";
import GatewayForm, {
  type GatewayFormMode,
} from "../../components/platform-admin/GatewayForm.vue";
import ModelCatalog from "../../components/platform-admin/ModelCatalog.vue";
import ProfileMappings from "../../components/platform-admin/ProfileMappings.vue";
import RoutingOverview from "../../components/platform-admin/RoutingOverview.vue";
import AdminPager from "../../components/platform-admin/AdminPager.vue";

const { t } = useLocale();
const admin = usePlatformAdmin();

type TabKey = "gateways" | "models" | "profiles" | "routing" | "audit";
const tab = ref<TabKey>("gateways");
const role = ref<PlatformRole>(null);
const roleLoaded = ref(false);
const roleError = ref<string | null>(null);

const gateways = ref<GatewayView[]>([]);
const gatewaysLoading = ref(false);
const gatewaysError = ref<string | null>(null);

const models = ref<ModelView[]>([]);
const modelsLoading = ref(false);
const modelsError = ref<string | null>(null);

const mappings = ref<ProfileMapping[]>([]);
const mappingsLoading = ref(false);
const mappingsError = ref<string | null>(null);
const mappingsSaving = ref(false);

const strategy = ref<string | null>(null);
const routingLoading = ref(false);
const routingError = ref<string | null>(null);

const auditRows = ref<PlatformAuditLogEntry[]>([]);
const auditLoading = ref(false);
const auditError = ref<string | null>(null);
const auditAction = ref("");
const { query: auditQuery, page: auditPage, pageCount: auditPageCount, paged: auditPaged, total: auditTotal } =
  usePagedList<PlatformAuditLogEntry>(
    auditRows,
    (row, q) =>
      `${row.action} ${row.actorEmail ?? ""} ${row.actorUserId ?? ""} ${row.entityType}`
        .toLowerCase()
        .includes(q),
  );

/**
 * Toast notifications for the gateway actions (health check, model
 * sync). Success toasts render green, failure toasts red; each auto
 * dismisses. No toast dependency — a fixed stack of rows is the whole
 * feature.
 */
interface AdminToast {
  id: number;
  kind: "success" | "error";
  key: string;
  params?: Record<string, string | number>;
}
const toasts = ref<AdminToast[]>([]);
let toastSeq = 0;
const TOAST_TTL_MS = 6000;

function pushToast(
  kind: AdminToast["kind"],
  key: string,
  params?: Record<string, string | number>,
): void {
  const id = ++toastSeq;
  toasts.value.push({ id, kind, key, params });
  setTimeout(() => dismissToast(id), TOAST_TTL_MS);
}

function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
}

const formMode = ref<GatewayFormMode | null>(null);
const formGateway = ref<GatewayView | null>(null);
const formError = ref<string | null>(null);

const deleteTarget = ref<GatewayView | null>(null);
const actionError = ref<string | null>(null);

const isSuperAdmin = computed(() => admin.isSuperAdmin(role.value));

const tabs = computed<{ key: TabKey; labelKey: string }[]>(() => [
  { key: "gateways", labelKey: "platformAdmin.tabs.gateways" },
  { key: "models", labelKey: "platformAdmin.tabs.models" },
  { key: "profiles", labelKey: "platformAdmin.tabs.profiles" },
  { key: "routing", labelKey: "platformAdmin.tabs.routing" },
  { key: "audit", labelKey: "platformAdmin.tabs.audit" },
]);

const PROFILES = [
  "CREATIVE_WRITER",
  "DEEP_PLANNER",
  "CONTINUITY_REVIEWER",
  "FAST_CLASSIFIER",
  "STRUCTURED_EXTRACTOR",
  "LONG_CONTEXT_REVIEWER",
  "EMBEDDING",
];

function errText(err: unknown): string {
  return err instanceof Error ? err.message : "unknown";
}

async function refreshGateways() {
  gatewaysLoading.value = true;
  gatewaysError.value = null;
  try {
    gateways.value = await admin.listGateways();
  } catch (err) {
    gatewaysError.value = errText(err);
  } finally {
    gatewaysLoading.value = false;
  }
}

async function refreshModels() {
  modelsLoading.value = true;
  modelsError.value = null;
  try {
    models.value = await admin.listModels();
  } catch (err) {
    modelsError.value = errText(err);
  } finally {
    modelsLoading.value = false;
  }
}

async function refreshMappings() {
  mappingsLoading.value = true;
  mappingsError.value = null;
  try {
    mappings.value = await admin.listProfileMappings();
  } catch (err) {
    mappingsError.value = errText(err);
  } finally {
    mappingsLoading.value = false;
  }
}

async function refreshRouting() {
  routingLoading.value = true;
  routingError.value = null;
  try {
    const res = await admin.getRoutingStrategy();
    strategy.value = res.strategy;
    await refreshGateways();
  } catch (err) {
    routingError.value = errText(err);
  } finally {
    routingLoading.value = false;
  }
}

async function refreshAudit() {
  auditLoading.value = true;
  auditError.value = null;
  try {
    auditRows.value = await admin.listAuditLog(auditAction.value || undefined);
  } catch (err) {
    auditError.value = errText(err);
  } finally {
    auditLoading.value = false;
  }
}

async function refreshAll() {
  await Promise.all([
    refreshGateways(),
    refreshModels(),
    refreshMappings(),
    refreshRouting(),
    refreshAudit(),
  ]);
}

function openForm(mode: GatewayFormMode, gateway: GatewayView | null) {
  formMode.value = mode;
  formGateway.value = gateway;
  formError.value = null;
}

async function submitForm(payload: CreateGatewayInput | UpdateGatewayInput) {
  formError.value = null;
  try {
    if (formMode.value === "create") {
      await admin.createGateway(payload as CreateGatewayInput);
    } else if (formGateway.value) {
      await admin.updateGateway(formGateway.value.id, payload as UpdateGatewayInput);
    }
    formMode.value = null;
    formGateway.value = null;
    await refreshGateways();
  } catch (err) {
    formError.value = errText(err);
  }
}

async function confirmDelete() {
  const target = deleteTarget.value;
  if (!target) return;
  actionError.value = null;
  try {
    await admin.deleteGateway(target.id);
    deleteTarget.value = null;
    await Promise.all([refreshGateways(), refreshModels(), refreshMappings()]);
  } catch (err) {
    actionError.value = errText(err);
  }
}

async function toggleGateway(id: string, enabled: boolean) {
  actionError.value = null;
  try {
    await admin.updateGateway(id, { enabled });
    await refreshGateways();
  } catch (err) {
    actionError.value = errText(err);
  }
}

async function syncModels(id: string) {
  actionError.value = null;
  try {
    const res = await admin.syncModels(id);
    await Promise.all([refreshModels(), refreshAudit()]);
    const name = gateways.value.find((g) => g.id === id)?.name ?? id;
    pushToast("success", "platformAdmin.toasts.syncOk", {
      name,
      count: res.discovered,
    });
  } catch (err) {
    actionError.value = errText(err);
    pushToast("error", "platformAdmin.toasts.syncFail");
  }
}

async function healthCheck() {
  actionError.value = null;
  try {
    const results = await admin.healthCheck();
    await Promise.all([refreshGateways(), refreshAudit()]);
    for (const r of results) {
      const name = gateways.value.find((g) => g.id === r.gatewayId)?.name ?? r.gatewayId;
      pushToast(
        r.healthy ? "success" : "error",
        r.healthy ? "platformAdmin.toasts.healthOk" : "platformAdmin.toasts.healthFail",
        { name, ms: r.latencyMs },
      );
    }
  } catch (err) {
    actionError.value = errText(err);
    pushToast("error", "platformAdmin.toasts.healthError");
  }
}

async function toggleModel(id: string, enabled: boolean) {
  actionError.value = null;
  try {
    await admin.setModelEnabled(id, enabled);
    await refreshModels();
  } catch (err) {
    actionError.value = errText(err);
  }
}

async function saveMapping(input: {
  profile: string;
  modelId: string;
  priority: number;
  enabled: boolean;
}) {
  mappingsSaving.value = true;
  actionError.value = null;
  try {
    await admin.setProfileMapping(input);
    await Promise.all([refreshMappings(), refreshAudit()]);
  } catch (err) {
    actionError.value = errText(err);
  } finally {
    mappingsSaving.value = false;
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

onMounted(async () => {
  try {
    role.value = await admin.getPlatformRole();
  } catch (err) {
    roleError.value = errText(err);
  } finally {
    roleLoaded.value = true;
  }
  if (admin.isSuperAdmin(role.value)) {
    await refreshAll();
  }
});
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6">
    <NuxtLink to="/" class="mb-4 inline-block text-sm text-nf-text-dim underline focus-visible:nf-focus">{{ t("authorHome.backHome") }}</NuxtLink>
    <h1 class="mb-4 text-[20px] font-semibold text-nf-text">
      {{ t("platformAdmin.title") }}
    </h1>

    <p v-if="!roleLoaded" class="text-[13px] text-nf-text-dim">…</p>
    <p v-else-if="roleError" class="text-[13px] text-nf-warn" role="alert">{{ roleError }}</p>
    <!-- Server enforces the 403; this panel is progressive enhancement. -->
    <div
      v-else-if="!isSuperAdmin"
      class="rounded-xl border border-nf-border bg-nf-bg-1 p-6"
      role="alert"
      data-testid="admin-forbidden"
    >
      <p class="text-[14px] font-semibold text-nf-text">{{ t("platformAdmin.forbidden") }}</p>
      <p class="mt-1 text-[13px] text-nf-text-dim">{{ t("platformAdmin.forbiddenDetail") }}</p>
    </div>

    <div v-else>
      <div
        class="mb-4 flex gap-1 border-b border-nf-border"
        role="tablist"
        aria-label="Platform administration"
      >
        <button
          v-for="tb in tabs"
          :key="tb.key"
          role="tab"
          :aria-selected="tab === tb.key"
          class="px-3.5 py-2 text-[13px] focus-visible:nf-focus"
          :class="
            tab === tb.key
              ? 'border-b-2 border-nf-accent font-semibold text-nf-text'
              : 'text-nf-text-dim hover:text-nf-text'
          "
          @click="tab = tb.key"
        >
          {{ t(tb.labelKey) }}
        </button>
      </div>

      <p v-if="actionError" class="mb-3 text-[13px] text-nf-warn" role="alert">
        {{ actionError }}
      </p>

      <GatewayList
        v-if="tab === 'gateways'"
        :gateways="gateways"
        :loading="gatewaysLoading"
        :error="gatewaysError"
        @add="openForm('create', null)"
        @edit="(id) => openForm('edit', gateways.find((g) => g.id === id) ?? null)"
        @rotate="(id) => openForm('rotate', gateways.find((g) => g.id === id) ?? null)"
        @delete="(id) => (deleteTarget = gateways.find((g) => g.id === id) ?? null)"
        @toggle-enabled="toggleGateway"
        @sync-models="syncModels"
        @health-check="healthCheck"
      />

      <ModelCatalog
        v-else-if="tab === 'models'"
        :models="models"
        :gateways="gateways"
        :loading="modelsLoading"
        :error="modelsError"
        @toggle-enabled="toggleModel"
      />

      <ProfileMappings
        v-else-if="tab === 'profiles'"
        :mappings="mappings"
        :models="models"
        :profiles="PROFILES"
        :loading="mappingsLoading"
        :error="mappingsError"
        :saving="mappingsSaving"
        @save="saveMapping"
      />

      <RoutingOverview
        v-else-if="tab === 'routing'"
        :gateways="gateways"
        :strategy="strategy"
        :loading="routingLoading"
        :error="routingError"
      />

      <section v-else aria-labelledby="audit-heading">
        <h2 id="audit-heading" class="mb-1 text-[15px] font-semibold text-nf-text">
          {{ t("platformAdmin.audit.heading") }}
        </h2>
        <p class="mb-3 text-[13px] text-nf-text-dim">{{ t("platformAdmin.audit.description") }}</p>
        <div class="mb-3 flex flex-wrap items-center gap-4">
          <label class="text-[12px] font-semibold text-nf-text">
            {{ t("platformAdmin.audit.filterAll") }}
            <select
              v-model="auditAction"
              class="ml-2 rounded-lg border border-nf-border bg-nf-bg-0 p-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              data-testid="audit-action-filter"
              @change="refreshAudit"
            >
              <option value="">{{ t("platformAdmin.audit.filterAll") }}</option>
              <option value="gateway.created">gateway.created</option>
              <option value="gateway.updated">gateway.updated</option>
              <option value="gateway.deleted">gateway.deleted</option>
              <option value="gateways.health-checked">gateways.health-checked</option>
              <option value="model-profile.mapped">model-profile.mapped</option>
              <option value="model.updated">model.updated</option>
              <option value="models.synced">models.synced</option>
              <option value="models.sync-failed">models.sync-failed</option>
            </select>
          </label>
          <label class="text-[12px] font-semibold text-nf-text">
            {{ t("platformAdmin.search.label") }}
            <input
              v-model="auditQuery"
              type="search"
              class="ml-2 w-56 rounded-lg border border-nf-border bg-nf-bg-0 px-2 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              :placeholder="t('platformAdmin.search.placeholder')"
              data-testid="audit-search"
            />
          </label>
        </div>
        <p v-if="auditLoading" class="text-[13px] text-nf-text-dim">…</p>
        <p v-else-if="auditError" class="text-[13px] text-nf-warn" role="alert">{{ auditError }}</p>
        <p v-else-if="auditRows.length === 0" class="text-[13px] text-nf-text-dim">
          {{ t("platformAdmin.audit.empty") }}
        </p>
        <p v-else-if="auditTotal === 0" class="text-[13px] text-nf-text-dim">
          {{ t("platformAdmin.search.noMatch") }}
        </p>
        <div v-else class="overflow-x-auto rounded-xl border border-nf-border">
          <table class="w-full text-left text-[13px]">
            <thead>
              <tr class="border-b border-nf-border bg-nf-bg-2 text-nf-text-dim">
                <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.audit.columns.time") }}</th>
                <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.audit.columns.actor") }}</th>
                <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.audit.columns.action") }}</th>
                <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.audit.columns.entity") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in auditPaged"
                :key="row.id"
                class="border-b border-nf-border last:border-0"
              >
                <td class="px-3 py-2 text-nf-text-dim">{{ formatDate(row.createdAt) }}</td>
                <td class="px-3 py-2 text-nf-text-dim">{{ row.actorEmail ?? row.actorUserId ?? "—" }}</td>
                <td class="px-3 py-2 font-mono text-[12px] text-nf-text">{{ row.action }}</td>
                <td class="px-3 py-2 text-nf-text-dim">{{ row.entityType }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <AdminPager
          :page="auditPage"
          :page-count="auditPageCount"
          :total="auditTotal"
          @update:page="(p) => (auditPage = p)"
        />
      </section>
    </div>

    <GatewayForm
      v-if="formMode"
      :mode="formMode"
      :gateway="formGateway"
      @submit="submitForm"
      @close="formMode = null"
    />
    <p v-if="formError" class="mt-3 text-[13px] text-nf-warn" role="alert">{{ formError }}</p>

    <!-- Delete (revoke) confirm dialog -->
    <div
      v-if="deleteTarget"
      class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="t('platformAdmin.gateways.delete')"
      @keydown.escape="deleteTarget = null"
    >
      <div class="w-full max-w-md rounded-xl border border-nf-border bg-nf-bg-1 p-5 shadow-nf-lg">
        <h3 class="mb-2 text-[15px] font-semibold text-nf-text">
          {{ t("platformAdmin.gateways.delete") }}: {{ deleteTarget.name }}
        </h3>
        <p class="text-[13px] text-nf-text-dim">{{ t("platformAdmin.gateways.deleteConfirm") }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim focus-visible:nf-focus"
            data-autofocus
            @click="deleteTarget = null"
          >
            {{ t("platformAdmin.gateways.form.cancel") }}
          </button>
          <button
            class="rounded-lg bg-nf-error px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-error/90 focus-visible:nf-focus"
            data-testid="confirm-delete-gateway"
            @click="confirmDelete"
          >
            {{ t("platformAdmin.gateways.delete") }}
          </button>
        </div>
      </div>
    </div>

    <div
      class="fixed right-4 top-4 z-[60] flex w-80 flex-col gap-2"
      aria-live="polite"
      data-testid="toast-stack"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :role="toast.kind === 'error' ? 'alert' : 'status'"
        class="flex items-start justify-between gap-2 rounded-xl border bg-nf-bg-1 px-3.5 py-2.5 text-[13px] font-medium shadow-nf-md"
        :class="toast.kind === 'success' ? 'border-nf-ok text-nf-ok' : 'border-nf-error text-nf-error'"
        :data-testid="`toast-${toast.kind}`"
      >
        <span
          class="mt-1.5 size-2 shrink-0 rounded-full"
          :class="toast.kind === 'success' ? 'bg-nf-ok' : 'bg-nf-error'"
          aria-hidden="true"
        ></span>
        <p class="min-w-0 flex-1 break-words">{{ t(toast.key, toast.params) }}</p>
        <button
          class="shrink-0 rounded px-1 text-[14px] leading-none focus-visible:nf-focus"
          :aria-label="t('platformAdmin.toasts.dismiss')"
          @click="dismissToast(toast.id)"
        >
          ✕
        </button>
      </div>
    </div>
  </div>
</template>
