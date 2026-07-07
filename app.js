const STORAGE_KEY = "cloud-graph-state-v8";
const STORAGE_PERSISTENCE_KEY = "cloud-graph-state-v12";
const AUTH_STORAGE_KEY = "cloud-working-auth-v1";
const ACCESS_CODES = ["CW-2471", "BOSSE-2026", "STARCLOUD"];
const CLOUD_WIDTH = 260;
const CLOUD_HEIGHT = 156;
const SHARED_WIDTH = 252;
const SHARED_HEIGHT = 176;
const TASK_WIDTH = 284;
const TASK_HEIGHT = 182;

const state = {
  view: { x: 0, y: 0, scale: 1 },
  clouds: [],
  sharedTasks: [],
  openCloudId: null,
};

const TASK_TYPES = ["idea", "task", "decision", "risk"];
const TASK_TYPE_LABELS = {
  idea: "идея",
  task: "задача",
  decision: "решение",
  risk: "риск",
};

const elements = {
  viewport: document.getElementById("boardViewport"),
  board: document.getElementById("board"),
  boardEdges: document.getElementById("boardEdges"),
  cloudLayer: document.getElementById("cloudLayer"),
  sharedLayer: document.getElementById("sharedLayer"),
  cloudTemplate: document.getElementById("cloudTemplate"),
  taskTemplate: document.getElementById("taskTemplate"),
  sharedTemplate: document.getElementById("sharedTemplate"),
  createCloudBtn: document.getElementById("createCloudBtn"),
  createSharedBtn: document.getElementById("createSharedBtn"),
  centerViewBtn: document.getElementById("centerViewBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  studio: document.getElementById("cloudStudio"),
  studioPanel: document.querySelector(".cloud-studio-panel"),
  studioTitle: document.getElementById("studioTitle"),
  closeStudioBtn: document.getElementById("closeStudioBtn"),
  addTaskBtn: document.getElementById("addTaskBtn"),
  taskCanvas: document.getElementById("taskCanvas"),
  taskEdges: document.getElementById("taskEdges"),
  taskNodes: document.getElementById("taskNodes"),
  authGate: document.getElementById("authGate"),
  authForm: document.getElementById("authForm"),
  authCodeInput: document.getElementById("authCodeInput"),
  authError: document.getElementById("authError"),
};

let cloudDrag = null;
let sharedDrag = null;
let taskDrag = null;
let panSession = null;
let spacePressed = false;
let suppressCloudClickUntil = 0;
let activeSharedPickerId = null;
let activeSharedPickerCloudId = null;
let spotlightSharedId = null;
let spotlightTimer = null;

bootstrap();

function bootstrap() {
  bindGlobalEvents();
  if (isAuthorized()) {
    unlockApp();
    loadState();
    render();
  } else {
    lockApp();
  }
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

function createTask(text = "", x = 120, y = 90, deadline = "", type = "task") {
  return {
    id: crypto.randomUUID(),
    text,
    x,
    y,
    deadline,
    type,
  };
}

function createSharedTask({ text = "", x = 420, y = 280, deadline = "", type = "task", links = [] } = {}) {
  return {
    id: crypto.randomUUID(),
    text,
    x,
    y,
    deadline,
    type,
    links: dedupeLinks(links),
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
  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.createCloudBtn.addEventListener("click", () => {
    createCloud();
    render();
    saveState();
  });

  elements.createSharedBtn.addEventListener("click", () => {
    createSharedOnBoard();
    render();
    saveState();
  });

  elements.centerViewBtn.addEventListener("click", () => {
    state.view = { x: 0, y: 0, scale: 1 };
    renderBoardTransform();
  });
  elements.logoutBtn.addEventListener("click", logout);

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
    tasks: [],
    edges: [],
  });
  state.clouds.push(cloud);
  openCloud(cloud.id);
}

function createSharedOnBoard() {
  const center = {
    x: (-state.view.x + elements.viewport.clientWidth * 0.52) / state.view.scale,
    y: (-state.view.y + elements.viewport.clientHeight * 0.46) / state.view.scale,
  };
  state.sharedTasks.push(
    createSharedTask({
      text: "",
      x: center.x - SHARED_WIDTH / 2,
      y: center.y - SHARED_HEIGHT / 2,
      links: [],
    })
  );
  saveState();
  renderSharedTasks();
  renderBoardEdges();
}

function render() {
  document.body.classList.toggle("has-open-cloud", Boolean(state.openCloudId));
  renderBoardTransform();
  renderClouds();
  renderSharedTasks();
  renderBoardEdges();
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
    node.classList.toggle("is-context", Boolean(state.openCloudId) && state.openCloudId !== cloud.id);
    node.querySelector(".cloud-title").textContent = cloud.title;
    renderCloudPreview(node.querySelector(".cloud-preview"), cloud);
    node.querySelector(".cloud-remove-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      removeCloud(cloud.id);
    });

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
        moved: false,
      };
      node.setPointerCapture(event.pointerId);
    });

    node.addEventListener("click", () => {
      if (Date.now() < suppressCloudClickUntil) {
        return;
      }
      openCloud(cloud.id);
    });

    elements.cloudLayer.append(node);
  }
}

