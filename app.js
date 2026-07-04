const STORAGE_KEY = "cloud-graph-state-v4";

const state = {
  view: { x: 0, y: 0, scale: 1 },
  clouds: [],
  openCloudId: null,
};

const elements = {
  viewport: document.getElementById("boardViewport"),
  board: document.getElementById("board"),
  cloudLayer: document.getElementById("cloudLayer"),
  cloudTemplate: document.getElementById("cloudTemplate"),
  taskTemplate: document.getElementById("taskTemplate"),
  createCloudBtn: document.getElementById("createCloudBtn"),
  centerViewBtn: document.getElementById("centerViewBtn"),
  studio: document.getElementById("cloudStudio"),
  studioPanel: document.querySelector(".cloud-studio-panel"),
  studioTitle: document.getElementById("studioTitle"),
  closeStudioBtn: document.getElementById("closeStudioBtn"),
  addTaskBtn: document.getElementById("addTaskBtn"),
  taskCanvas: document.getElementById("taskCanvas"),
  taskEdges: document.getElementById("taskEdges"),
  taskNodes: document.getElementById("taskNodes"),
};

let cloudDrag = null;
let taskDrag = null;
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
  const economicsTasks = [
    createTask("Учебник и структура тем", 80, 70, "2026-07-06"),
    createTask("Практика и задачи", 420, 180, "2026-07-12"),
    createTask("Конспект по слабым местам", 250, 360, ""),
  ];
  const booksTasks = [
    createTask("Подобрать список чтения", 90, 90, "2026-07-05"),
    createTask("Выписать идеи", 380, 260, ""),
  ];
  const studyTasks = [
    createTask("Вебинар", 100, 120, "2026-07-04"),
    createTask("План на неделю", 420, 320, ""),
  ];

  state.clouds = [
    createCloudModel({
      title: "Экономика",
      x: 180,
      y: 180,
      tasks: economicsTasks,
      edges: [createEdge(economicsTasks[0].id, economicsTasks[1].id), createEdge(economicsTasks[1].id, economicsTasks[2].id)],
      blobSeed: 0.16,
    }),
    createCloudModel({
      title: "Книги",
      x: 860,
      y: 210,
      tasks: booksTasks,
      edges: [createEdge(booksTasks[0].id, booksTasks[1].id)],
      blobSeed: 0.58,
    }),
    createCloudModel({
      title: "Учеба",
      x: 380,
      y: 640,
      tasks: studyTasks,
      edges: [createEdge(studyTasks[0].id, studyTasks[1].id)],
      blobSeed: 0.82,
    }),
  ];
}

function createCloudModel({ title, x, y, tasks = [], edges = [], blobSeed = Math.random() }) {
  return {
    id: crypto.randomUUID(),
    title,
    x,
    y,
    tasks,
    edges,
    blobSeed,
  };
}

function createTask(text = "Новая задача", x = 120, y = 90, deadline = "") {
  return {
    id: crypto.randomUUID(),
    text,
    x,
    y,
    deadline,
  };
}

function createEdge(from, to) {
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
    renderBoardTransform();
  });

  elements.closeStudioBtn.addEventListener("click", closeStudio);
  elements.addTaskBtn.addEventListener("click", addTaskToOpenCloud);
  elements.studioTitle.addEventListener("blur", handleStudioTitleBlur);

  elements.viewport.addEventListener("wheel", handleZoom, { passive: false });
  elements.viewport.addEventListener("pointerdown", handlePanStart);
  elements.viewport.addEventListener("dblclick", handleViewportDoubleClick);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
}

function createCloud(x = 240 + state.clouds.length * 52, y = 180 + state.clouds.length * 44) {
  const nextIndex = state.clouds.length + 1;
  const cloud = createCloudModel({
    title: `Облако ${nextIndex}`,
    x,
    y,
    tasks: [createTask("Первая мысль", 120, 100, "")],
    edges: [],
  });
  state.clouds.push(cloud);
  openCloud(cloud.id);
}

function render() {
  renderBoardTransform();
  renderClouds();
  renderStudio();
}

