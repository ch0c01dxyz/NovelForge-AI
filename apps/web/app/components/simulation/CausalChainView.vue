<template>
  <section
    aria-labelledby="sim-causal-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="sim-causal-chain"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 id="sim-causal-title" class="text-[16px] font-semibold text-nf-text">
        {{ t("simulation.causality.title") }}
      </h2>
      <button
        v-if="eventId"
        type="button"
        data-testid="sim-causal-close"
        class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="$emit('close')"
      >
        {{ t("simulation.close") }}
      </button>
    </div>

    <p v-if="loadError" role="alert" class="mt-3 text-[13px] text-red-300" data-testid="sim-causal-error">
      {{ t("simulation.loadError") }}
    </p>

    <div v-if="!eventId" class="mt-3 text-[13px] text-nf-text-dim" data-testid="sim-causal-empty">
      {{ t("simulation.causality.selectEvent") }}
    </div>

    <div v-else-if="chain" class="mt-4">
      <div v-if="chain.length === 0" class="text-[13px] text-nf-text-dim" data-testid="sim-causal-no-causes">
        {{ t("simulation.causality.noCauses") }}
      </div>
      <ul v-else class="list-none p-0 m-0" :aria-label="t('simulation.causality.title')">
        <CausalNode
          v-for="node in chain"
          :key="node.linkId"
          :node="node"
          :depth="0"
        />
      </ul>

      <!-- Counterfactual panel -->
      <div v-if="counterfactuals.length > 0" class="mt-6 border-t border-nf-border pt-4" data-testid="sim-counterfactuals">
        <h3 class="text-[14px] font-semibold text-nf-text">
          {{ t("simulation.causality.counterfactuals") }}
        </h3>
        <ul class="mt-2 list-none p-0 m-0">
          <li
            v-for="cf in counterfactuals"
            :key="cf.linkId"
            :data-testid="`sim-counterfactual-${cf.linkId}`"
            class="mt-2 rounded-lg border border-nf-border bg-nf-bg-2 p-3 text-[13px]"
          >
            <span class="rounded-full border border-nf-accent-border bg-nf-accent-dim px-2 py-0.5 text-[11px] font-medium text-nf-accent-hi">
              {{ t("simulation.causality.kinds.PREVENTING") }}
            </span>
            <p class="mt-2 text-nf-text-dim">
              {{ t("simulation.causality.preventedEvent", { id: shortId(cf.preventedEventId) }) }}
            </p>
            <pre v-if="cf.evidence" class="mt-1 max-h-24 overflow-auto rounded bg-nf-bg-0 p-2 text-[12px] text-nf-text-dim">{{ formatJson(cf.evidence) }}</pre>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * NF-WF-021D: Causal chain visualization (021B).
 *
 * Recursive event → causes tree with DIRECT/ENABLING/PREVENTING badges,
 * plus the counterfactual (PREVENTING links) panel. Data comes from
 * 021B's getCausalChain / getCounterfactuals routes.
 */
import { ref, watch, defineComponent, h, type PropType, type DefineComponent, type VNode } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useSimulationApi, type CausalChainNode, type Counterfactual, type CausalKind } from "./simulationApi";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  runId: string;
  eventId: string | null;
}>();

defineEmits<{ (e: "close"): void }>();

const { t } = useLocale();
const simApi = useSimulationApi();

const chain = ref<CausalChainNode[] | null>(null);
const counterfactuals = ref<Counterfactual[]>([]);
const loadError = ref(false);

async function load() {
  chain.value = null;
  counterfactuals.value = [];
  loadError.value = false;
  if (!props.eventId) return;
  try {
    chain.value = await simApi.getCausalChain(
      props.workspaceId,
      props.novelId,
      props.runId,
      props.eventId,
    );
    counterfactuals.value = await simApi.getCounterfactuals(
      props.workspaceId,
      props.novelId,
      props.runId,
      props.eventId,
    );
  } catch {
    loadError.value = true;
  }
}

watch(() => props.eventId, load, { immediate: true });

function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : "—";
}

function formatJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

// Recursive tree node (render function to allow recursion in <script setup>).
// Explicit VNode return type avoids TS7022/TS7024 self-reference errors.
const CausalNode: DefineComponent<{ node: CausalChainNode; depth: number }> = defineComponent({
  name: "CausalNode",
  props: {
    node: { type: Object as PropType<CausalChainNode>, required: true },
    depth: { type: Number, required: true },
  },
  setup(p): () => VNode {
    const { t: tt } = useLocale();
    const kindClass = (kind: CausalKind): string => {
      switch (kind) {
        case "DIRECT":
          return "border-nf-ok/40 bg-nf-ok/10 text-nf-ok";
        case "ENABLING":
          return "border-nf-warn/40 bg-nf-warn-dim text-nf-warn";
        case "PREVENTING":
          return "border-nf-accent-border bg-nf-accent-dim text-nf-accent-hi";
      }
    };
    return (): VNode =>
      h(
        "li",
        {
          "data-testid": `sim-causal-node-${p.node.linkId}`,
          class: "mt-2",
          style: { marginLeft: `${p.depth * 1.5}rem` },
        },
        [
          h(
            "div",
            { class: "rounded-lg border border-nf-border bg-nf-bg-2 p-3" },
            [
              h("div", { class: "flex flex-wrap items-center gap-2" }, [
                h(
                  "span",
                  {
                    class: `rounded-full border px-2 py-0.5 text-[11px] font-medium ${kindClass(p.node.kind)}`,
                  },
                  tt(`simulation.causality.kinds.${p.node.kind}`),
                ),
                h(
                  "span",
                  { class: "font-mono text-[12px] text-nf-text-dim" },
                  p.node.eventId.slice(0, 8),
                ),
              ]),
              p.node.evidence
                ? h(
                    "pre",
                    {
                      class:
                        "mt-2 max-h-24 overflow-auto rounded bg-nf-bg-0 p-2 text-[12px] text-nf-text-dim",
                    },
                    (() => {
                      try {
                        return JSON.stringify(p.node.evidence, null, 2);
                      } catch {
                        return String(p.node.evidence);
                      }
                    })(),
                  )
                : null,
            ],
          ),
          p.node.causes.length > 0
            ? h(
                "ul",
                { class: "list-none p-0 m-0", "aria-label": tt("simulation.causality.title") },
                p.node.causes.map((c) =>
                  h(CausalNode, { key: c.linkId, node: c, depth: p.depth + 1 }),
                ),
              )
            : null,
        ],
      );
  },
});
</script>