function renderSharedTasks() {
  elements.sharedLayer.innerHTML = "";

  for (const sharedTask of state.sharedTasks) {
    const node = elements.sharedTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.sharedId = sharedTask.id;
    node.dataset.taskType = sharedTask.type || "task";
    node.style.left = `${sharedTask.x}px`;
    node.style.top = `${sharedTask.y}px`;
    node.classList.toggle("is-spotlit", spotlightSharedId === sharedTask.id);

    node.querySelector(".shared-type-badge").textContent = "общая";
    node.querySelector(".shared-text").value = sharedTask.text;
    node.querySelector(".shared-deadline-input").value = sharedTask.deadline || "";
    node.querySelector(".shared-type-cycle-btn").textContent = TASK_TYPE_LABELS[sharedTask.type || "task"];

    renderSharedConnectors(node, sharedTask);
    renderSharedTaskChips(node.querySelector(".shared-clouds"), sharedTask);
    renderSharedTaskPicker(node.querySelector(".shared-cloud-picker"), sharedTask);

    const interactiveSelector = ".shared-text, .shared-deadline-input, .shared-remove-btn, .shared-picker-toggle-btn, .shared-type-cycle-btn, .shared-chip, .shared-cloud-option";
    node.addEventListener("pointerdown", (event) => {
      if (event.target.closest(interactiveSelector) || spacePressed) {
        return;
      }
      sharedDrag = {
        sharedId: sharedTask.id,
        startX: event.clientX,
        startY: event.clientY,
        originX: sharedTask.x,
        originY: sharedTask.y,
        node,
        moved: false,
      };
      node.setPointerCapture(event.pointerId);
    });

    node.querySelector(".shared-text").addEventListener("input", (event) => {
      sharedTask.text = event.target.value;
      saveState();
    });

    node.querySelector(".shared-deadline-input").addEventListener("input", (event) => {
      sharedTask.deadline = event.target.value;
      saveState();
    });

    node.querySelector(".shared-type-cycle-btn").addEventListener("click", () => {
      sharedTask.type = nextTaskType(sharedTask.type);
      saveState();
      render();
    });

    node.querySelector(".shared-picker-toggle-btn").addEventListener("click", () => {
      activeSharedPickerId = activeSharedPickerId === sharedTask.id ? null : sharedTask.id;
      activeSharedPickerCloudId = activeSharedPickerId ? getInitialPickerCloudId(sharedTask) : null;
      renderSharedTasks();
      renderBoardEdges();
    });

    node.querySelector(".shared-remove-btn").addEventListener("click", () => {
      state.sharedTasks = state.sharedTasks.filter((item) => item.id !== sharedTask.id);
      if (activeSharedPickerId === sharedTask.id) {
        activeSharedPickerId = null;
        activeSharedPickerCloudId = null;
      }
      saveState();
      render();
    });

    elements.sharedLayer.append(node);
  }

  syncSharedPickerVisibility();
}

