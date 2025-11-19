"use strict";

// --- Estado y constantes ---
const STORAGE_KEY = "finanzas_personales_v1";
const PREFS_KEY = "finanzas_prefs_v1";
const CATEGORIES_KEY = "finanzas_categories_v1";

const DEFAULT_CATEGORIES = [
  "Nómina",
  "Alquiler",
  "Supermercado",
  "Transporte",
  "Ocio",
  "Restaurantes",
  "Ropa y accesorios",
  "Suscripciones",
  "Salud",
  "Bizum",
  "Otros",
];

let categories = [...DEFAULT_CATEGORIES];

/** @type {Array<{id:string,type:'income'|'expense',amount:number,category:string,date:string,note:string}>} */
let transactions = [];

let categoryChart = null;
let timelineChart = null;

let prefs = {
  theme: "dark",
};

// Orden de tabla
let sortField = "date";
let sortDirection = "desc";

// Edición de movimientos
let editingTxId = null;

// Colores fijos por categoría
const FIXED_CATEGORY_COLORS = {
  "Nómina": "#22c55e",
  "Alquiler": "#f97316",
  "Supermercado": "#0ea5e9",
  "Transporte": "#6366f1",
  "Ocio": "#ec4899",
  "Restaurantes": "#facc15",
  "Ropa y accesorios": "#a855f7",
  "Suscripciones": "#06b6d4",
  "Salud": "#10b981",
  "Bizum": "#f97316",
  "Otros": "#64748b",
};

const CATEGORY_COLOR_CACHE = {};
const CATEGORY_COLOR_PALETTE = [
  "#0ea5e9",
  "#22c55e",
  "#6366f1",
  "#e11d48",
  "#f97316",
  "#a855f7",
  "#14b8a6",
  "#facc15",
  "#4b5563",
  "#8b5cf6",
];

// Reglas para inferir categorías al importar
const AUTO_CATEGORY_RULES = [
  {
    category: "Bizum",
    keywords: ["bizum"],
  },
  {
    category: "Restaurantes",
    keywords: [
      "mc",
      "burger",
      "bk",
      "kfc",
      "pizz",
      "dp",
      "restaurant",
      "keba",
      "sushi",
      "sumo",
      "food",
      "japo",
    ],
  },
  {
    category: "Supermercado",
    keywords: [
      "mercadona",
      "carrefour",
      "dia ",
      "suma",
      "lidl",
      "aldi",
      "hipercor",
      "supermercado",
      "ahorro",
      "super",
      "alimentac",
      "escla",
      "condis",
      "home",
      "drim",
      "goiko",
    ],
  },
  {
    category: "Ropa y accesorios",
    keywords: [
      "zara",
      "bear",
      "pull",
      "stradivarius",
      "bershka",
      "dutti",
      "h&m",
      "hm",
      "primark",
      "nike",
      "adidas",
      "sprinter",
      "decathlon",
      "foot locker",
      "lefties",
      "snipes",
      "cn",
    ],
  },
  {
    category: "Transporte",
    keywords: [
      "uber",
      "cabify",
      "renfe",
      "metro",
      "bus",
      "tmb",
      "taxi",
      "repsol",
      "cepsa",
      "bp ",
      "galp",
      "fgc",
      "mobilit",
      "gasolin",
    ],
  },
  {
    category: "Suscripciones",
    keywords: ["netf", "spot", "hbo", "max", "prim", "disn", "appl", "premium", "piscin", "esports"],
  },
  {
    category: "Nómina",
    type: "income",
    keywords: ["nómina", "nomina", "salari", "payroll"],
  },
  {
    category: "Salud",
    keywords: ["farmacia", "dent", "clinica", "clínica", "seguro salud", "odont"],
  },
  {
    category: "Ocio",
    keywords: [
      "steam",
      "playstation",
      "psn",
      "xbox",
      "game ",
      "tick",
      "entradas",
      "cine",
      "microsoft",
      "sumup",
      "bolera",
      "gran clips",
      "pay",
      "sala",
      "ovella",
      "fourvenues",
      "helader",
    ],
  },
];

// --- Utilidades ---
function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(16).slice(2);
}

