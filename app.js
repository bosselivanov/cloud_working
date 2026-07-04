const STORAGE_KEY = "cloud-graph-state-v2";

const state = {
  view: { x: 0, y: 0, scale: 1 },
  clouds: [],
  links: [],
  selectedEntityId: null,
  selectedCloudId: null,
  linkStartId: null,
};

const elements = {
  viewport: document.getElementById("boardViewport"),
  board: document.getElementById("board"),
  cloudLayer: document.getElementById("cloudLayer"),
  connectionsLayer: document.getElementById("connectionsLayer"),
  cloudTemplate: document.getElementById("cloudTemplate"),
  taskTemplate: document.getElementById("taskTemplate"),
  createCloudBtn: document.getElementById("createCloudBtn"),
  centerViewBtn: document.getElementById("centerViewBtn"),
  cancelLinkBtn: document.getElementById("cancelLinkBtn"),
  linkModeStatus: document.getElementById("linkModeStatus"),
};

let dragSession = null;
let panSession = null;
let spacePressed = false;

bootstrap();

function bootstrap() {
  loadState();
  if (state.clouds.length === 0) {
    seedDemo();
  }

  bindGlobalEvents();
  render();
}

function seedDemo() {
  state.clouds = [
    createCloudModel({
      title: "Экономика",
      x: 160,
      y: 160,
      width: 420,
      tasks: [
        createTask("Учебник", "2026-07-06", true),
        createTask("Связь с Книги", "2026-07-09", false),
        createTask("Решать задачи", "2026-07-12", true),
      ],
      blobSeed: 0.12,
    }),
    createCloudModel({
      title: "Книги",
      x: 860,
      y: 180,
      width: 360,
      tasks: [
        createTask("Список литературы", "2026-07-03", true),
        createTask("Выделить главное", "2026-07-08", false),
      ],
      blobSeed: 0.62,
    }),
    createCloudModel({
      title: "Учеба",
      x: 340,
      y: 620,
      width: 390,
      tasks: [
        createTask("Смотреть вебинар", "2026-07-01", false),
        createTask("ЕГЭ", "2026-07-25", true),
      ],
      blobSeed: 0.84,
    }),
  ];

  const [economics, books, study] = state.clouds;
  state.links = [
    createLinkModel(economics.id, books.id),
    createLinkModel(study.id, books.id),
    createLinkModel(economics.tasks[0].id, books.id),
    createLinkModel(study.tasks[1].id, economics.id),
  ];
}

function createCloudModel({ title, x, y, width = 360, tasks = [], blobSeed = Math.random() }) {
  return {
    id: crypto.randomUUID(),
    title,
    x,
    y,
    width,
    blobSeed,
    tasks,
  };
}

function createTask(title = "Новая задача", deadline = "", favorite = false) {
  return {
    id: crypto.randomUUID(),
    title,
    deadline,
    favorite,
  };
}

function createLinkModel(from, to) {
  return {
    id: crypto.randomUUID(),
    from,
    to,
  };
}

function bindGlobalEvents() {
  elements.createCloudBtn.addEventListener("click", () => {
    createCloud();
    render();
    saveState();
  });

  elements.centerViewBtn.addEventListener("click", () => {
    state.view = { x: 0, y: 0, scale: 1 };
    render();
  });

  elements.cancelLinkBtn.addEventListener("click", cancelLinkMode);

  elements.viewport.addEventListener("wheel", handleZoom, { passive: false });
  elements.viewport.addEventListener("pointerdown", handlePanStart);
  elements.viewport.addEventListener("dblclick", handleViewportDoubleClick);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("resize", renderConnections);

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      spacePressed = true;
    }

    if (event.key === "Escape") {
      cancelLinkMode();
      clearSelection();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      spacePressed = false;
    }
  });
}

function createCloud(x = 240 + state.clouds.length * 44, y = 180 + state.clouds.length * 44) {
  const nextIndex = state.clouds.length + 1;
  const cloud = createCloudModel({
    title: `Облако ${nextIndex}`,
    x,
    y,
    width: 360,
    tasks: [createTask("Первая задача")],
  });
  state.clouds.push(cloud);
  state.selectedEntityId = cloud.id;
  state.selectedCloudId = cloud.id;
}