function renderBoardTransform() {
  elements.board.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`;
}

function renderClouds() {
  elements.cloudLayer.innerHTML = "";

  for (const cloud of state.clouds) {
    const node = elements.cloudTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.cloudId = cloud.id;
    node.style.left = `${cloud.x}px`;
    node.style.top = `${cloud.y}px`;
    node.style.setProperty("--blob-radius", getBlobRadius(cloud.blobSeed));
    node.style.setProperty("--blob-tilt", `${getBlobTilt(cloud.blobSeed)}deg`);
    node.classList.toggle("is-open", state.openCloudId === cloud.id);
    node.querySelector(".cloud-title").textContent = cloud.title;

    node.addEventListener("pointerdown", (event) => {
      if (spacePressed) {
        return;
      }
      cloudDrag = {
        cloudId: cloud.id,
        startX: event.clientX,
        startY: event.clientY,
        originX: cloud.x,
        originY: cloud.y,
        node,
      };
      node.setPointerCapture(event.pointerId);
    });

    node.addEventListener("click", () => {
      openCloud(cloud.id);
    });

    elements.cloudLayer.append(node);
  }
}

function renderStudio() {
  const cloud = getOpenCloud();
  if (!cloud) {
    elements.studio.hidden = true;
    elements.taskEdges.innerHTML = "";
    elements.taskNodes.innerHTML = "";
    return;
  }

  elements.studio.hidden = false;
  elements.studioTitle.textContent = cloud.title;
  elements.taskEdges.innerHTML = "";
  elements.taskNodes.innerHTML = "";

  renderTaskEdges(cloud);

  for (const task of cloud.tasks) {
    const taskNode = elements.taskTemplate.content.firstElementChild.cloneNode(true);
    taskNode.dataset.taskId = task.id;
    taskNode.style.left = `${task.x}px`;
    taskNode.style.top = `${task.y}px`;
    taskNode.querySelector(".task-text").value = task.text;
    taskNode.querySelector(".deadline-input").value = task.deadline || "";

    const interactiveSelector = ".task-text, .deadline-input, .remove-task-btn, .spawn-task-btn";
    taskNode.addEventListener("pointerdown", (event) => {
      if (event.target.closest(interactiveSelector)) {
        return;
      }
      taskDrag = {
        taskId: task.id,
        startX: event.clientX,
        startY: event.clientY,
        originX: task.x,
        originY: task.y,
        node: taskNode,
      };
      taskNode.setPointerCapture(event.pointerId);
    });

    taskNode.querySelector(".task-text").addEventListener("input", (event) => {
      task.text = event.target.value;
      saveState();
    });

    taskNode.querySelector(".deadline-input").addEventListener("input", (event) => {
      task.deadline = event.target.value;
      saveState();
    });

    taskNode.querySelector(".spawn-task-btn").addEventListener("click", () => {
      spawnChildTask(cloud, task);
    });

    taskNode.querySelector(".remove-task-btn").addEventListener("click", () => {
      cloud.tasks = cloud.tasks.filter((item) => item.id !== task.id);
      cloud.edges = (cloud.edges || []).filter((edge) => edge.from !== task.id && edge.to !== task.id);
      saveState();
      renderStudio();
    });

    elements.taskNodes.append(taskNode);
  }
}

function renderTaskEdges(cloud) {
  const canvasRect = elements.taskCanvas.getBoundingClientRect();
  elements.taskEdges.innerHTML = "";
  elements.taskEdges.setAttribute("viewBox", `0 0 ${canvasRect.width} ${canvasRect.height}`);

  for (const edge of cloud.edges || []) {
    const from = cloud.tasks.find((task) => task.id === edge.from);
    const to = cloud.tasks.find((task) => task.id === edge.to);
    if (!from || !to) {
      continue;
    }

    const startX = from.x + 240;
    const startY = from.y + 78;
    const endX = to.x;
    const endY = to.y + 78;
    const curve = Math.max(80, Math.abs(endX - startX) * 0.35);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`);
    path.setAttribute("class", "task-edge");
    elements.taskEdges.append(path);
  }
}

function openCloud(cloudId) {
  state.openCloudId = cloudId;
  render();
  animateCloudOpening(cloudId);
}

function closeStudio() {
  state.openCloudId = null;
  render();
}

function addTaskToOpenCloud() {
  const cloud = getOpenCloud();
  if (!cloud) {
    return;
  }

  const offset = cloud.tasks.length * 26;
  cloud.tasks.push(createTask("Новая задача", 90 + offset, 90 + offset, ""));
  saveState();
  renderStudio();
}

function spawnChildTask(cloud, parentTask) {
  const child = createTask("Подзадача", parentTask.x + 280, parentTask.y + 40, "");
  cloud.tasks.push(child);
  cloud.edges = cloud.edges || [];
  cloud.edges.push(createEdge(parentTask.id, child.id));
  saveState();
  renderStudio();
}

function handleStudioTitleBlur(event) {
  const cloud = getOpenCloud();
  if (!cloud) {
    return;
  }

  cloud.title = event.target.textContent.trim() || "Без названия";
  saveState();
  renderClouds();
}

