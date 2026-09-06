// =====================================================================
// המשימות שלי — לוגיקת האפליקציה
// =====================================================================

(() => {
  "use strict";

  // -------------------------------------------------------------
  // State
  // -------------------------------------------------------------

  const CACHE_KEY = "hamesimot_sheli_cache_v1";
  const CATEGORY_LABELS = {
    personal: "אישי",
    home: "בית",
    work: "עבודה",
    other: "אחר",
  };

  let tasks = []; // כל המשימות (פתוחות + הושלמו), ממוינות לפי position
  let activeFilter = "all";
  let searchQuery = "";
  let editingTaskId = null;
  let deletingTaskId = null;
  let openMenuTaskId = null;
  let undoTimer = null;
  let lastDeletedTask = null;
  let dragState = null;

  // -------------------------------------------------------------
  // Elements
  // -------------------------------------------------------------

  const el = {
    greeting: document.getElementById("greetingText"),
    subtitle: document.getElementById("subtitleText"),
    searchToggle: document.getElementById("searchToggle"),
    searchBar: document.getElementById("searchBar"),
    searchInput: document.getElementById("searchInput"),
    searchClose: document.getElementById("searchClose"),
    addForm: document.getElementById("addTaskForm"),
    newTaskInput: document.getElementById("newTaskInput"),
    filters: document.querySelectorAll(".filter-chip"),
    counter: document.getElementById("taskCounter"),
    offlineBanner: document.getElementById("offlineBanner"),
    taskList: document.getElementById("taskList"),
    emptyState: document.getElementById("emptyState"),
    completedSection: document.getElementById("completedSection"),
    completedToggle: document.getElementById("completedToggle"),
    completedToggleLabel: document.getElementById("completedToggleLabel"),
    completedList: document.getElementById("completedList"),
    clearCompletedBtn: document.getElementById("clearCompletedBtn"),
    template: document.getElementById("taskItemTemplate"),

    sheetOverlay: document.getElementById("sheetOverlay"),
    editTitleInput: document.getElementById("editTitleInput"),
    dateOptions: document.getElementById("dateOptions"),
    customDateInput: document.getElementById("customDateInput"),
    editCategorySelect: document.getElementById("editCategorySelect"),
    editImportantCheckbox: document.getElementById("editImportantCheckbox"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),
    saveEditBtn: document.getElementById("saveEditBtn"),

    deleteOverlay: document.getElementById("deleteOverlay"),
    cancelDeleteBtn: document.getElementById("cancelDeleteBtn"),
    confirmDeleteBtn: document.getElementById("confirmDeleteBtn"),

    clearCompletedOverlay: document.getElementById("clearCompletedOverlay"),
    cancelClearBtn: document.getElementById("cancelClearBtn"),
    confirmClearBtn: document.getElementById("confirmClearBtn"),

    toast: document.getElementById("toast"),
    toastMessage: document.getElementById("toastMessage"),
    toastAction: document.getElementById("toastAction"),
  };

  let selectedDateOption = "none";

  // -------------------------------------------------------------
  // Helpers: dates
  // -------------------------------------------------------------

  function todayISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return toISODate(d);
  }

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function addDays(base, days) {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
  }

  const HEBREW_WEEKDAYS = ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "שבת"];
  const HEBREW_MONTHS = [
    "בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני",
    "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר",
  ];

  function formatTaskDate(isoDate) {
    if (!isoDate) return { text: "", overdue: false };

    const today = todayISO();
    const tomorrow = toISODate(addDays(new Date(), 1));

    if (isoDate === today) return { text: "היום", overdue: false };
    if (isoDate === tomorrow) return { text: "מחר", overdue: false };

    const d = new Date(isoDate + "T00:00:00");
    const label = `${HEBREW_WEEKDAYS[d.getDay()]}, ${d.getDate()} ${HEBREW_MONTHS[d.getMonth()]}`;
    const overdue = isoDate < today;

    return { text: overdue ? `באיחור · ${d.getDate()} ${HEBREW_MONTHS[d.getMonth()]}` : label, overdue };
  }

  function updateGreeting() {
    const hour = new Date().getHours();
    let greeting = "ערב טוב";
    if (hour < 12) greeting = "בוקר טוב";
    else if (hour < 18) greeting = "צהריים טובים";
    el.greeting.textContent = greeting;
  }

  // -------------------------------------------------------------
  // Cache (offline fallback)
  // -------------------------------------------------------------

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(tasks));
    } catch (e) {
      /* localStorage לא זמין - לא קריטי */
    }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // -------------------------------------------------------------
  // Toast
  // -------------------------------------------------------------

  let toastTimer = null;

  function showToast(message, actionLabel, onAction) {
    clearTimeout(toastTimer);
    el.toastMessage.textContent = message;

    if (actionLabel && onAction) {
      el.toastAction.textContent = actionLabel;
      el.toastAction.hidden = false;
      el.toastAction.onclick = () => {
        onAction();
        hideToast();
      };
    } else {
      el.toastAction.hidden = true;
      el.toastAction.onclick = null;
    }

    el.toast.hidden = false;
    toastTimer = setTimeout(hideToast, actionLabel ? 5000 : 2600);
  }

  function hideToast() {
    el.toast.hidden = true;
    clearTimeout(toastTimer);
  }

  // -------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------

  function getFilteredOpenTasks() {
    let list = tasks.filter((t) => !t.completed);

    if (activeFilter === "today") {
      const today = todayISO();
      list = list.filter((t) => t.due_date && t.due_date <= today);
    } else if (activeFilter === "important") {
      list = list.filter((t) => t.important);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q));
    }

    return list;
  }

  function getCompletedTasks() {
    return tasks
      .filter((t) => t.completed)
      .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
  }

  function render() {
    renderCounter();
    renderOpenList();
    renderCompletedList();
  }

  function renderCounter() {
    const openCount = tasks.filter((t) => !t.completed).length;
    if (openCount === 0) {
      el.counter.textContent = "הכול בוצע";
    } else if (openCount === 1) {
      el.counter.textContent = "משימה אחת פתוחה";
    } else {
      el.counter.textContent = `${openCount} משימות פתוחות`;
    }
  }

  function renderOpenList() {
    const list = getFilteredOpenTasks();
    el.taskList.innerHTML = "";

    if (list.length === 0) {
      // מציגים מצב ריק ("אין משימות פתוחות") רק כשבאמת אין משימות פתוחות
      // בכלל, בפילטר "הכול" וללא חיפוש פעיל
      const noOpenAtAll = tasks.filter((t) => !t.completed).length === 0;
      el.emptyState.hidden = !(noOpenAtAll && activeFilter === "all" && !searchQuery.trim());
      el.taskList.hidden = true;
    } else {
      el.emptyState.hidden = true;
      el.taskList.hidden = false;
      list.forEach((task) => el.taskList.appendChild(buildTaskNode(task, false)));
    }
  }

  function renderCompletedList() {
    const completed = getCompletedTasks();
    el.completedSection.hidden = completed.length === 0;
    el.completedToggleLabel.textContent = `הושלמו ${completed.length}`;
    el.clearCompletedBtn.hidden = completed.length === 0;

    el.completedList.innerHTML = "";
    completed.forEach((task) => el.completedList.appendChild(buildTaskNode(task, true)));
  }

  function buildTaskNode(task, isCompletedList) {
    const node = el.template.content.firstElementChild.cloneNode(true);
    node.dataset.id = task.id;

    if (task.completed) node.classList.add("is-completed");
    if (task.important) node.classList.add("is-important");

    node.querySelector(".task-title").textContent = task.title;

    const dateEl = node.querySelector(".task-date");
    if (task.due_date) {
      const { text, overdue } = formatTaskDate(task.due_date);
      dateEl.textContent = text;
      dateEl.classList.toggle("is-overdue", overdue && !task.completed);
    } else {
      dateEl.textContent = "";
    }

    const categoryEl = node.querySelector(".task-category");
    categoryEl.textContent = CATEGORY_LABELS[task.category] || "";

    // Checkbox
    node.querySelector(".task-checkbox").addEventListener("click", () => {
      toggleCompleted(task.id, !task.completed);
    });

    // Menu
    const menuBtn = node.querySelector(".task-menu-btn");
    const menu = node.querySelector(".task-menu");
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu(task.id, menu);
    });

    menu.querySelector('[data-action="edit"]').addEventListener("click", () => {
      closeAllMenus();
      openEditSheet(task.id);
    });
    menu.querySelector('[data-action="toggle-important"]').textContent = task.important
      ? "ביטול חשוב"
      : "סימון כחשוב";
    menu.querySelector('[data-action="toggle-important"]').addEventListener("click", () => {
      closeAllMenus();
      toggleImportant(task.id, !task.important);
    });
    menu.querySelector('[data-action="change-date"]').addEventListener("click", () => {
      closeAllMenus();
      openEditSheet(task.id, { focusDate: true });
    });
    menu.querySelector('[data-action="delete"]').addEventListener("click", () => {
      closeAllMenus();
      openDeleteConfirm(task.id);
    });

    // Click on body -> edit (not on completed list, to avoid accidental open)
    node.querySelector(".task-body").addEventListener("click", () => {
      openEditSheet(task.id);
    });

    // Drag & drop (open list only, pointer-based, long-press to start)
    if (!isCompletedList) {
      attachDragHandlers(node, task.id);
    }

    if (openMenuTaskId === task.id) {
      menu.hidden = false;
    }

    return node;
  }

  function toggleMenu(taskId, menuNode) {
    const wasOpen = openMenuTaskId === taskId;
    closeAllMenus();
    if (!wasOpen) {
      menuNode.hidden = false;
      openMenuTaskId = taskId;
    }
  }

  function closeAllMenus() {
    document.querySelectorAll(".task-menu").forEach((m) => (m.hidden = true));
    openMenuTaskId = null;
  }

  document.addEventListener("click", closeAllMenus);

  // -------------------------------------------------------------
  // Drag & drop reordering (long-press on mobile, native drag on desktop)
  // -------------------------------------------------------------

  function attachDragHandlers(node, taskId) {
    let pressTimer = null;
    let startY = 0;
    let dragging = false;

    node.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".task-checkbox") || e.target.closest(".task-menu-btn") || e.target.closest(".task-menu")) {
        return;
      }
      startY = e.clientY;
      pressTimer = setTimeout(() => {
        dragging = true;
        node.classList.add("is-dragging");
        node.setPointerCapture(e.pointerId);
        dragState = { taskId, node };
      }, 320);
    });

    node.addEventListener("pointermove", (e) => {
      if (Math.abs(e.clientY - startY) > 10 && pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      if (!dragging || !dragState) return;

      const siblings = [...el.taskList.children].filter((n) => n !== node);
      for (const sib of siblings) {
        const rect = sib.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (e.clientY < midpoint) {
          el.taskList.insertBefore(node, sib);
          return;
        }
      }
      el.taskList.appendChild(node);
    });

    function endDrag() {
      clearTimeout(pressTimer);
      pressTimer = null;
      if (dragging) {
        dragging = false;
        node.classList.remove("is-dragging");
        persistNewOrder();
      }
      dragState = null;
    }

    node.addEventListener("pointerup", endDrag);
    node.addEventListener("pointercancel", endDrag);
  }

  async function persistNewOrder() {
    const orderedIds = [...el.taskList.children].map((n) => n.dataset.id);
    const openIds = new Set(orderedIds);

    // מעדכן position מקומית לכל המשימות הפתוחות לפי הסדר החדש
    let pos = 0;
    orderedIds.forEach((id) => {
      const t = tasks.find((tk) => tk.id === id);
      if (t) t.position = pos++;
    });
    // המשימות שהושלמו שומרות position גבוה יותר כדי לא להתנגש
    tasks.filter((t) => !openIds.has(t.id)).forEach((t) => (t.position = pos++));

    saveCache();

    try {
      await TasksAPI.updatePositions(orderedIds);
    } catch (err) {
      showToast("לא הצלחנו לשמור את הסדר. נסה שוב.");
    }
  }

  // -------------------------------------------------------------
  // Actions: create / toggle / important / delete
  // -------------------------------------------------------------

  async function addTask(title) {
    const trimmed = title.trim();
    if (!trimmed) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticTask = {
      id: tempId,
      title: trimmed,
      completed: false,
      important: false,
      category: "personal",
      due_date: null,
      position: tasks.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };

    tasks.push(optimisticTask);
    saveCache();
    render();

    try {
      const created = await TasksAPI.createTask({
        title: trimmed,
        completed: false,
        important: false,
        category: "personal",
        due_date: null,
        position: optimisticTask.position,
      });
      const idx = tasks.findIndex((t) => t.id === tempId);
      if (idx !== -1) tasks[idx] = created;
      saveCache();
      render();
      showToast("המשימה נוספה");
    } catch (err) {
      tasks = tasks.filter((t) => t.id !== tempId);
      saveCache();
      render();
      showToast("לא הצלחנו לשמור. נסה שוב.");
    }
  }

  async function toggleCompleted(taskId, completed) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const prev = { ...task };
    task.completed = completed;
    task.completed_at = completed ? new Date().toISOString() : null;
    saveCache();
    render();

    try {
      await TasksAPI.updateTask(taskId, {
        completed,
        completed_at: task.completed_at,
      });
    } catch (err) {
      Object.assign(task, prev);
      saveCache();
      render();
      showToast("לא הצלחנו לשמור. נסה שוב.");
    }
  }

  async function toggleImportant(taskId, important) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const prev = task.important;
    task.important = important;
    saveCache();
    render();

    try {
      await TasksAPI.updateTask(taskId, { important });
    } catch (err) {
      task.important = prev;
      saveCache();
      render();
      showToast("לא הצלחנו לשמור. נסה שוב.");
    }
  }

  function openDeleteConfirm(taskId) {
    deletingTaskId = taskId;
    el.deleteOverlay.hidden = false;
  }

  el.cancelDeleteBtn.addEventListener("click", () => {
    el.deleteOverlay.hidden = true;
    deletingTaskId = null;
  });

  el.confirmDeleteBtn.addEventListener("click", async () => {
    const taskId = deletingTaskId;
    el.deleteOverlay.hidden = true;
    deletingTaskId = null;
    if (taskId) await deleteTask(taskId);
  });

  async function deleteTask(taskId) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    lastDeletedTask = { ...task };
    tasks = tasks.filter((t) => t.id !== taskId);
    saveCache();
    render();

    clearTimeout(undoTimer);
    showToast("המשימה נמחקה", "ביטול", undoTask);

    undoTimer = setTimeout(async () => {
      if (!lastDeletedTask || lastDeletedTask.id !== taskId) return;
      try {
        await TasksAPI.deleteTask(taskId);
      } catch (err) {
        // אם המחיקה בשרת נכשלת, המשימה כבר לא מוצגת; ננסה שוב בפעם הבאה שנטען
      }
      lastDeletedTask = null;
    }, 5000);
  }

  async function undoTask() {
    if (!lastDeletedTask) return;
    tasks.push(lastDeletedTask);
    tasks.sort((a, b) => a.position - b.position);
    saveCache();
    render();
    clearTimeout(undoTimer);
    lastDeletedTask = null;
  }

  // -------------------------------------------------------------
  // Clear completed
  // -------------------------------------------------------------

  el.clearCompletedBtn.addEventListener("click", () => {
    el.clearCompletedOverlay.hidden = false;
  });

  el.cancelClearBtn.addEventListener("click", () => {
    el.clearCompletedOverlay.hidden = true;
  });

  el.confirmClearBtn.addEventListener("click", async () => {
    el.clearCompletedOverlay.hidden = true;
    const completedIds = getCompletedTasks().map((t) => t.id);
    tasks = tasks.filter((t) => !completedIds.includes(t.id));
    saveCache();
    render();

    try {
      await Promise.all(completedIds.map((id) => TasksAPI.deleteTask(id)));
      showToast("משימות שהושלמו נוקו");
    } catch (err) {
      showToast("חלק מהמשימות לא נמחקו בשרת. נסה שוב.");
    }
  });

  el.completedToggle.addEventListener("click", () => {
    const expanded = el.completedToggle.getAttribute("aria-expanded") === "true";
    el.completedToggle.setAttribute("aria-expanded", String(!expanded));
    el.completedList.hidden = expanded;
  });

  // -------------------------------------------------------------
  // Edit sheet
  // -------------------------------------------------------------

  function openEditSheet(taskId) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    editingTaskId = taskId;
    el.editTitleInput.value = task.title;
    el.editCategorySelect.value = task.category || "personal";
    el.editImportantCheckbox.checked = !!task.important;

    if (!task.due_date) {
      selectedDateOption = "none";
      el.customDateInput.hidden = true;
    } else if (task.due_date === todayISO()) {
      selectedDateOption = "today";
      el.customDateInput.hidden = true;
    } else if (task.due_date === toISODate(addDays(new Date(), 1))) {
      selectedDateOption = "tomorrow";
      el.customDateInput.hidden = true;
    } else {
      selectedDateOption = "pick";
      el.customDateInput.hidden = false;
      el.customDateInput.value = task.due_date;
    }
    updateDateChipsUI();

    el.sheetOverlay.hidden = false;
    setTimeout(() => el.editTitleInput.focus(), 50);
  }

  function closeEditSheet() {
    el.sheetOverlay.hidden = true;
    editingTaskId = null;
  }

  el.cancelEditBtn.addEventListener("click", closeEditSheet);
  el.sheetOverlay.addEventListener("click", (e) => {
    if (e.target === el.sheetOverlay) closeEditSheet();
  });

  function updateDateChipsUI() {
    el.dateOptions.querySelectorAll(".date-chip").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.dateOption === selectedDateOption);
    });
  }

  el.dateOptions.addEventListener("click", (e) => {
    const chip = e.target.closest(".date-chip");
    if (!chip) return;
    selectedDateOption = chip.dataset.dateOption;
    el.customDateInput.hidden = selectedDateOption !== "pick";
    if (selectedDateOption === "pick") {
      el.customDateInput.value = el.customDateInput.value || todayISO();
      el.customDateInput.focus();
    }
    updateDateChipsUI();
  });

  function resolveSelectedDate() {
    if (selectedDateOption === "today") return todayISO();
    if (selectedDateOption === "tomorrow") return toISODate(addDays(new Date(), 1));
    if (selectedDateOption === "pick") return el.customDateInput.value || null;
    return null;
  }

  el.saveEditBtn.addEventListener("click", async () => {
    const taskId = editingTaskId;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const newTitle = el.editTitleInput.value.trim();
    if (!newTitle) {
      showToast("שם המשימה לא יכול להיות ריק");
      return;
    }

    const changes = {
      title: newTitle,
      category: el.editCategorySelect.value,
      important: el.editImportantCheckbox.checked,
      due_date: resolveSelectedDate(),
    };

    const prev = { ...task };
    Object.assign(task, changes);
    saveCache();
    render();
    closeEditSheet();

    try {
      await TasksAPI.updateTask(taskId, changes);
      showToast("המשימה עודכנה");
    } catch (err) {
      Object.assign(task, prev);
      saveCache();
      render();
      showToast("לא הצלחנו לשמור. נסה שוב.");
    }
  });

  // -------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------

  el.filters.forEach((btn) => {
    btn.addEventListener("click", () => {
      el.filters.forEach((b) => {
        b.classList.remove("is-active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      activeFilter = btn.dataset.filter;
      render();
    });
  });

  // -------------------------------------------------------------
  // Search
  // -------------------------------------------------------------

  el.searchToggle.addEventListener("click", () => {
    el.searchBar.hidden = false;
    el.searchInput.focus();
  });

  el.searchClose.addEventListener("click", () => {
    el.searchBar.hidden = true;
    el.searchInput.value = "";
    searchQuery = "";
    render();
  });

  el.searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    render();
  });

  // -------------------------------------------------------------
  // Add task form
  // -------------------------------------------------------------

  el.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = el.newTaskInput.value;
    if (!value.trim()) return;
    addTask(value);
    el.newTaskInput.value = "";
    el.newTaskInput.focus();
  });

  // -------------------------------------------------------------
  // Offline detection
  // -------------------------------------------------------------

  function updateOnlineStatus() {
    el.offlineBanner.hidden = navigator.onLine;
  }

  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);

  // -------------------------------------------------------------
  // Init
  // -------------------------------------------------------------

  async function init() {
    updateGreeting();
    updateOnlineStatus();

    const cached = loadCache();
    if (cached && cached.length) {
      tasks = cached;
      render();
    }

    if (!TasksAPI.isConfigured()) {
      el.counter.textContent = "יש להגדיר חיבור ל-Supabase בקובץ config.js";
      return;
    }

    try {
      const remote = await TasksAPI.fetchTasks();
      tasks = remote;
      saveCache();
      render();
    } catch (err) {
      if (!cached) {
        el.counter.textContent = "לא הצלחנו לטעון משימות";
      }
    }
  }

  init();

  // -------------------------------------------------------------
  // Service worker registration
  // -------------------------------------------------------------

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {
        /* לא קריטי אם ה-service worker לא נרשם */
      });
    });
  }
})();
