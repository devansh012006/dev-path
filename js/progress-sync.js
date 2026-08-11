/*
  progress-sync.js
  Drop-in script for every roadmap page.
  - Detects if the user is logged in (Supabase session)
  - If logged in: loads their saved progress for THIS roadmap and re-applies
    the .done class to the matching nodes, then watches for further clicks
    and saves them back to Supabase automatically.
  - If logged out: the page behaves exactly as before (toggling still works
    in-memory, it just won't persist) and the nav shows "Sign in".
  - Swaps the nav "Sign in" link into a working "Logout" button when logged in.

  This does NOT require editing each roadmap's own inline script — it works
  purely by observing class changes on [data-id] elements, so it's safe to
  drop into any of the 28 roadmap pages unchanged.
*/
(function () {
  const SUPABASE_URL = "https://cgeunysucdymiqvvagfw.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZXVueXN1Y2R5bWlxdnZhZ2Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MjUzNTAsImV4cCI6MjEwMjAwMTM1MH0.IZ9YJ8Nega_c_gS9uWORaaY8oYWV36G82s9OxVbri0w";

  if (!window.supabase) {
    console.warn("[progress-sync] supabase-js not loaded on this page.");
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Unique slug per roadmap, derived from the filename (e.g. "roadmap-frontend")
  const slug = location.pathname.split("/").pop().replace(/\.html?$/, "") || "index";

  let userId = null;
  let session = null;
  let saveTimer = null;

  function debounceSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveProgress, 500);
  }

  async function saveProgress() {
    if (!userId) return;
    const nodes = Array.from(document.querySelectorAll("[data-id]"));
    if (!nodes.length) return;
    const rows = nodes.map((n) => ({
      user_id: userId,
      roadmap_slug: slug,
      topic_id: n.dataset.id,
      done: n.classList.contains("done"),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await sb
      .from("progress")
      .upsert(rows, { onConflict: "user_id,roadmap_slug,topic_id" });
    if (error) console.error("[progress-sync] save failed:", error.message);
  }

  async function loadProgress() {
    if (!userId) return;
    const { data, error } = await sb
      .from("progress")
      .select("topic_id,done")
      .eq("user_id", userId)
      .eq("roadmap_slug", slug);
    if (error) {
      console.error("[progress-sync] load failed:", error.message);
      return;
    }
    (data || []).forEach((row) => {
      if (!row.done) return;
      const el = document.querySelector(`[data-id="${CSS.escape(row.topic_id)}"]`);
      if (el) el.classList.add("done");
    });
    if (typeof window.updateProgress === "function") window.updateProgress();
  }

  function watchToggles() {
    const observer = new MutationObserver((mutations) => {
      let changed = false;
      for (const m of mutations) {
        if (m.attributeName === "class" && m.target.hasAttribute("data-id")) {
          changed = true;
          break;
        }
      }
      if (changed) debounceSave();
    });
    document.querySelectorAll("[data-id]").forEach((el) => {
      observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    });
  }

  function updateNav() {
    const signinLink = document.querySelector('a[href="signin.html"]');
    const signupLink = document.querySelector('a[href="signup.html"]');
    if (!signinLink) return;

    if (userId) {
      signinLink.textContent = "Logout";
      signinLink.setAttribute("href", "#");
      signinLink.addEventListener("click", async (e) => {
        e.preventDefault();
        await sb.auth.signOut();
        location.reload();
      });
      if (signupLink && session?.user?.email) {
        signupLink.textContent = session.user.email.split("@")[0];
        signupLink.setAttribute("href", "index.html");
      }
    }
  }

  async function init() {
    const { data } = await sb.auth.getSession();
    session = data.session;
    userId = session ? session.user.id : null;

    updateNav();

    if (!userId) return; // logged out: leave existing page behavior untouched

    await loadProgress();
    watchToggles();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