function handleZoom(event) {
  if (state.openCloudId) {
    return;
  }

  event.preventDefault();
  const rect = elements.viewport.getBoundingClientRect();
  const cursorX = event.clientX - rect.left;
  const cursorY = event.clientY - rect.top;
  const worldX = (cursorX - state.view.x) / state.view.scale;
  const worldY = (cursorY - state.view.y) / state.view.scale;
  const scaleDelta = event.deltaY < 0 ? 1.08 : 0.92;
  const nextScale = Math.min(1.9, Math.max(0.55, state.view.scale * scaleDelta));

  state.view.x = cursorX - worldX * nextScale;
  state.view.y = cursorY - worldY * nextScale;
  state.view.scale = nextScale;
  renderBoardTransform();
}

function handlePanStart(event) {
  const isViewport = event.target === elements.viewport;
  if (!spacePressed || !isViewport || state.openCloudId) {
    return;
  }

  panSession = {
    startX: event.clientX,
    startY: event.clientY,
    originX: state.view.x,
    originY: state.view.y,
  };
}

function handleViewportDoubleClick(event) {
  if (event.target !== elements.viewport || state.openCloudId) {
    return;
  }

  const point = screenToWorld(event.clientX, event.clientY);
  createCloud(point.x - 140, point.y - 80);
  render();
  saveState();
}

function handlePointerMove(event) {
  if (cloudDrag) {
    const cloud = state.clouds.find((item) => item.id === cloudDrag.cloudId);
    if (!cloud) {
      return;
    }

    cloud.x = cloudDrag.originX + (event.clientX - cloudDrag.startX) / state.view.scale;
    cloud.y = cloudDrag.originY + (event.clientY - cloudDrag.startY) / state.view.scale;
    cloudDrag.node.style.left = `${cloud.x}px`;
    cloudDrag.node.style.top = `${cloud.y}px`;
    return;
  }

  if (taskDrag) {
    const cloud = getOpenCloud();
    if (!cloud) {
      return;
    }

    const task = cloud.tasks.find((item) => item.id === taskDrag.taskId);
    if (!task) {
      return;
    }

    const canvasRect = elements.taskCanvas.getBoundingClientRect();
    task.x = clamp(taskDrag.originX + (event.clientX - taskDrag.startX), 14, Math.max(14, canvasRect.width - 254));
    task.y = clamp(taskDrag.originY + (event.clientY - taskDrag.startY), 14, Math.max(14, canvasRect.height - 170));
    taskDrag.node.style.left = `${task.x}px`;
    taskDrag.node.style.top = `${task.y}px`;
    renderTaskEdges(cloud);
    return;
  }

  if (panSession) {
    state.view.x = panSession.originX + (event.clientX - panSession.startX);
    state.view.y = panSession.originY + (event.clientY - panSession.startY);
    renderBoardTransform();
  }
}

function handlePointerUp() {
  if (cloudDrag || taskDrag) {
    saveState();
  }

  cloudDrag = null;
  taskDrag = null;
  panSession = null;
}

function handleKeyDown(event) {
  if (event.code === "Space") {
    spacePressed = true;
  }

  if (event.key === "Escape") {
    closeStudio();
  }
}

function handleKeyUp(event) {
  if (event.code === "Space") {
    spacePressed = false;
  }
}

function getOpenCloud() {
  return state.clouds.find((cloud) => cloud.id === state.openCloudId) || null;
}

function animateCloudOpening(cloudId) {
  const source = elements.cloudLayer.querySelector(`[data-cloud-id="${cloudId}"] .cloud-shell`);
  if (!source) {
    return;
  }

  const start = source.getBoundingClientRect();
  const finish = elements.studioPanel.getBoundingClientRect();
  elements.studioPanel.animate(
    [
      {
        opacity: 0,
        transform: `translate(${start.left - finish.left}px, ${start.top - finish.top}px) scale(${start.width / finish.width}, ${start.height / finish.height})`,
      },
      {
        opacity: 1,
        transform: "translate(0, 0) scale(1)",
      },
    ],
    {
      duration: 420,
      easing: "cubic-bezier(0.2, 0.8, 0.18, 1)",
    }
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
  return -5 + Math.round(seed * 10);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

    for (const cloud of state.clouds) {
      if (typeof cloud.blobSeed !== "number") {
        cloud.blobSeed = Math.random();
      }
      cloud.edges = Array.isArray(cloud.edges) ? cloud.edges : [];
      cloud.tasks = (cloud.tasks || []).map((task) => ({
        id: task.id || crypto.randomUUID(),
        text: task.text || task.title || "Новая задача",
        x: typeof task.x === "number" ? task.x : 120,
        y: typeof task.y === "number" ? task.y : 100,
        deadline: task.deadline || "",
      }));
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
    })
  );
}