function formatCurrency(value) {
  return value.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch {
    // Silenciar errores
  }
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getColorForCategory(name) {
  if (!name) return "#64748b";
  if (CATEGORY_COLOR_CACHE[name]) return CATEGORY_COLOR_CACHE[name];
  if (FIXED_CATEGORY_COLORS[name]) {
    CATEGORY_COLOR_CACHE[name] = FIXED_CATEGORY_COLORS[name];
    return CATEGORY_COLOR_CACHE[name];
  }
  const key = name.toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const color = CATEGORY_COLOR_PALETTE[hash % CATEGORY_COLOR_PALETTE.length];
  CATEGORY_COLOR_CACHE[name] = color;
  return color;
}

// --- Categorías dinámicas ---
function loadCategories() {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (!raw) {
      categories = [...DEFAULT_CATEGORIES];
      return;
    }
    const extra = JSON.parse(raw);
    const set = new Set(DEFAULT_CATEGORIES);
    if (Array.isArray(extra)) {
      extra.forEach((c) => {
        const name = String(c).trim();
        if (name) set.add(name);
      });
    }
    categories = Array.from(set).sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" }),
    );
  } catch {
    categories = [...DEFAULT_CATEGORIES];
  }
}

function saveCategories() {
  try {
    const extra = categories.filter((c) => !DEFAULT_CATEGORIES.includes(c));
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(extra));
  } catch {
    // Silenciar errores
  }
}

function addCategory(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (!categories.includes(trimmed)) {
    categories.push(trimmed);
    categories.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    saveCategories();
    populateCategoryUI();
  }
}

function populateCategoryUI() {
  const categorySelect = document.getElementById("category");
  const filterCategorySelect = document.getElementById("filterCategory");

  if (categorySelect) {
    const current = categorySelect.value;
    categorySelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecciona una categoría";
    categorySelect.appendChild(placeholder);

    categories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      categorySelect.appendChild(opt);
    });

    const addOpt = document.createElement("option");
    addOpt.value = "__new__";
    addOpt.textContent = "➕ Añadir categoría...";
    categorySelect.appendChild(addOpt);

    if (current && current !== "__new__" && categories.includes(current)) {
      categorySelect.value = current;
    }
  }

  if (filterCategorySelect) {
    const current = filterCategorySelect.value;
    filterCategorySelect.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "Todas las categorías";
    filterCategorySelect.appendChild(allOpt);

    categories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      filterCategorySelect.appendChild(opt);
    });

    if (current && (current === "all" || categories.includes(current))) {
      filterCategorySelect.value = current;
    }
  }
}

function syncCategoriesFromTransactions() {
  let changed = false;
  transactions.forEach((t) => {
    const name = (t.category || "").trim();
    if (name && !categories.includes(name)) {
      categories.push(name);
      changed = true;
    }
  });
  if (changed) {
    categories.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    saveCategories();
  }
}

// --- Preferencias (tema) ---
function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) {
      // Respetar el tema del sistema si no hay preferencia guardada
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
        prefs.theme = "light";
      } else {
        prefs.theme = "dark";
      }
      return;
    }
    const data = JSON.parse(raw);
    if (data && typeof data === "object") {
      if (data.theme === "light" || data.theme === "dark") prefs.theme = data.theme;
    }
  } catch {
    // Dejar tema por defecto
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Silenciar errores
  }
}

function updateThemeToggleLabel() {
  const btnToggle = document.getElementById("btnToggleTheme");
  if (!btnToggle) return;
  if (prefs.theme === "light") {
    btnToggle.textContent = "🌙 Modo oscuro";
  } else {
    btnToggle.textContent = "☀️ Modo claro";
  }
}

function applyTheme() {
  const body = document.body;
  if (prefs.theme === "light") {
    body.classList.add("theme-light");
  } else {
    body.classList.remove("theme-light");
  }
  updateThemeToggleLabel();
}

function applyAccent() {
  const root = document.documentElement;
  const accent = "#38bdf8";
  const accentSoft = "rgba(56, 189, 248, 0.12)";
  const accentStrong = "rgba(56, 189, 248, 0.25)";
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-soft", accentSoft);
  root.style.setProperty("--accent-strong", accentStrong);
}

