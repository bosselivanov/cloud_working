const STORAGE_KEY = "cloud-graph-state-v1";

const state = {
  view: { x: 0, y: 0, scale: 1 },
  clouds: [],
  links: [],
  selectedEntityId: null,
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
  linkModeStatus: document.getElementById("linkModeStatus"),
  cancelLinkBtn: document.getElementById("cancelLinkBtn"),
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
    {
      id: crypto.randomUUID(),
      title: "Экономика",
      x: 120,
      y: 160,
      width: 420,
      tasks: [
        createTask("Учебник", "2026-07-06"),
        createTask("Связь с «Книги»", "2026-07-09"),
        createTask("Решать задачи", "2026-07-12"),
      ],
    },
    {
      id: crypto.randomUUID(),
      title: "Книги",
      x: 840,
      y: 180,
      width: 340,
      tasks: [
        createTask("Список литературы", "2026-07-03"),
        createTask("Выделить главное", "2026-07-08"),
      ],
    },
    {
      id: crypto.randomUUID(),
      title: "Учеба",
      x: 320,
      y: 610,
      width: 360,
      tasks: [
        createTask("Смотреть вебинар", "2026-07-01"),
        createTask("ЕГЭ", "2026-07-25"),
      ],
    },
  ];

  const [economics, books, study] = state.clouds;
  state.links = [
    { id: crypto.randomUUID(), from: economics.id, to: books.id },
    { id: crypto.randomUUID(), from: study.id, to: books.id },
    { id: crypto.randomUUID(), from: economics.tasks[0].id, to: books.id },
    { id: crypto.randomUUID(), from: study.tasks[1].id, to: economics.id },
  ];
}

function createTask(title = "Новая задача", deadline = "") {
  return {
    id: crypto.randomUUID(),
    title,
    deadline,
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
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("resize", renderConnections);

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      spacePressed = true;
      elements.viewport.classList.add("panning");
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      spacePressed = false;
      elements.viewport.classList.remove("panning");
    }
  });
}

function createCloud() {
  const nextIndex = state.clouds.length + 1;
  state.clouds.push({
    id: crypto.randomUUID(),
    title: `Новое облако ${nextIndex}`,
    x: 180 + nextIndex * 40,
    y: 140 + nextIndex * 40,
    width: 380,
    tasks: [createTask("Первая задача")],
  });
}

function render() {
  elements.board.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`;
  elements.cloudLayer.innerHTML = "";

  for (const cloud of state.clouds) {
    const cloudNode = elements.cloudTemplate.content.firstElementChild.cloneNode(true);
    cloudNode.dataset.entityId = cloud.id;
    cloudNode.style.left = `${cloud.x}px`;
    cloudNode.style.top = `${cloud.y}px`;
    cloudNode.style.width = `${cloud.width}px`;
    cloudNode.querySelector(".cloud-title").textContent = cloud.title;
    cloudNode.classList.toggle("selected", state.selectedEntityId === cloud.id);
    cloudNode.dataset.linkTarget = state.linkStartId && state.linkStartId !== cloud.id ? "true" : "false";

    setupCloudEvents(cloudNode, cloud);

    const taskList = cloudNode.querySelector(".task-list");
    for (const task of cloud.tasks) {
      const taskNode = elements.taskTemplate.content.firstElementChild.cloneNode(true);
      taskNode.dataset.entityId = task.id;
      taskNode.querySelector(".task-title").textContent = task.title;
      taskNode.querySelector(".deadline-input").value = task.deadline || "";
      taskNode.classList.toggle("selected", state.selectedEntityId === task.id);
      taskNode.dataset.linkTarget = state.linkStartId && state.linkStartId !== task.id ? "true" : "false";
      setupTaskEvents(taskNode, cloud, task);
      taskList.append(taskNode);
    }

    elements.cloudLayer.append(cloudNode);
  }

  updateLinkStatus();
  renderConnections();
}

function setupCloudEvents(cloudNode, cloud) {
  cloudNode.addEventListener("pointerdown", (event) => {
    const interactive = event.target.closest("button, input, [contenteditable='true']");
    if (interactive || spacePressed) {
      return;
    }

    dragSession = {
      type: "cloud",
      cloudId: cloud.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: cloud.x,
      originY: cloud.y,
    };
    state.selectedEntityId = cloud.id;
    cloudNode.setPointerCapture(event.pointerId);
    render();
  });

  cloudNode.addEventListener("dblclick", () => {
    state.selectedEntityId = cloud.id;
    render();
  });

  cloudNode.querySelector(".cloud-title").addEventListener("blur", (event) => {
    cloud.title = event.target.textContent.trim() || "Без названия";
    saveState();
    render();
  });

  cloudNode.querySelector(".add-task-btn").addEventListener("click", () => {
    cloud.tasks.push(createTask("Новая задача"));
    saveState();
    render();
  });

  cloudNode.querySelector(".link-btn").addEventListener("click", () => {
    activateLinkMode(cloud.id);
  });

  cloudNode.addEventListener("click", () => {
    if (state.linkStartId && state.linkStartId !== cloud.id) {
      createLink(state.linkStartId, cloud.id);
      return;
    }

    state.selectedEntityId = cloud.id;
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
  if (!spacePressed && event.target !== elements.viewport) {
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
  render();
}

function cancelLinkMode() {
  state.linkStartId = null;
  render();
}

function createLink(from, to) {
  const exists = state.links.some((link) =>
    (link.from === from && link.to === to) ||
    (link.from === to && link.to === from)
  );

  if (!exists) {
    state.links.push({
      id: crypto.randomUUID(),
      from,
      to,
    });
    saveState();
  }

  state.linkStartId = null;
  state.selectedEntityId = to;
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
  }
}

function updateLinkStatus() {
  const active = Boolean(state.linkStartId);
  elements.linkModeStatus.textContent = active
    ? "Выбери вторую точку связи"
    : "Не активен";
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
    const curve = Math.max(90, Math.abs(toPoint.x - fromPoint.x) * 0.35);
    const d = `M ${fromPoint.x} ${fromPoint.y} C ${fromPoint.x + curve} ${fromPoint.y}, ${toPoint.x - curve} ${toPoint.y}, ${toPoint.x} ${toPoint.y}`;
    path.setAttribute("d", d);
    path.setAttribute("class", "connection");
    elements.connectionsLayer.append(path);
  }
}

function getEntityCenter(entityId) {
  const entityNode = elements.cloudLayer.querySelector(`[data-entity-id="${entityId}"]`);
  if (!entityNode) {
    return null;
  }

  const viewportRect = elements.viewport.getBoundingClientRect();
  const rect = entityNode.getBoundingClientRect();
  return {
    x: rect.left - viewportRect.left + rect.width / 2,
    y: rect.top - viewportRect.top + rect.height / 2,
  };
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
