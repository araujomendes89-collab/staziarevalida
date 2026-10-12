import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { signedUploadWithProgress } from "./signedUploadXhr";
import {
  assertRpcCall,
  BackendError,
  signUpMetadata,
  type AuthUser,
  type Backend,
  type BackendErrorCode,
  type PresenceMember,
  type RealtimeStatus,
} from "./backend";

function toBackendError(error: { message?: string; code?: string; status?: number } | null): BackendError {
  const message = error?.message ?? "";
  const code = error?.code ?? "";
  let mapped: BackendErrorCode = "unknown";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) mapped = "invalid_credentials";
  else if (code === "user_already_exists" || /already registered/i.test(message)) mapped = "email_taken";
  else if (code === "weak_password" || /password should be/i.test(message)) mapped = "weak_password";
  else if (code === "validation_failed" || /invalid email|unable to validate email/i.test(message)) mapped = "invalid_email";
  else if (/fetch|network/i.test(message)) mapped = "network";
  return new BackendError(mapped, message || "Erro inesperado.");
}

export function createSupabaseBackend(url: string, anonKey: string, redirectTo: string): Backend {
  const client: SupabaseClient = createClient(url, anonKey);
  const toUser = (u: { id: string; email?: string | null } | null | undefined): AuthUser | null =>
    u ? { id: u.id, email: u.email ?? null } : null;

  return {
    mode: "supabase",
    async getUser() {
      const { data } = await client.auth.getSession();
      return toUser(data.session?.user);
    },
    async accessToken() {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },
    onAuthChange(callback) {
      // O Supabase pede para não chamar a própria API dentro deste callback (trava a fila de
      // autenticação); por isso o aviso sai no próximo ciclo.
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => callback(toUser(session?.user)), 0);
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw toBackendError(error);
    },
    async signUp(name, email, password, extra) {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { name, ...signUpMetadata(extra) }, emailRedirectTo: redirectTo },
      });
      if (error) throw toBackendError(error);
      return { needsEmailConfirmation: !data.session };
    },
    async signInWithGoogle() {
      const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
      if (error) throw toBackendError(error);
    },
    async resetPassword(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw toBackendError(error);
    },
    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw toBackendError(error);
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw toBackendError(error);
    },
    async rpc<T>(fn: string, args: Record<string, unknown> = {}) {
      assertRpcCall(fn, args);
      const { data, error } = await client.rpc(fn, args);
      if (error) throw new BackendError(/fetch|network/i.test(error.message) ? "network" : "unknown", error.message);
      return data as T;
    },
    async uploadToSignedUrl(bucket, path, token, file, contentType, onProgress) {
      if (onProgress) {
        // Mesma requisição do storage-js (ver signedUploadXhr), por XMLHttpRequest para ter a porcentagem.
        const { data } = await client.auth.getSession();
        const base = (client.storage.from(bucket) as unknown as { headers?: Record<string, string> }).headers ?? {};
        const headers: Record<string, string> = { ...base };
        if (!headers.apikey && !headers.Apikey) headers.apikey = anonKey;
        if (!headers.Authorization && !headers.authorization) headers.Authorization = `Bearer ${data.session?.access_token ?? anonKey}`;
        const target = new URL(`${url.replace(/\/+$/, "")}/storage/v1/object/upload/sign/${bucket}/${path.replace(/^\/|\/$/g, "").replace(/\/+/g, "/")}`);
        target.searchParams.set("token", token);
        try {
          await signedUploadWithProgress({ url: target.toString(), headers, file, onProgress });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new BackendError(/conex/i.test(msg) ? "network" : "unknown", msg);
        }
        return;
      }
      const { error } = await client.storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType });
      if (error) throw new BackendError(/fetch|network/i.test(error.message) ? "network" : "unknown", error.message);
    },
    subscribeStats(userId, onChange) {
      // Só a própria linha (filtro + RLS): nunca chega dado de outro aluno.
      const channel = client
        .channel(`play-stats-${userId}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "user_gamification_stats", filter: `user_id=eq.${userId}` }, () => onChange())
        .subscribe();
      return () => {
        client.removeChannel(channel).catch(() => {});
      };
    },
    subscribeInvites(userId, h) {
      // Canal privado: quem pode entrar é decidido pelas políticas de realtime.messages (migração 9750) e por RLS em study_invites.
      const channel = client.channel("dupla:online", { config: { private: true, presence: { key: userId } } });
      let closed = false;
      let subscribed = false;
      let tracked: Record<string, unknown> | null = null;
      const send = () => {
        if (closed || !subscribed || !tracked) return;
        channel.track(tracked).catch(() => {});
      };
      channel
        .on("presence", { event: "sync" }, () => {
          if (closed) return;
          const seen = new Map<string, PresenceMember>();
          for (const metas of Object.values(channel.presenceState<{ user_id?: string; status?: PresenceMember["status"] }>())) {
            for (const meta of metas) {
              if (meta.user_id && !seen.has(meta.user_id)) seen.set(meta.user_id, { user_id: meta.user_id, status: meta.status });
            }
          }
          h.onPresence([...seen.values()]);
        })
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "study_invites", filter: `to_user=eq.${userId}` },
          () => {
            if (!closed) h.onInvite();
          },
        );
      // O realtime-js só usa o token da sessão se pedirmos antes de assinar (setAuth sem argumento).
      client.realtime
        .setAuth()
        .then(() => {
          if (closed) return;
          channel.subscribe((status) => {
            if (closed) return;
            subscribed = status === "SUBSCRIBED";
            if (subscribed) send();
            h.onStatus?.(status as RealtimeStatus);
          });
        })
        .catch(() => {
          if (!closed) h.onStatus?.("CHANNEL_ERROR");
        });
      return {
        track(payload) {
          tracked = payload;
          send();
        },
        untrack() {
          tracked = null;
          if (!closed && subscribed) channel.untrack().catch(() => {});
        },
        close() {
          if (closed) return;
          closed = true;
          client.removeChannel(channel).catch(() => {});
        },
      };
    },
  };
}