function initPrefsUI() {
  const btnToggle = document.getElementById("btnToggleTheme");
  if (btnToggle) {
    btnToggle.addEventListener("click", () => {
      prefs.theme = prefs.theme === "dark" ? "light" : "dark";
      applyTheme();
      savePrefs();
      refreshUI();
    });
  }

  applyAccent();
  applyTheme();
}

// --- Filtros globales ---
function getFilteredTransactions() {
  let result = [...transactions];

  const rangeSelect = document.getElementById("dateRange");
  const range = rangeSelect ? rangeSelect.value : "30";

  if (range !== "all") {
    const now = new Date();
    if (range === "7" || range === "30") {
      const days = parseInt(range, 10);
      const ms = days * 24 * 60 * 60 * 1000;
      const minDate = new Date(now.getTime() - ms);
      result = result.filter((t) => new Date(t.date) >= minDate);
    } else if (range === "ytd") {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      result = result.filter((t) => new Date(t.date) >= yearStart);
    }
  }

  const filterTypeEl = document.getElementById("filterType");
  const filterType = filterTypeEl ? filterTypeEl.value : "all";

  const filterCategoryEl = document.getElementById("filterCategory");
  const filterCategory = filterCategoryEl ? filterCategoryEl.value : "all";

  const fromDateEl = document.getElementById("historyFromDate");
  const toDateEl = document.getElementById("historyToDate");
  const fromDate = fromDateEl ? fromDateEl.value : "";
  const toDate = toDateEl ? toDateEl.value : "";

  const searchTextEl = document.getElementById("searchText");
  const searchText = searchTextEl ? searchTextEl.value.trim().toLowerCase() : "";

  result = result.filter((t) => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (filterCategory !== "all" && t.category !== filterCategory) return false;
    if (fromDate && t.date < fromDate) return false;
    if (toDate && t.date > toDate) return false;
    if (searchText) {
      const haystack = (t.category + " " + (t.note || "")).toLowerCase();
      if (!haystack.includes(searchText)) return false;
    }
    return true;
  });

  return result;
}

// --- Resumen ---
function renderSummary() {
  const filtered = getFilteredTransactions();

  const incomeTotal = filtered
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const expenseTotal = filtered
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = incomeTotal - expenseTotal;

  document.getElementById("summaryIncome").textContent = formatCurrency(incomeTotal);
  document.getElementById("summaryExpense").textContent = formatCurrency(expenseTotal);
  document.getElementById("summaryBalance").textContent = formatCurrency(balance);
  document.getElementById("summaryCount").textContent = filtered.length.toString();
}

// --- Ordenación tabla ---
function sortTransactionsForTable(list) {
  return list.sort((a, b) => {
    let res = 0;
    if (sortField === "date") {
      res = a.date.localeCompare(b.date);
    } else if (sortField === "amount") {
      res = a.amount - b.amount;
    } else if (sortField === "category") {
      const ac = a.category || "";
      const bc = b.category || "";
      res = ac.localeCompare(bc, "es", { sensitivity: "base" });
    } else if (sortField === "note") {
      const an = a.note || "";
      const bn = b.note || "";
      res = an.localeCompare(bn, "es", { sensitivity: "base" });
    }

    if (sortDirection === "desc") res = -res;
    if (res !== 0) return res;
    return b.date.localeCompare(a.date);
  });
}

function updateSortIcons() {
  const buttons = document.querySelectorAll(".sort-btn");
  buttons.forEach((btn) => {
    const icon = btn.querySelector(".sort-icon");
    const field = btn.dataset.field;
    if (!icon) return;
    if (field === sortField) {
      btn.classList.add("active");
      icon.textContent = sortDirection === "asc" ? "▲" : "▼";
    } else {
      btn.classList.remove("active");
      icon.textContent = "↕";
    }
  });
}

function setupSorting() {
  const buttons = document.querySelectorAll(".sort-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.field;
      if (!field) return;
      if (sortField === field) {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
      } else {
        sortField = field;
        sortDirection = field === "date" ? "desc" : "asc";
      }
      updateSortIcons();
      renderTable();
    });
  });
  updateSortIcons();
}

