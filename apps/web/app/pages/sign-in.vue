<script setup lang="ts">
/**
 * Sign-in / register. The API sets the HttpOnly session cookie on
 * success; we then go to the novel list. Registering also signs in
 * (POST /register returns userId only), so we follow it with a login.
 */
const { api } = useApi();
const route = useRoute();

const mode = ref<"login" | "register">("login");
const email = ref("");
const password = ref("");
const displayName = ref("");
const busy = ref(false);
const error = ref<string | null>(null);

const redirect = computed(() => {
  const r = String(route.query.redirect ?? "");
  // Only allow internal absolute paths — never an off-site redirect.
  return r.startsWith("/") && !r.startsWith("//") ? r : "/";
});

async function submit() {
  if (busy.value) return;
  error.value = null;
  busy.value = true;
  try {
    if (mode.value === "register") {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: email.value,
          password: password.value,
          displayName: displayName.value,
        }),
      });
    }
    await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: email.value, password: password.value }),
    });
    await navigateTo(redirect.value);
  } catch (e) {
    error.value =
      e instanceof ApiError
        ? {
            EMAIL_TAKEN: "That email is already registered.",
            INVALID_CREDENTIALS: "Email or password is incorrect.",
            INVALID_INPUT: "Check the fields and try again.",
          }[e.code] ?? "Something went wrong. Try again."
        : "Could not reach the server.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="grid min-h-dvh place-items-center bg-nf-bg-0 px-4 text-nf-text">
    <div class="w-full max-w-sm">
      <div class="mb-6 flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
        <span
          class="grid size-7 place-items-center rounded-md bg-nf-accent font-nf-literary text-base font-bold text-nf-accent-ink"
          >N</span
        >
        NovelForge
      </div>

      <h1 class="mb-1 font-nf-literary text-2xl font-semibold">
        {{ mode === "login" ? "Sign in" : "Create an account" }}
      </h1>
      <p class="mb-6 text-[13px] text-nf-text-dim">
        {{
          mode === "login"
            ? "Open your workspaces and continue writing."
            : "Set up an account to start a novel."
        }}
      </p>

      <form class="flex flex-col gap-3" @submit.prevent="submit">
        <label v-if="mode === 'register'" class="flex flex-col gap-1.5">
          <span class="text-[11px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
            >Display name</span
          >
          <input
            v-model="displayName"
            type="text"
            required
            maxlength="100"
            autocomplete="name"
            class="rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[14px] outline-none focus-visible:nf-focus"
          />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-[11px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
            >Email</span
          >
          <input
            v-model="email"
            type="email"
            required
            maxlength="320"
            autocomplete="email"
            class="rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[14px] outline-none focus-visible:nf-focus"
          />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-[11px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
            >Password</span
          >
          <input
            v-model="password"
            type="password"
            required
            minlength="8"
            maxlength="128"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            class="rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[14px] outline-none focus-visible:nf-focus"
          />
        </label>

        <p
          v-if="error"
          role="alert"
          class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2 text-[13px] text-nf-warn"
        >
          {{ error }}
        </p>

        <button
          type="submit"
          :disabled="busy"
          class="mt-1 rounded-lg bg-nf-accent px-3.5 py-2 text-[13.5px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        >
          {{ busy ? "Working…" : mode === "login" ? "Sign in" : "Create account" }}
        </button>
      </form>

      <button
        type="button"
        class="mt-5 text-[13px] text-nf-text-dim underline-offset-4 hover:text-nf-text hover:underline focus-visible:nf-focus"
        @click="
          mode = mode === 'login' ? 'register' : 'login';
          error = null;
        "
      >
        {{ mode === "login" ? "Need an account? Register" : "Already registered? Sign in" }}
      </button>
    </div>
  </div>
</template>
