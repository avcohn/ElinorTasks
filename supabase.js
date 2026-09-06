// =====================================================================
// המשימות שלי — שכבת גישה ל-Supabase
// =====================================================================
// הקובץ הזה אחראי אך ורק על תקשורת עם Supabase: התחברות אנונימית,
// ושליפה/שמירה/עדכון/מחיקה של משימות. app.js לא נוגע ב-Supabase
// ישירות, אלא קורא לפונקציות מהקובץ הזה.
// =====================================================================

const TasksAPI = (() => {
  let client = null;
  let currentUserId = null;
  let ready = null; // Promise שמסתיים כשיש חיבור + משתמש אנונימי

  function isConfigured() {
    return (
      typeof SUPABASE_CONFIG !== "undefined" &&
      SUPABASE_CONFIG.url &&
      SUPABASE_CONFIG.anonKey &&
      !SUPABASE_CONFIG.url.includes("PASTE_YOUR") &&
      !SUPABASE_CONFIG.anonKey.includes("PASTE_YOUR")
    );
  }

  async function init() {
    if (ready) return ready;

    ready = (async () => {
      if (!isConfigured()) {
        throw new Error("NOT_CONFIGURED");
      }

      client = window.supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
          },
        }
      );

      // בודקים אם כבר יש סשן אנונימי שמור בדפדפן הזה
      const { data: sessionData } = await client.auth.getSession();

      if (sessionData && sessionData.session) {
        currentUserId = sessionData.session.user.id;
      } else {
        // אין סשן - יוצרים משתמש אנונימי חדש (פעם ראשונה בדפדפן הזה)
        const { data, error } = await client.auth.signInAnonymously();
        if (error) throw error;
        currentUserId = data.user.id;
      }

      return true;
    })();

    return ready;
  }

  async function fetchTasks() {
    await init();
    const { data, error } = await client
      .from("tasks")
      .select("*")
      .order("position", { ascending: true });

    if (error) throw error;
    return data;
  }

  async function createTask(task) {
    await init();
    const { data, error } = await client
      .from("tasks")
      .insert([{ ...task, owner_id: currentUserId }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function updateTask(id, changes) {
    await init();
    const { data, error } = await client
      .from("tasks")
      .update(changes)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function deleteTask(id) {
    await init();
    const { error } = await client.from("tasks").delete().eq("id", id);
    if (error) throw error;
  }

  async function updatePositions(orderedIds) {
    await init();
    // מעדכן position אחד-אחד. לכמות משימות רגילה (עשרות) זה מהיר מספיק.
    const updates = orderedIds.map((id, index) =>
      client.from("tasks").update({ position: index }).eq("id", id)
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed) throw failed.error;
  }

  return {
    isConfigured,
    init,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    updatePositions,
  };
})();