// --- Tabla ---
function renderTable() {
  const tbody = document.getElementById("txTableBody");
  const tableEmpty = document.getElementById("tableEmpty");
  const tableEmptyText = document.getElementById("tableEmptyText");

  tbody.innerHTML = "";

  const filtered = getFilteredTransactions();

  document.getElementById("tableCount").textContent = `${filtered.length} movimiento${
    filtered.length === 1 ? "" : "s"
  }`;

  if (filtered.length === 0) {
    tableEmpty.style.display = "flex";
    if (!transactions.length) {
      tableEmptyText.textContent =
        'Sin movimientos. Registra un ingreso o gasto con el botón "Nuevo movimiento".';
    } else {
      tableEmptyText.textContent =
        "No hay resultados con los filtros actuales. Puedes limpiar filtros para ver todo.";
    }
    return;
  }

  tableEmpty.style.display = "none";

  sortTransactionsForTable(filtered);

  for (const t of filtered) {
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = formatDate(t.date);
    tr.appendChild(tdDate);

    const tdType = document.createElement("td");
    const typeTag = document.createElement("span");
    typeTag.className = `tag ${t.type === "income" ? "income" : "expense"}`;
    typeTag.textContent = t.type === "income" ? "Ingreso" : "Gasto";
    tdType.appendChild(typeTag);
    tr.appendChild(tdType);

    const tdCat = document.createElement("td");
    tdCat.textContent = t.category || "-";
    tr.appendChild(tdCat);

    const tdNote = document.createElement("td");
    tdNote.textContent = t.note || "—";
    tr.appendChild(tdNote);

    const tdAmount = document.createElement("td");
    tdAmount.className = `amount ${t.type}`;
    const sign = t.type === "expense" ? "-" : "+";
    tdAmount.textContent = `${sign} ${formatCurrency(t.amount)}`;
    tr.appendChild(tdAmount);

    const tdActions = document.createElement("td");

    const editBtn = document.createElement("button");
    editBtn.textContent = "Editar";
    editBtn.className = "edit-btn";
    editBtn.type = "button";
    editBtn.addEventListener("click", () => {
      openEditTransaction(t);
    });
    tdActions.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "Eliminar";
    delBtn.className = "delete-btn";
    delBtn.type = "button";
    delBtn.addEventListener("click", () => {
      if (confirm("¿Eliminar este movimiento?")) {
        deleteTransaction(t.id);
      }
    });
    tdActions.appendChild(delBtn);

    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  }
}

function deleteTransaction(id) {
  transactions = transactions.filter((t) => t.id !== id);
  saveToStorage();
  refreshUI();
}