function renderCloudPreview(container, cloud) {
  container.innerHTML = "";
  container.hidden = cloud.tasks.length === 0;
  if (cloud.tasks.length === 0) {
    return;
  }
  const previewWidth = 300;
  const previewHeight = 160;

  for (const task of cloud.tasks) {
    const preview = document.createElement("div");
    preview.className = "cloud-preview-task";
    preview.dataset.taskId = task.id;
    preview.dataset.cloudId = cloud.id;
    preview.dataset.taskType = task.type || "task";
    preview.classList.toggle("is-linked", isTaskLinkedToWorld(cloud.id, task.id));
    preview.style.left = `${clamp(16 + task.x * 0.28, 12, previewWidth - 140)}px`;
    preview.style.top = `${clamp(14 + task.y * 0.2, 12, previewHeight - 58)}px`;

    const label = document.createElement("span");
    label.className = "cloud-preview-label";
    label.textContent = task.text;
    preview.append(label);

    const relations = getTaskWorldRelations(cloud.id, task.id);
    for (const relation of relations) {
      const port = document.createElement("div");
      port.className = `preview-world-port preview-world-port-${relation.side}`;
      port.dataset.relationId = relation.relationId;
      port.dataset.side = relation.side;
      preview.append(port);
    }

    container.append(preview);
  }
}

function renderSharedConnectors(node, sharedTask) {
  const leftContainer = node.querySelector(".shared-connectors-left");
  const rightContainer = node.querySelector(".shared-connectors-right");
  leftContainer.innerHTML = "";
  rightContainer.innerHTML = "";

  const relations = getSharedRelations(sharedTask.id);
  appendConnectorSockets(leftContainer, relations.filter((relation) => relation.side === "left"), "shared", sharedTask.id);
  appendConnectorSockets(rightContainer, relations.filter((relation) => relation.side === "right"), "shared", sharedTask.id);
}

function appendConnectorSockets(container, relations, kind, ownerId) {
  for (const relation of relations) {
    const socket = document.createElement("div");
    socket.className = `${kind}-connector-socket`;
    socket.dataset.relationId = relation.relationId;
    socket.dataset.ownerId = ownerId;
    socket.dataset.taskType = relation.type || "task";
    socket.dataset.side = relation.side;
    container.append(socket);
  }
}

function renderSharedTaskChips(container, sharedTask) {
  container.innerHTML = "";
  const links = sharedTask.links || [];

  if (links.length === 0) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "shared-chip shared-chip-empty";
    chip.textContent = "не привязано";
    chip.addEventListener("click", () => {
      activeSharedPickerId = sharedTask.id;
      renderSharedTasks();
      renderBoardEdges();
    });
    container.append(chip);
    return;
  }

  for (const link of links) {
    const task = getLinkedTask(link);
    if (!task) {
      continue;
    }
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "shared-chip";
    chip.textContent = `${task.cloud.title} · ${task.task.text}`;
    chip.addEventListener("click", () => openCloud(task.cloud.id));
    container.append(chip);
  }
}

function renderSharedTaskPicker(container, sharedTask) {
  container.innerHTML = "";
  const cloudRow = document.createElement("div");
  cloudRow.className = "shared-picker-clouds";
  container.append(cloudRow);

  for (const cloud of state.clouds) {
    const cloudButton = document.createElement("button");
    cloudButton.type = "button";
    cloudButton.className = "shared-cloud-option shared-cloud-option-cloud";
    cloudButton.classList.toggle("is-active", activeSharedPickerCloudId === cloud.id);
    const linkedCount = (sharedTask.links || []).filter((link) => link.cloudId === cloud.id).length;
    cloudButton.textContent = linkedCount > 0 ? `${cloud.title} · ${linkedCount}` : cloud.title;
    cloudButton.addEventListener("click", () => {
      activeSharedPickerCloudId = cloud.id;
      renderSharedTasks();
    });
    cloudRow.append(cloudButton);
  }

  const chosenCloud = state.clouds.find((cloud) => cloud.id === activeSharedPickerCloudId) || state.clouds[0];
  if (!chosenCloud) {
    return;
  }

  const taskRow = document.createElement("div");
  taskRow.className = "shared-picker-tasks";
  container.append(taskRow);

  for (const task of chosenCloud.tasks) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "shared-cloud-option";
    option.classList.toggle("is-active", hasSharedTaskLink(sharedTask, chosenCloud.id, task.id));
    option.textContent = task.text || "без названия";
    option.addEventListener("click", () => {
      toggleSharedTaskLink(sharedTask.id, chosenCloud.id, task.id);
    });
    taskRow.append(option);
  }
}

