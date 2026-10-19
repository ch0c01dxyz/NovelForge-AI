<script setup lang="ts">
import { computed } from "vue";
import { useLocale } from "../../composables/useLocale";
import type { ReviewTextTarget } from "../../utils/reviewText";

export interface FinalTextReviewResult {
  chapterVersionId: string;
  verdict: "PASS" | "FAIL";
  hardViolations?: { rule: string; remediation: string | null; evidence: { detail?: string }[] }[];
  scaleReview?: {
    blocking: boolean;
    claims: { ok: boolean; coveredByException: boolean; gap: string | number; quote: string; span: { start: number; end: number } }[];
    missingData: { code: string; explanation: string; nextAction: string }[];
  } | null;
}
const props = defineProps<{ review: FinalTextReviewResult | null; stale: boolean; navigationError: string | null }>();
const emit = defineEmits<{ show: [target: ReviewTextTarget] }>();
const { t } = useLocale();
const issues = computed(() => {
  const items: { rule: string; detail: string; remediation: string; target?: ReviewTextTarget }[] = (props.review?.hardViolations ?? []).map(f => ({ rule: f.rule, detail: f.evidence.map(e => e.detail ?? "").filter(Boolean).join("; "), remediation: f.remediation ?? "" }));
  if (props.review?.scaleReview?.blocking) {
    for (const c of props.review.scaleReview.claims) if (!c.ok && !c.coveredByException) items.push({ rule: "SCALE_VIOLATION", detail: t("reviewScaleGap", { gap: c.gap }), remediation: t("reviewIssues.scaleFix"), target: { span: c.span, quote: c.quote } });
    for (const m of props.review.scaleReview.missingData) items.push({ rule: m.code, detail: m.explanation, remediation: m.nextAction });
  }
  return items;
});
</script>

<template>
  <section v-if="review?.verdict === 'FAIL'" data-testid="final-text-review-panel" :aria-label="t('reviewIssues.title')" class="mb-7">
    <h2 class="mb-2.5 flex items-center justify-between border-b border-nf-border pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">{{ t('reviewIssues.title') }} <span class="rounded bg-nf-bg-2 px-2 py-0.5 tabular-nums">{{ issues.length }}</span></h2>
    <p role="status" class="mb-2 text-[12px] text-nf-warn">{{ t(stale ? 'reviewIssues.stale' : 'reviewIssues.failed') }}</p>
    <p v-if="navigationError" role="alert" class="mb-2 text-[12px] text-nf-warn">{{ navigationError }}</p>
    <p v-if="!issues.length" class="text-[12px] text-nf-text-dim">{{ t('reviewIssues.noDetails') }}</p>
    <ul class="max-h-[40dvh] space-y-2 overflow-y-auto">
      <li v-for="(issue, index) in issues" :key="index" class="rounded-[10px] border border-nf-border bg-nf-bg-2 p-3 text-[12px]">
        <p class="font-semibold text-nf-warn">{{ issue.rule }}</p>
        <p class="mt-1 text-nf-text-dim">{{ issue.detail }}</p>
        <blockquote v-if="issue.target" class="mt-2 border-l-2 border-nf-accent pl-2 text-nf-text">{{ issue.target.quote }}</blockquote>
        <p v-if="issue.remediation" class="mt-2 text-nf-text-dim">{{ issue.remediation }}</p>
        <button v-if="issue.target" type="button" :disabled="stale" data-testid="review-show-text" class="mt-2 min-h-7 rounded-md border border-nf-border-strong px-2.5 py-1 text-nf-accent-hi hover:bg-nf-bg-3 disabled:opacity-50 focus-visible:nf-focus" @click="emit('show', issue.target)">{{ t('reviewIssues.show') }}</button>
        <p v-else class="mt-2 text-nf-text-faint">{{ t('reviewIssues.noTextPosition') }}</p>
      </li>
    </ul>
  </section>
</template>