// --- Gráficos ---
function renderCharts() {
  const categoryCanvas = document.getElementById("categoryChart");
  const categoryEmpty = document.getElementById("categoryChartEmpty");
  const timelineCanvas = document.getElementById("timelineChart");
  const timelineEmpty = document.getElementById("timelineChartEmpty");

  const filtered = getFilteredTransactions();

  // Gráfico por categoría (gastos)
  const expenseTx = filtered.filter((t) => t.type === "expense");

  if (categoryChart) {
    categoryChart.destroy();
    categoryChart = null;
  }

  if (expenseTx.length === 0) {
    categoryCanvas.style.display = "none";
    categoryEmpty.textContent = "No hay gastos con los filtros actuales.";
    categoryEmpty.style.display = "block";
  } else {
    const byCategory = {};
    expenseTx.forEach((t) => {
      const cat = t.category || "Sin categoría";
      byCategory[cat] = (byCategory[cat] || 0) + t.amount;
    });

    const labels = Object.keys(byCategory);
    const data = Object.values(byCategory);

    if (labels.length <= 1) {
      categoryCanvas.style.display = "none";
      categoryEmpty.textContent =
        "Hace falta más de una categoría para mostrar el gráfico de gastos.";
      categoryEmpty.style.display = "block";
    } else {
      categoryCanvas.style.display = "block";
      categoryEmpty.style.display = "none";

      const textColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--text-main")
          .trim() || "#111827";

      const total = data.reduce((sum, val) => sum + val, 0);
      const backgroundColors = labels.map((cat) => getColorForCategory(cat));
      const borderColors = backgroundColors.map((c) => c);

      categoryChart = new Chart(categoryCanvas.getContext("2d"), {
        type: "doughnut",
        data: {
          labels,
          datasets: [
            {
              data,
              backgroundColor: backgroundColors,
              borderColor: borderColors,
              borderWidth: 1,
            },
          ],
        },
        options: {
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                color: textColor,
                font: { size: 10 },
              },
            },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  const label = ctx.label || "";
                  const value = ctx.raw || 0;
                  const percent = total ? (value / total) * 100 : 0;
                  return `${label}: ${formatCurrency(value)} (${percent.toFixed(1)}%)`;
                },
              },
            },
          },
        },
      });
    }
  }

  // Gráfico temporal
  if (timelineChart) {
    timelineChart.destroy();
    timelineChart = null;
  }

  if (filtered.length === 0) {
    timelineCanvas.style.display = "none";
    timelineEmpty.style.display = "block";
  } else {
    timelineCanvas.style.display = "block";
    timelineEmpty.style.display = "none";

    const months = new Set();
    const incomeByMonth = {};
    const expenseByMonth = {};

    filtered.forEach((t) => {
      const [y, m] = t.date.split("-");
      const key = `${y}-${m}`;
      months.add(key);
      if (t.type === "income") {
        incomeByMonth[key] = (incomeByMonth[key] || 0) + t.amount;
      } else {
        expenseByMonth[key] = (expenseByMonth[key] || 0) + t.amount;
      }
    });

    const monthKeys = Array.from(months).sort();
    const monthLabels = monthKeys.map((key) => {
      const [y, m] = key.split("-");
      const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
      return d.toLocaleString("es-ES", { month: "short", year: "2-digit" });
    });

    const incomeData = monthKeys.map((key) => incomeByMonth[key] || 0);
    const expenseData = monthKeys.map((key) => expenseByMonth[key] || 0);

    const ctx = timelineCanvas.getContext("2d");

    const textColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--text-soft")
        .trim() || "#6b7280";

    const mainTextColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--text-main")
        .trim() || "#111827";

    timelineChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: monthLabels,
        datasets: [
          {
            type: "bar",
            label: "Ingresos",
            data: incomeData,
            order: 1,
          },
          {
            type: "bar",
            label: "Gastos",
            data: expenseData,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: {
              color: mainTextColor,
              font: { size: 10 },
            },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const v = ctx.parsed.y || 0;
                const label = ctx.dataset.label || "";
                const sign = v < 0 ? "-" : "";
                const abs = Math.abs(v);
                return `${label}: ${sign}${abs.toLocaleString("es-ES", {
                  style: "currency",
                  currency: "EUR",
                  minimumFractionDigits: 2,
                })}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: textColor,
              font: { size: 10 },
            },
          },
          y: {
            ticks: {
              color: textColor,
              font: { size: 10 },
              callback: function (value) {
                return value.toLocaleString("es-ES", {
                  style: "currency",
                  currency: "EUR",
                  maximumFractionDigits: 0,
                });
              },
            },
          },
        },
      },
    });
  }
}

// --- CSV helpers ---
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function csvParseLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// Categoría automática a partir del concepto
function inferCategory(note, amount, type) {
  if (!note) return "Otros";
  const t = note.toLowerCase();

  for (const rule of AUTO_CATEGORY_RULES) {
    if (rule.type && rule.type !== type) continue;
    if (rule.keywords.some((kw) => t.includes(kw))) {
      return rule.category;
    }
  }

  return "Otros";
}

function exportCsv() {
  if (!transactions.length) {
    alert("No hay datos para exportar.");
    return;
  }

  const header = ["id", "type", "amount", "category", "date", "note"];
  const lines = [header.join(",")];

  transactions.forEach((t) => {
    const row = [
      csvEscape(t.id),
      csvEscape(t.type),
      csvEscape(t.amount),
      csvEscape(t.category || ""),
      csvEscape(t.date),
      csvEscape(t.note || ""),
    ];
    lines.push(row.join(","));
  });

  const csvContent = lines.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  a.href = url;
  a.download = `finanzas-${yyyy}${mm}${dd}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importCsv(text) {
  try {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      alert("El CSV no contiene datos.");
      return;
    }

    const headerLine = lines[0];
    const lowerHeader = headerLine.toLowerCase();

    // Formato Imagin "Concepto/Concepte;Fecha/Data;Importe/Import;Saldo disponible"
    const isImaginFormat =
      (lowerHeader.includes("concepto") || lowerHeader.includes("concepte")) &&
      (lowerHeader.includes("fecha") || lowerHeader.includes("data")) &&
      (lowerHeader.includes("importe") || lowerHeader.includes("import"));

    if (isImaginFormat) {
      const headerCells = headerLine.split(";").map((h) => h.trim().toLowerCase());
      const idxConcepto = headerCells.findIndex(
        (h) => h === "concepto" || h === "concepte",
      );
      const idxFecha = headerCells.findIndex((h) => h === "fecha" || h === "data");
      const idxImporte = headerCells.findIndex((h) => h === "importe" || h === "import");

      if (idxConcepto === -1 || idxFecha === -1 || idxImporte === -1) {
        alert("No se reconoce el formato del CSV de Imagin (faltan columnas).");
        return;
      }

      let importedCount = 0;

      function toIsoDate(fechaStr) {
        if (!fechaStr) return "";
        const trimmed = fechaStr.trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
          const [d, m, y] = trimmed.split("/");
          return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          return trimmed;
        }
        const d = new Date(trimmed);
        if (isNaN(d.getTime())) return "";
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      }

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cells = line.split(";");
        if (cells.length <= Math.max(idxConcepto, idxFecha, idxImporte)) continue;

        const rawConcepto = (cells[idxConcepto] || "").trim().replace(/^"(.*)"$/, "$1");
        const rawFecha = (cells[idxFecha] || "").trim().replace(/^"(.*)"$/, "$1");
        const rawImporte = (cells[idxImporte] || "").trim().replace(/^"(.*)"$/, "$1");

        if (!rawImporte || !rawFecha) continue;

        const numericPart = rawImporte.replace(/[^\d,\.\-]/g, "");
        if (!numericPart) continue;

        const normalized = numericPart.replace(/\./g, "").replace(",", ".");

        let amountNum = parseFloat(normalized);
        if (!amountNum || amountNum === 0 || isNaN(amountNum)) continue;

        const type = amountNum < 0 ? "expense" : "income";
        const amount = Math.abs(amountNum);

        const dateIso = toIsoDate(rawFecha);
        if (!dateIso) continue;

        const category = inferCategory(rawConcepto, amount, type);

        const tx = {
          id: uuid(),
          type,
          amount,
          category,
          date: dateIso,
          note: rawConcepto,
        };

        transactions.push(tx);
        importedCount++;
      }

      if (!importedCount) {
        alert("No se han importado movimientos desde el CSV de Imagin.");
      } else {
        saveToStorage();
        syncCategoriesFromTransactions();
        populateCategoryUI();
        refreshUI();
        alert(`Importados ${importedCount} movimiento(s) desde el CSV de Imagin.`);
      }

      return;
    }

    // CSV genérico id,type,amount,category,date,note
    const headerCells = csvParseLine(lines[0]).map((h) => h.trim().toLowerCase());
    const idxId = headerCells.indexOf("id");
    const idxType = headerCells.indexOf("type");
    const idxAmount = headerCells.indexOf("amount");
    const idxCategory = headerCells.indexOf("category");
    const idxDate = headerCells.indexOf("date");
    const idxNote = headerCells.indexOf("note");

    if (idxType === -1 || idxAmount === -1 || idxCategory === -1 || idxDate === -1) {
      alert("El CSV debe tener columnas: type, amount, category, date (o formato Imagin).");
      return;
    }

    let importedCount = 0;
    const existingIds = new Set(transactions.map((t) => t.id));

    for (let i = 1; i < lines.length; i++) {
      const cells = csvParseLine(lines[i]);
      if (cells.length === 1 && cells[0].trim() === "") continue;

      const type = (cells[idxType] || "").trim();
      const amountRaw = (cells[idxAmount] || "").trim();
      const category = (cells[idxCategory] || "").trim();
      const date = (cells[idxDate] || "").trim();
      const note = idxNote !== -1 ? (cells[idxNote] || "").trim() : "";

      if (!type || !amountRaw || !category || !date) {
        continue;
      }

      const amount = parseFloat(amountRaw.replace(",", "."));
      if (!amount || amount <= 0) continue;

      let id = idxId !== -1 ? (cells[idxId] || "").trim() : "";
      if (!id || existingIds.has(id)) {
        id = uuid();
      }

      existingIds.add(id);

      transactions.push({
        id,
        type: type === "expense" ? "expense" : "income",
        amount,
        category,
        date,
        note,
      });

      importedCount++;
    }

    if (!importedCount) {
      alert("No se han importado movimientos.");
    } else {
      saveToStorage();
      syncCategoriesFromTransactions();
      populateCategoryUI();
      refreshUI();
      alert(`Importados ${importedCount} movimiento(s) desde el CSV.`);
    }
  } catch (err) {
    console.error(err);
    alert(
      "Ha ocurrido un problema al leer el CSV. Asegúrate de que sea un archivo exportado desde Imagin o desde esta aplicación.",
    );
  }
}