function syncSharedPickerVisibility() {
  const pickers = elements.sharedLayer.querySelectorAll(".shared-note");
  for (const pickerHost of pickers) {
    const sharedId = pickerHost.dataset.sharedId;
    const picker = pickerHost.querySelector(".shared-cloud-picker");
    const isActive = activeSharedPickerId === sharedId;
    picker.hidden = !isActive;
    pickerHost.classList.toggle("is-expanded", isActive);
  }
}

function renderBoardEdges() {
  elements.boardEdges.innerHTML = "";
  elements.boardEdges.setAttribute("viewBox", `0 0 ${Math.max(2000, elements.viewport.clientWidth / state.view.scale)} ${Math.max(1600, elements.viewport.clientHeight / state.view.scale)}`);

  for (const sharedTask of state.sharedTasks) {
    for (const link of sharedTask.links || []) {
      const relationId = makeRelationId(sharedTask.id, link.cloudId, link.taskId);
      const sharedAnchor = getSocketMeta(`.shared-connector-socket[data-relation-id="${relationId}"]`);
      const cloudAnchor =
        getSocketMeta(`.preview-world-port[data-relation-id="${relationId}"]`) ||
        getCloudCenterMeta(link.cloudId);
      if (!sharedAnchor || !cloudAnchor) {
        continue;
      }
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", buildOrthogonalPath(sharedAnchor, cloudAnchor, 28));
      path.setAttribute("class", `board-edge board-edge--${sharedTask.type || "task"}`);
      if (spotlightSharedId === sharedTask.id) {
        path.classList.add("is-spotlit");
      }
      elements.boardEdges.append(path);
    }
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
  elements.taskNodes.innerHTML = "";

  for (const task of cloud.tasks) {
    const taskNode = elements.taskTemplate.content.firstElementChild.cloneNode(true);
    taskNode.dataset.taskId = task.id;
    taskNode.dataset.taskType = task.type || "task";
    taskNode.style.left = `${task.x}px`;
    taskNode.style.top = `${task.y}px`;
    taskNode.querySelector(".task-type-badge").textContent = TASK_TYPE_LABELS[task.type || "task"];
    taskNode.querySelector(".type-cycle-btn").textContent = TASK_TYPE_LABELS[task.type || "task"];
    taskNode.querySelector(".task-text").value = task.text;
    taskNode.querySelector(".deadline-input").value = task.deadline || "";

    const interactiveSelector = ".task-text, .deadline-input, .remove-task-btn, .spawn-task-btn, .type-cycle-btn, .share-task-btn";
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
        moved: false,
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

    taskNode.querySelector(".type-cycle-btn").addEventListener("click", () => {
      task.type = nextTaskType(task.type);
      saveState();
      renderStudio();
    });

    taskNode.querySelector(".share-task-btn").addEventListener("click", () => {
      convertTaskToShared(cloud, task.id);
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

  renderTaskEdges(cloud);
}

function renderTaskEdges(cloud) {
  elements.taskEdges.innerHTML = "";
  const canvasRect = elements.taskCanvas.getBoundingClientRect();
  elements.taskEdges.setAttribute("viewBox", `0 0 ${canvasRect.width} ${canvasRect.height}`);

  for (const edge of cloud.edges || []) {
    const from = cloud.tasks.find((task) => task.id === edge.from);
    const to = cloud.tasks.find((task) => task.id === edge.to);
    if (!from || !to) {
      continue;
    }

    const fromNode = elements.taskNodes.querySelector(`[data-task-id="${from.id}"]`);
    const toNode = elements.taskNodes.querySelector(`[data-task-id="${to.id}"]`);
    if (!fromNode || !toNode) {
      continue;
    }

    const startPort = fromNode.querySelector(".task-port-out");
    const endPort = toNode.querySelector(".task-port-in");
    if (!startPort || !endPort) {
      continue;
    }

    const startRect = startPort.getBoundingClientRect();
    const endRect = endPort.getBoundingClientRect();
    const startMeta = {
      x: startRect.left - canvasRect.left + startRect.width / 2,
      y: startRect.top - canvasRect.top + startRect.height / 2,
      side: "right",
    };
    const endMeta = {
      x: endRect.left - canvasRect.left + endRect.width / 2,
      y: endRect.top - canvasRect.top + endRect.height / 2,
      side: "left",
    };
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", buildOrthogonalPath(startMeta, endMeta, 24));
    path.setAttribute("class", `task-edge task-edge--${to.type || from.type || "task"}`);
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
  const task = createTask("", 90 + offset, 90 + offset, "");
  cloud.tasks.push(task);
  saveState();
  renderStudio();
  renderClouds();
  renderBoardEdges();
  focusTaskEditor(task.id);
}

function spawnChildTask(cloud, parentTask) {
  const child = createTask("", parentTask.x + 280, parentTask.y + 40, "", inferChildType(parentTask.type));
  cloud.tasks.push(child);
  cloud.edges = cloud.edges || [];
  cloud.edges.push(createEdge(parentTask.id, child.id));
  saveState();
  renderStudio();
  renderClouds();
  renderBoardEdges();
  focusTaskEditor(child.id);
}

function convertTaskToShared(cloud, taskId) {
  const task = cloud.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }

  const existingSharedTask = state.sharedTasks.find((sharedTask) =>
    (sharedTask.links || []).some((link) => link.cloudId === cloud.id && link.taskId === task.id)
  );
  if (existingSharedTask) {
    existingSharedTask.text = task.text;
    existingSharedTask.deadline = task.deadline;
    existingSharedTask.type = task.type;
    saveState();
    focusSharedTask(existingSharedTask.id);
    return;
  }

  const sharedPosition = {
    x: cloud.x + CLOUD_WIDTH + 90 + state.sharedTasks.length * 18,
    y: cloud.y + 24 + state.sharedTasks.length * 18,
  };

  const sharedTask = createSharedTask({
    text: task.text,
    x: sharedPosition.x,
    y: sharedPosition.y,
    deadline: task.deadline,
    type: task.type,
    links: collectTaskChainLinks(cloud, task.id),
  });

  state.sharedTasks.push(sharedTask);
  saveState();
  focusSharedTask(sharedTask.id);
}

function toggleSharedTaskLink(sharedId, cloudId, taskId) {
  const sharedTask = state.sharedTasks.find((item) => item.id === sharedId);
  if (!sharedTask) {
    return;
  }

  const current = sharedTask.links || [];
  const exists = current.some((link) => link.cloudId === cloudId && link.taskId === taskId);
  if (exists) {
    sharedTask.links = current.filter((link) => !(link.cloudId === cloudId && link.taskId === taskId));
  } else {
    sharedTask.links = dedupeLinks([...current, { cloudId, taskId }]);
  }
  saveState();
  render();
}

function collectTaskChainLinks(cloud, taskId) {
  return [{ cloudId: cloud.id, taskId }];
}

function removeCloud(cloudId) {
  state.clouds = state.clouds.filter((cloud) => cloud.id !== cloudId);
  state.sharedTasks = state.sharedTasks
    .map((sharedTask) => ({
      ...sharedTask,
      links: (sharedTask.links || []).filter((link) => link.cloudId !== cloudId),
    }))
    .filter((sharedTask) => Boolean(sharedTask.text?.trim()) || (sharedTask.links || []).length > 0);

  if (state.openCloudId === cloudId) {
    state.openCloudId = null;
  }
  if (activeSharedPickerCloudId === cloudId) {
    activeSharedPickerCloudId = state.clouds[0]?.id || null;
  }

  saveState();
  render();
}

function focusSharedTask(sharedId) {
  const sharedTask = state.sharedTasks.find((item) => item.id === sharedId);
  if (!sharedTask) {
    return;
  }

  state.openCloudId = null;
  state.view.scale = 0.94;
  state.view.x = elements.viewport.clientWidth * 0.5 - (sharedTask.x + SHARED_WIDTH * 0.5) * state.view.scale;
  state.view.y = elements.viewport.clientHeight * 0.42 - (sharedTask.y + SHARED_HEIGHT * 0.5) * state.view.scale;
  spotlightSharedId = sharedId;
  if (spotlightTimer) {
    window.clearTimeout(spotlightTimer);
  }
  spotlightTimer = window.setTimeout(() => {
    spotlightSharedId = null;
    render();
  }, 1400);
  render();
}

function handleStudioTitleBlur(event) {
  const cloud = getOpenCloud();
  if (!cloud) {
    return;
  }

  cloud.title = event.target.textContent.trim() || "Без названия";
  saveState();
  renderClouds();
  renderBoardEdges();
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
  const insideViewport = Boolean(event.target.closest("#boardViewport"));
  const overCloud = Boolean(event.target.closest(".cloud-node"));
  const overShared = Boolean(event.target.closest(".shared-note"));
  if (state.openCloudId || !insideViewport) {
    return;
  }

  if (!spacePressed && (overCloud || overShared)) {
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

    const deltaX = event.clientX - cloudDrag.startX;
    const deltaY = event.clientY - cloudDrag.startY;
    if (!cloudDrag.moved && Math.hypot(deltaX, deltaY) > 6) {
      cloudDrag.moved = true;
    }

    cloud.x = cloudDrag.originX + deltaX / state.view.scale;
    cloud.y = cloudDrag.originY + deltaY / state.view.scale;
    cloudDrag.node.style.left = `${cloud.x}px`;
    cloudDrag.node.style.top = `${cloud.y}px`;
    renderBoardEdges();
    return;
  }

  if (sharedDrag) {
    const sharedTask = state.sharedTasks.find((item) => item.id === sharedDrag.sharedId);
    if (!sharedTask) {
      return;
    }

    const deltaX = event.clientX - sharedDrag.startX;
    const deltaY = event.clientY - sharedDrag.startY;
    if (!sharedDrag.moved && Math.hypot(deltaX, deltaY) > 4) {
      sharedDrag.moved = true;
    }

    sharedTask.x = sharedDrag.originX + deltaX / state.view.scale;
    sharedTask.y = sharedDrag.originY + deltaY / state.view.scale;
    sharedDrag.node.style.left = `${sharedTask.x}px`;
    sharedDrag.node.style.top = `${sharedTask.y}px`;
    renderBoardEdges();
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
    const deltaX = event.clientX - taskDrag.startX;
    const deltaY = event.clientY - taskDrag.startY;
    if (!taskDrag.moved && Math.hypot(deltaX, deltaY) > 4) {
      taskDrag.moved = true;
    }
    task.x = clamp(taskDrag.originX + deltaX, 14, Math.max(14, canvasRect.width - TASK_WIDTH));
    task.y = clamp(taskDrag.originY + deltaY, 14, Math.max(14, canvasRect.height - TASK_HEIGHT));
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
  if (cloudDrag?.moved) {
    suppressCloudClickUntil = Date.now() + 220;
  }

  if (cloudDrag || sharedDrag || taskDrag) {
    saveState();
  }

  cloudDrag = null;
  sharedDrag = null;
  taskDrag = null;
  panSession = null;
}

function handleKeyDown(event) {
  if (event.code === "Space") {
    spacePressed = true;
  }

  if (event.key === "Escape") {
    activeSharedPickerId = null;
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

function getSharedRelations(sharedId) {
  const sharedTask = state.sharedTasks.find((item) => item.id === sharedId);
  if (!sharedTask) {
    return [];
  }

  const centerX = sharedTask.x + SHARED_WIDTH * 0.5;
  const relations = (sharedTask.links || [])
    .map((link) => {
      const cloud = state.clouds.find((item) => item.id === link.cloudId);
      const task = cloud?.tasks.find((item) => item.id === link.taskId);
      if (!cloud || !task) {
        return null;
      }
      return {
        relationId: makeRelationId(sharedId, link.cloudId, link.taskId),
        side: cloud.x + CLOUD_WIDTH * 0.5 < centerX ? "left" : "right",
        sortY: cloud.y + task.y * 0.14,
        type: sharedTask.type || "task",
      };
    })
    .filter(Boolean);

  return sortRelations(relations);
}

function sortRelations(relations) {
  return relations.sort((a, b) => {
    if (a.side !== b.side) {
      return a.side.localeCompare(b.side);
    }
    return a.sortY - b.sortY;
  });
}

function makeRelationId(sharedId, cloudId, taskId) {
  return `${sharedId}::${cloudId}::${taskId}`;
}

function getSocketMeta(selector) {
  const socket = document.querySelector(selector);
  if (!socket) {
    return null;
  }

  const rect = socket.getBoundingClientRect();
  const boardRect = elements.board.getBoundingClientRect();
  return {
    x: (rect.left - boardRect.left + rect.width * 0.5) / state.view.scale,
    y: (rect.top - boardRect.top + rect.height * 0.5) / state.view.scale,
    side: socket.dataset.side || "right",
  };
}

function getCloudCenterMeta(cloudId) {
  const cloudNode = document.querySelector(`.cloud-node[data-cloud-id="${cloudId}"] .cloud-shell`);
  if (!cloudNode) {
    return null;
  }

  const rect = cloudNode.getBoundingClientRect();
  const boardRect = elements.board.getBoundingClientRect();
  return {
    x: (rect.left - boardRect.left + rect.width * 0.5) / state.view.scale,
    y: (rect.top - boardRect.top + rect.height * 0.5) / state.view.scale,
    side: "right",
  };
}

function dedupeLinks(links) {
  const seen = new Set();
  return (links || []).filter((link) => {
    if (!link?.cloudId || !link?.taskId) {
      return false;
    }
    const key = `${link.cloudId}::${link.taskId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function hasSharedTaskLink(sharedTask, cloudId, taskId) {
  return (sharedTask.links || []).some((link) => link.cloudId === cloudId && link.taskId === taskId);
}

function getLinkedTask(link) {
  const cloud = state.clouds.find((item) => item.id === link.cloudId);
  const task = cloud?.tasks.find((item) => item.id === link.taskId);
  if (!cloud || !task) {
    return null;
  }
  return { cloud, task };
}

function getInitialPickerCloudId(sharedTask) {
  return sharedTask.links?.[0]?.cloudId || state.clouds[0]?.id || null;
}

function isTaskLinkedToWorld(cloudId, taskId) {
  return state.sharedTasks.some((sharedTask) => hasSharedTaskLink(sharedTask, cloudId, taskId));
}

function getTaskRelationIds(cloudId, taskId) {
  return state.sharedTasks
    .filter((sharedTask) => hasSharedTaskLink(sharedTask, cloudId, taskId))
    .map((sharedTask) => makeRelationId(sharedTask.id, cloudId, taskId));
}

function getTaskWorldRelations(cloudId, taskId) {
  const cloud = state.clouds.find((item) => item.id === cloudId);
  const task = cloud?.tasks.find((item) => item.id === taskId);
  if (!cloud || !task) {
    return [];
  }

  return state.sharedTasks
    .filter((sharedTask) => hasSharedTaskLink(sharedTask, cloudId, taskId))
    .map((sharedTask) => ({
      relationId: makeRelationId(sharedTask.id, cloudId, taskId),
      side: sharedTask.x + SHARED_WIDTH * 0.5 < cloud.x + task.x ? "left" : "right",
      type: sharedTask.type || "task",
    }));
}

function buildOrthogonalPath(start, end, offset = 24) {
  const startLead = start.side === "left" ? -offset : offset;
  const endLead = end.side === "left" ? -offset : offset;
  const x1 = start.x + startLead;
  const x2 = end.x + endLead;
  const midX = (x1 + x2) / 2;

  return [
    `M ${start.x} ${start.y}`,
    `L ${x1} ${start.y}`,
    `L ${midX} ${start.y}`,
    `L ${midX} ${end.y}`,
    `L ${x2} ${end.y}`,
    `L ${end.x} ${end.y}`,
  ].join(" ");
}

function focusTaskEditor(taskId) {
  requestAnimationFrame(() => {
    const node = elements.taskNodes.querySelector(`[data-task-id="${taskId}"] .task-text`);
    if (!node) {
      return;
    }
    node.focus();
    if (typeof node.setSelectionRange === "function") {
      node.setSelectionRange(0, node.value.length);
    }
  });
}

function normalizeSharedLinks(task) {
  if (Array.isArray(task.links)) {
    return dedupeLinks(task.links);
  }

  if (Array.isArray(task.cloudIds)) {
    return dedupeLinks(
      task.cloudIds
        .map((cloudId) => {
          const cloud = state.clouds.find((item) => item.id === cloudId);
          const fallbackTask = cloud?.tasks?.[0];
          if (!fallbackTask) {
            return null;
          }
          return { cloudId, taskId: fallbackTask.id };
        })
        .filter(Boolean)
    );
  }

  return [];
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

function nextTaskType(currentType = "task") {
  const currentIndex = TASK_TYPES.indexOf(currentType);
  return TASK_TYPES[(currentIndex + 1 + TASK_TYPES.length) % TASK_TYPES.length];
}

function inferChildType(parentType = "task") {
  if (parentType === "idea") {
    return "task";
  }
  if (parentType === "task") {
    return "decision";
  }
  return "task";
}

function isAuthorized() {
  return localStorage.getItem(AUTH_STORAGE_KEY) === "granted";
}

function lockApp() {
  document.body.classList.add("is-auth-locked");
  elements.authGate.hidden = false;
  elements.authCodeInput.value = "";
  elements.authError.hidden = true;
}

function unlockApp() {
  document.body.classList.remove("is-auth-locked");
  elements.authGate.hidden = true;
  elements.authError.hidden = true;
}

function handleAuthSubmit(event) {
  event.preventDefault();
  const code = elements.authCodeInput.value.trim();
  if (!ACCESS_CODES.includes(code)) {
    elements.authError.hidden = false;
    elements.authCodeInput.select();
    return;
  }

  localStorage.setItem(AUTH_STORAGE_KEY, "granted");
  unlockApp();
  loadState();
  render();
}

function logout() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  state.openCloudId = null;
  lockApp();
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_PERSISTENCE_KEY);
    if (!saved) {
      return;
    }

    const parsed = JSON.parse(saved);
    state.view = parsed.view || state.view;
    state.clouds = parsed.clouds || [];
    state.sharedTasks = parsed.sharedTasks || [];

    for (const cloud of state.clouds) {
      if (typeof cloud.blobSeed !== "number") {
        cloud.blobSeed = Math.random();
      }
      cloud.edges = Array.isArray(cloud.edges) ? cloud.edges : [];
      cloud.tasks = (cloud.tasks || []).map((task) => ({
        id: task.id || crypto.randomUUID(),
        text: task.text || task.title || "",
        x: typeof task.x === "number" ? task.x : 120,
        y: typeof task.y === "number" ? task.y : 100,
        deadline: task.deadline || "",
        type: TASK_TYPES.includes(task.type) ? task.type : "task",
      }));
    }

    state.sharedTasks = state.sharedTasks.map((task) => ({
      id: task.id || crypto.randomUUID(),
      text: task.text || "",
      x: typeof task.x === "number" ? task.x : 420,
      y: typeof task.y === "number" ? task.y : 280,
      deadline: task.deadline || "",
      type: TASK_TYPES.includes(task.type) ? task.type : "task",
      links: normalizeSharedLinks(task),
    }));
  } catch (error) {
    console.warn("Не удалось загрузить состояние:", error);
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_PERSISTENCE_KEY,
    JSON.stringify({
      view: state.view,
      clouds: state.clouds,
      sharedTasks: state.sharedTasks,
    })
  );
}
