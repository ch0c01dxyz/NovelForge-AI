import { useApi } from "./useApi";
import { ref } from "vue";

export interface PlatformBranding { name: string; mark: string; markColor: string; version: number }
export const DEFAULT_BRANDING: PlatformBranding = { name: "NovelForge", mark: "N", markColor: "#1c1207", version: 0 };
export function isPlatformBranding(value: unknown): value is PlatformBranding {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PlatformBranding>;
  return typeof row.name === "string" && /^[\p{L}\p{N} .'-]{1,40}$/u.test(row.name) && row.name.trim().length > 0
    && typeof row.mark === "string" && /^[\p{L}\p{N} .'-]{1,3}$/u.test(row.mark) && row.mark.trim().length > 0
    && typeof row.markColor === "string" && /^#[0-9a-fA-F]{6}$/.test(row.markColor)
    && Number.isInteger(row.version) && row.version! >= 0 && row.version! <= 2147483647;
}

export function useBranding() {
  const branding = useState<PlatformBranding>("platform-branding", () => ({ ...DEFAULT_BRANDING }));
  const loaded = useState<boolean>("platform-branding-loaded", () => false);
  const loading = ref(false);
  const { api } = useApi();
  async function load() {
    loading.value = true;
    try {
      const result = await api<unknown>("/public/branding");
      if (!isPlatformBranding(result)) throw new Error("Invalid platform branding response");
      if (result.version >= branding.value.version) branding.value = result;
      loaded.value = true;
    }
    finally { loading.value = false; }
  }
  return { branding, loaded, loading, load };
}