// --- UI global ---
function refreshUI() {
  renderSummary();
  renderTable();
  renderCharts();
}

// --- Modal nuevo / editar movimiento ---
function openNewTxModal() {
  editingTxId = null;
  const modal = document.getElementById("newTxModal");
  if (!modal) return;
  const formTitle = document.getElementById("formTitle");
  const submitBtn = document.getElementById("formSubmitBtn");
  const form = document.getElementById("txForm");
  const typeSelect = document.getElementById("type");
  const dateInput = document.getElementById("date");
  const amountInput = document.getElementById("amount");

  if (form) form.reset();
  if (typeSelect) typeSelect.value = "income";
  if (dateInput) dateInput.value = todayISO();
  if (formTitle) formTitle.textContent = "Nuevo movimiento";
  if (submitBtn) submitBtn.textContent = "Guardar movimiento";

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");

  // Foco en el importe para escribir más rápido
  if (amountInput) {
    setTimeout(() => {
      amountInput.focus();
      amountInput.select();
    }, 10);
  }
}

function closeNewTxModal() {
  const modal = document.getElementById("newTxModal");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
  editingTxId = null;
}

function openEditTransaction(tx) {
  editingTxId = tx.id;
  const modal = document.getElementById("newTxModal");
  if (!modal) return;

  const formTitle = document.getElementById("formTitle");
  const submitBtn = document.getElementById("formSubmitBtn");
  const typeSelect = document.getElementById("type");
  const amountInput = document.getElementById("amount");
  const dateInput = document.getElementById("date");
  const categorySelect = document.getElementById("category");
  const noteInput = document.getElementById("note");

  if (formTitle) formTitle.textContent = "Editar movimiento";
  if (submitBtn) submitBtn.textContent = "Guardar cambios";
  if (typeSelect) typeSelect.value = tx.type;
  if (amountInput) amountInput.value = tx.amount.toString().replace(".", ",");
  if (dateInput) dateInput.value = tx.date;

  if (categorySelect) {
    if (tx.category && !categories.includes(tx.category)) {
      addCategory(tx.category);
    }
    categorySelect.value = tx.category || "";
  }
  if (noteInput) noteInput.value = tx.note || "";

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");

  if (amountInput) {
    setTimeout(() => {
      amountInput.focus();
      amountInput.select();
    }, 10);
  }
}