function handleViewportDoubleClick(event) {
  if (event.target !== elements.viewport) {
    return;
  }

  const point = screenToWorld(event.clientX, event.clientY);
  createCloud(point.x - 150, point.y - 70);
  render();
  saveState();
}

function render() {
  elements.board.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`;
  elements.cloudLayer.innerHTML = "";

  for (const cloud of state.clouds) {
    const cloudNode = elements.cloudTemplate.content.firstElementChild.cloneNode(true);
    const selectedCloud = state.selectedCloudId === cloud.id;
    cloudNode.dataset.entityId = cloud.id;
    cloudNode.style.left = `${cloud.x}px`;
    cloudNode.style.top = `${cloud.y}px`;
    cloudNode.style.width = `${cloud.width}px`;
    cloudNode.style.setProperty("--blob-radius", getBlobRadius(cloud.blobSeed));
    cloudNode.style.setProperty("--blob-tilt", `${getBlobTilt(cloud.blobSeed)}deg`);
    cloudNode.classList.toggle("selected", selectedCloud);
    cloudNode.dataset.linkTarget = state.linkStartId && state.linkStartId !== cloud.id ? "true" : "false";

    cloudNode.querySelector(".cloud-title").textContent = cloud.title;
    renderFavoritePills(cloudNode.querySelector(".cloud-favorites"), cloud.tasks);

    const taskList = cloudNode.querySelector(".task-list");
    for (const task of cloud.tasks) {
      const taskNode = elements.taskTemplate.content.firstElementChild.cloneNode(true);
      taskNode.dataset.entityId = task.id;
      taskNode.querySelector(".task-title").textContent = task.title;
      taskNode.querySelector(".deadline-input").value = task.deadline || "";
      taskNode.querySelector(".favorite-btn").textContent = task.favorite ? "★" : "☆";
      taskNode.querySelector(".favorite-btn").classList.toggle("is-favorite", task.favorite);
      taskNode.classList.toggle("selected", state.selectedEntityId === task.id);
      taskNode.dataset.linkTarget = state.linkStartId && state.linkStartId !== task.id ? "true" : "false";
      setupTaskEvents(taskNode, cloud, task);
      taskList.append(taskNode);
    }

    setupCloudEvents(cloudNode, cloud);
    elements.cloudLayer.append(cloudNode);
  }

  updateLinkStatus();
  renderConnections();
}

function renderFavoritePills(container, tasks) {
  container.innerHTML = "";
  for (const task of tasks.filter((item) => item.favorite)) {
    const pill = document.createElement("div");
    pill.className = "favorite-pill";
    const deadlineMarkup = task.deadline ? `<time>${formatDate(task.deadline)}</time>` : "";
    pill.innerHTML = `<span>${escapeHtml(task.title)}</span>${deadlineMarkup}`;
    container.append(pill);
  }
}

function setupCloudEvents(cloudNode, cloud) {
  cloudNode.addEventListener("pointerdown", (event) => {
    const interactive = event.target.closest("button, input, [contenteditable='true']");
    if (interactive || spacePressed) {
      return;
    }

    dragSession = {
      cloudId: cloud.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: cloud.x,
      originY: cloud.y,
    };
    state.selectedEntityId = cloud.id;
    state.selectedCloudId = cloud.id;
    cloudNode.setPointerCapture(event.pointerId);
    render();
  });

  cloudNode.querySelector(".cloud-title").addEventListener("blur", (event) => {
    cloud.title = event.target.textContent.trim() || "Без названия";
    saveState();
    render();
  });

  cloudNode.querySelector(".add-task-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    cloud.tasks.push(createTask("Новая задача"));
    state.selectedCloudId = cloud.id;
    saveState();
    render();
  });

  cloudNode.querySelector(".link-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    activateLinkMode(cloud.id);
  });

  cloudNode.addEventListener("click", (event) => {
    if (event.target.closest(".task-row")) {
      return;
    }

    if (state.linkStartId && state.linkStartId !== cloud.id) {
      createLink(state.linkStartId, cloud.id);
      return;
    }

    state.selectedEntityId = cloud.id;
    state.selectedCloudId = cloud.id;
    render();
  });
}

function setupTaskEvents(taskNode, cloud, task) {
  taskNode.querySelector(".task-title").addEventListener("blur", (event) => {
    task.title = event.target.textContent.trim() || "Без названия";
    saveState();
    render();
  });

  taskNode.querySelector(".deadline-input").addEventListener("input", (event) => {
    task.deadline = event.target.value;
    saveState();
    render();
  });

  taskNode.querySelector(".favorite-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    task.favorite = !task.favorite;
    saveState();
    render();
  });

  taskNode.querySelector(".link-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    activateLinkMode(task.id);
  });

  taskNode.querySelector(".remove-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    removeTask(cloud.id, task.id);
    saveState();
    render();
  });

  taskNode.addEventListener("click", (event) => {
    event.stopPropagation();

    if (state.linkStartId && state.linkStartId !== task.id) {
      createLink(state.linkStartId, task.id);
      return;
    }

    state.selectedEntityId = task.id;
    state.selectedCloudId = cloud.id;
    render();
  });
}

function handleZoom(event) {
  event.preventDefault();

  const rect = elements.viewport.getBoundingClientRect();
  const cursorX = event.clientX - rect.left;
  const cursorY = event.clientY - rect.top;
  const worldX = (cursorX - state.view.x) / state.view.scale;
  const worldY = (cursorY - state.view.y) / state.view.scale;
  const scaleDelta = event.deltaY < 0 ? 1.08 : 0.92;
  const nextScale = Math.min(1.8, Math.max(0.55, state.view.scale * scaleDelta));

  state.view.x = cursorX - worldX * nextScale;
  state.view.y = cursorY - worldY * nextScale;
  state.view.scale = nextScale;
  render();
}

function handlePanStart(event) {
  const isViewport = event.target === elements.viewport;
  if (!spacePressed && !isViewport) {
    return;
  }

  panSession = {
    startX: event.clientX,
    startY: event.clientY,
    originX: state.view.x,
    originY: state.view.y,
  };
}

function handlePointerMove(event) {
  if (dragSession) {
    const cloud = state.clouds.find((item) => item.id === dragSession.cloudId);
    if (!cloud) {
      return;
    }

    cloud.x = dragSession.originX + (event.clientX - dragSession.startX) / state.view.scale;
    cloud.y = dragSession.originY + (event.clientY - dragSession.startY) / state.view.scale;
    render();
    return;
  }

  if (panSession) {
    state.view.x = panSession.originX + (event.clientX - panSession.startX);
    state.view.y = panSession.originY + (event.clientY - panSession.startY);
    render();
  }
}

function handlePointerUp() {
  if (dragSession) {
    saveState();
  }

  dragSession = null;
  panSession = null;
}

function activateLinkMode(entityId) {
  state.linkStartId = entityId;
  state.selectedEntityId = entityId;
  state.selectedCloudId = findCloudByEntity(entityId)?.id || state.selectedCloudId;
  render();
}

function cancelLinkMode() {
  state.linkStartId = null;
  render();
}

function clearSelection() {
  state.selectedEntityId = null;
  state.selectedCloudId = null;
  render();
}

function createLink(from, to) {
  const exists = state.links.some((link) =>
    (link.from === from && link.to === to) ||
    (link.from === to && link.to === from)
  );

  if (!exists) {
    state.links.push(createLinkModel(from, to));
    saveState();
  }

  state.linkStartId = null;
  state.selectedEntityId = to;
  state.selectedCloudId = findCloudByEntity(to)?.id || null;
  render();
}

function removeTask(cloudId, taskId) {
  const cloud = state.clouds.find((item) => item.id === cloudId);
  if (!cloud) {
    return;
  }

  cloud.tasks = cloud.tasks.filter((task) => task.id !== taskId);
  state.links = state.links.filter((link) => link.from !== taskId && link.to !== taskId);

  if (state.selectedEntityId === taskId) {
    state.selectedEntityId = cloudId;
    state.selectedCloudId = cloudId;
  }
}

function updateLinkStatus() {
  const active = Boolean(state.linkStartId);
  elements.linkModeStatus.textContent = active
    ? "Выбери вторую точку связи"
    : "Режим обзора";
  elements.linkModeStatus.classList.toggle("active", active);
  elements.cancelLinkBtn.disabled = !active;
}

function renderConnections() {
  elements.connectionsLayer.innerHTML = "";

  const viewportRect = elements.viewport.getBoundingClientRect();
  elements.connectionsLayer.setAttribute("viewBox", `0 0 ${viewportRect.width} ${viewportRect.height}`);

  for (const link of state.links) {
    const fromPoint = getEntityCenter(link.from);
    const toPoint = getEntityCenter(link.to);
    if (!fromPoint || !toPoint) {
      continue;
    }

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const curve = Math.max(90, Math.abs(toPoint.x - fromPoint.x) * 0.32);
    const d = `M ${fromPoint.x} ${fromPoint.y} C ${fromPoint.x + curve} ${fromPoint.y}, ${toPoint.x - curve} ${toPoint.y}, ${toPoint.x} ${toPoint.y}`;
    path.setAttribute("d", d);

    const active = state.selectedEntityId && (link.from === state.selectedEntityId || link.to === state.selectedEntityId);
    path.setAttribute("class", active ? "connection active" : "connection");
    elements.connectionsLayer.append(path);
  }
}

function getEntityCenter(entityId) {
  const entityNode = elements.cloudLayer.querySelector(`[data-entity-id="${entityId}"]`);
  if (entityNode) {
    const viewportRect = elements.viewport.getBoundingClientRect();
    const rect = entityNode.getBoundingClientRect();
    return {
      x: rect.left - viewportRect.left + rect.width / 2,
      y: rect.top - viewportRect.top + rect.height / 2,
    };
  }

  const owner = findCloudByEntity(entityId);
  if (!owner) {
    return null;
  }

  const cloudNode = elements.cloudLayer.querySelector(`[data-entity-id="${owner.id}"]`);
  if (!cloudNode) {
    return null;
  }

  const viewportRect = elements.viewport.getBoundingClientRect();
  const cloudRect = cloudNode.getBoundingClientRect();
  const taskIndex = owner.tasks.findIndex((task) => task.id === entityId);
  const orbitAngle = ((taskIndex + 1) / Math.max(owner.tasks.length, 1)) * Math.PI * 1.6;
  return {
    x: cloudRect.left - viewportRect.left + cloudRect.width / 2 + Math.cos(orbitAngle) * 26,
    y: cloudRect.top - viewportRect.top + cloudRect.height / 2 + Math.sin(orbitAngle) * 26,
  };
}

function findCloudByEntity(entityId) {
  return state.clouds.find((cloud) =>
    cloud.id === entityId || cloud.tasks.some((task) => task.id === entityId)
  );
}

function screenToWorld(clientX, clientY) {
  const rect = elements.viewport.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.view.x) / state.view.scale,
    y: (clientY - rect.top - state.view.y) / state.view.scale,
  };
}

function getBlobRadius(seed) {
  if (seed < 0.25) {
    return "46% 54% 41% 59% / 57% 39% 61% 43%";
  }
  if (seed < 0.5) {
    return "54% 46% 58% 42% / 42% 58% 45% 55%";
  }
  if (seed < 0.75) {
    return "42% 58% 48% 52% / 52% 37% 63% 48%";
  }
  return "58% 42% 53% 47% / 44% 56% 40% 60%";
}

function getBlobTilt(seed) {
  return -6 + Math.round(seed * 12);
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return;
    }

    const parsed = JSON.parse(saved);
    state.view = parsed.view || state.view;
    state.clouds = parsed.clouds || [];
    state.links = parsed.links || [];

    for (const cloud of state.clouds) {
      if (typeof cloud.blobSeed !== "number") {
        cloud.blobSeed = Math.random();
      }
      for (const task of cloud.tasks || []) {
        if (typeof task.favorite !== "boolean") {
          task.favorite = false;
        }
      }
    }
  } catch (error) {
    console.warn("Не удалось загрузить состояние:", error);
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      view: state.view,
      clouds: state.clouds,
      links: state.links,
    })
  );
}
