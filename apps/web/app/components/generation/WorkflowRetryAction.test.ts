import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import WorkflowRetryAction from "./WorkflowRetryAction.vue";
import { ApiError } from "../../composables/useApi";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
let language = "en";
let missingRetryLabel = false;
vi.mock("../../composables/useApi", async original => ({ ...await original<typeof import("../../composables/useApi")>(), useApi: () => ({ api }) }));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => {
  const read = (resource: unknown) => missingRetryLabel && resource === id && key === 'run.retryStep' ? undefined : key.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], resource);
  return read(language === 'id' ? id : en) ?? read(en) ?? key;
} }) }));
const run = { id: "source-run", status: "FAILED", retry: { stepKey: "review_vs", reason: "INVALID_AI_OUTPUT" as const } };
let wrapper: VueWrapper | undefined;
beforeEach(() => { language = 'en'; missingRetryLabel = false; api.mockReset(); });
afterEach(() => { wrapper?.unmount(); wrapper = undefined; });
function render(value = run) { wrapper = mount(WorkflowRetryAction, { props: { workspaceId: 'workspace', run: value } }); return wrapper; }
describe('explicit failed step retry', () => {
  it.each(['en', 'id'])('offers settings recovery without a retry POST when direct retry is unavailable in %s', async locale => {
    language = locale;
    const w = mount(WorkflowRetryAction, { props: { workspaceId: 'workspace', run: { id: run.id, status: 'FAILED' }, canConfigure: true } });wrapper = w;
    const labels = locale === 'en' ? en : id;
    expect(w.text()).toContain(labels.run.configureRecovery);
    expect(w.text()).toContain(labels.run.configureRestart);
    await w.get('[data-testid="configure-failed-run"]').trigger('click');
    expect(w.emitted('configure')).toEqual([[run.id]]);expect(api).not.toHaveBeenCalled();
    await w.setProps({ run: { id: run.id, status: 'SUCCEEDED' } });expect(w.find('button').exists()).toBe(false);
  });
  it.each(['en', 'id'])('shows localized reason and preserved-results explanation in %s', locale => {
    language = locale; const w = render();
    expect(w.text()).toContain((locale === 'en' ? en : id).run.retryInvalidOutput);
    expect(w.text()).not.toContain('run.retry');
  });
  it('uses English fallback for a missing localized retry label', () => {
    language = 'id'; missingRetryLabel = true;
    expect(render().get('button').text()).toContain(en.run.retryStep);
  });
  it('hides the action without server eligibility or for a non-failed run', async () => {
    const w = render(); await w.setProps({ run: { id: run.id, status: 'FAILED' } }); expect(w.find('button').exists()).toBe(false);
    await w.setProps({ run: { ...run, status: 'RUNNING' } }); expect(w.find('button').exists()).toBe(false); expect(api).not.toHaveBeenCalled();
  });
  it('disables duplicate clicks until the single retry is confirmed and selects its run', async () => {
    let resolve!: (value: unknown) => void;
    api.mockImplementation(() => new Promise(r => { resolve = r; }));
    const w = render(); await w.get('button').trigger('click'); await w.get('button').trigger('click');
    expect(api).toHaveBeenCalledTimes(1); expect(w.get('button').attributes('disabled')).toBeDefined();
    resolve({ id: 'retry-run', statusUrl: '/api/workspaces/workspace/workflow-runs/retry-run' }); await flushPromises();
    expect(w.emitted('retried')).toEqual([[{ runId: 'retry-run', statusUrl: '/api/workspaces/workspace/workflow-runs/retry-run' }]]);
  });
  it('repeats the same source request after an uncertain response rather than starting a new workflow', async () => {
    api.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce({ id: 'same-child', statusUrl: '/api/status' });
    const w = render(); await w.get('button').trigger('click'); await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain(en.run.retryUncertain);
    await w.get('button').trigger('click'); await flushPromises();
    expect(api.mock.calls[0]).toEqual(api.mock.calls[1]);
    expect(api.mock.calls[0]).toEqual(['/workspaces/workspace/workflow-runs/source-run/retry', { method: 'POST' }]);
  });
  it.each([403,409])('shows a plain refusal and stops submissions after HTTP%s', async status => {
    api.mockRejectedValue(new ApiError('PRIVATE_DETAILS', status)); const w = render(); await w.get('button').trigger('click'); await flushPromises();
    expect(w.text()).not.toContain('PRIVATE_DETAILS'); expect(w.get('button').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain(status === 409 ? en.run.retryChanged : en.run.retryUnavailable);
  });
  it.each(['workspace', 'run', 'unmount'])('ignores a delayed retry after changing %s', async scope => {
    let resolve!: (value: unknown) => void; api.mockImplementation(() => new Promise(r => { resolve = r; }));
    const w = render(); await w.get('button').trigger('click');
    if (scope === 'unmount') w.unmount();
    else await w.setProps(scope === 'run' ? { run: { ...run, id: 'other-run' } } : { workspaceId: 'other-workspace' });
    resolve({ id: 'old-result', statusUrl: '/api/old' }); await flushPromises(); expect(w.emitted('retried')).toBeUndefined();
  });
});