// --- Formulario ---
function setupForm() {
  const form = document.getElementById("txForm");
  if (!form) return;
  const dateInput = document.getElementById("date");
  const categorySelect = document.getElementById("category");
  const amountInput = document.getElementById("amount");

  if (dateInput) dateInput.value = todayISO();

  if (categorySelect) {
    categorySelect.addEventListener("change", () => {
      if (categorySelect.value === "__new__") {
        const name = prompt("Nombre de la nueva categoría:");
        if (name && name.trim()) {
          addCategory(name.trim());
          categorySelect.value = name.trim();
        } else {
          categorySelect.value = "";
        }
      }
    });
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const type =
      document.getElementById("type").value === "expense" ? "expense" : "income";
    const amountRaw = amountInput ? amountInput.value : "";
    const date = dateInput ? dateInput.value : "";
    let category = categorySelect ? categorySelect.value : "";
    const noteInput = document.getElementById("note");
    const note = noteInput ? noteInput.value.trim() : "";

    if (category === "__new__") {
      category = "";
    }

    const amount = parseFloat((amountRaw || "").replace(",", "."));

    if (!date) {
      alert("Indica una fecha.");
      return;
    }
    if (!category) {
      alert("Selecciona una categoría.");
      return;
    }
    if (!amount || amount <= 0) {
      alert("El importe debe ser mayor que 0.");
      return;
    }

    if (editingTxId) {
      const tx = transactions.find((t) => t.id === editingTxId);
      if (tx) {
        tx.type = type;
        tx.amount = amount;
        tx.category = category;
        tx.date = date;
        tx.note = note;
      }
    } else {
      const tx = {
        id: uuid(),
        type,
        amount,
        category,
        date,
        note,
      };
      transactions.push(tx);
    }

    saveToStorage();
    syncCategoriesFromTransactions();
    populateCategoryUI();
    refreshUI();
    form.reset();
    editingTxId = null;
    closeNewTxModal();
  });
}

// --- Botones superiores ---
function resetFilters() {
  const filterType = document.getElementById("filterType");
  const filterCategory = document.getElementById("filterCategory");
  const searchText = document.getElementById("searchText");
  const dateRange = document.getElementById("dateRange");
  const fromDate = document.getElementById("historyFromDate");
  const toDate = document.getElementById("historyToDate");

  if (filterType) filterType.value = "all";
  if (filterCategory) filterCategory.value = "all";
  if (searchText) searchText.value = "";
  if (dateRange) dateRange.value = "30";
  if (fromDate) fromDate.value = "";
  if (toDate) toDate.value = "";
}

function setupTopButtons() {
  const btnClear = document.getElementById("btnClearAll");
  if (btnClear) {
    btnClear.addEventListener("click", () => {
      if (!transactions.length) {
        alert("No hay datos que eliminar.");
        return;
      }
      if (confirm("¿Eliminar todos los movimientos?")) {
        transactions = [];
        saveToStorage();
        resetFilters();
        refreshUI();
      }
    });
  }

  const btnExport = document.getElementById("btnExportCsv");
  if (btnExport) {
    btnExport.addEventListener("click", exportCsv);
  }

  const importInput = document.getElementById("importCsvInput");
  if (importInput) {
    importInput.addEventListener("change", (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        importCsv(text);
      };
      reader.readAsText(file, "utf-8");
      ev.target.value = "";
    });
  }

  const btnClearFilters = document.getElementById("btnClearFilters");
  if (btnClearFilters) {
    btnClearFilters.addEventListener("click", () => {
      resetFilters();
      refreshUI();
    });
  }
}

function setupMovementPanelButtons() {
  const openBtn = document.getElementById("btnOpenNewTx");
  const closeBtn = document.getElementById("btnCloseNewTx");
  const modal = document.getElementById("newTxModal");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      openNewTxModal();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      closeNewTxModal();
    });
  }

  if (modal) {
    modal.addEventListener("click", (ev) => {
      if (ev.target === modal) {
        closeNewTxModal();
      }
    });
  }
}

// --- Filtros ---
function setupFilters() {
  const filterType = document.getElementById("filterType");
  const filterCategory = document.getElementById("filterCategory");
  const searchText = document.getElementById("searchText");
  const dateRange = document.getElementById("dateRange");
  const fromDate = document.getElementById("historyFromDate");
  const toDate = document.getElementById("historyToDate");

  if (filterType) filterType.addEventListener("change", refreshUI);
  if (filterCategory) filterCategory.addEventListener("change", refreshUI);
  if (searchText) searchText.addEventListener("input", refreshUI);
  if (dateRange) dateRange.addEventListener("change", refreshUI);
  if (fromDate) fromDate.addEventListener("change", refreshUI);
  if (toDate) toDate.addEventListener("change", refreshUI);
}

// --- Inicialización ---
function init() {
  loadPrefs();
  transactions = loadFromStorage();
  loadCategories();
  syncCategoriesFromTransactions();
  initPrefsUI();
  populateCategoryUI();
  setupForm();
  setupTopButtons();
  setupMovementPanelButtons();
  setupFilters();
  setupSorting();
  refreshUI();
}

document.addEventListener("DOMContentLoaded", init);