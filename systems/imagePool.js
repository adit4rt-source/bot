// systems/imagePool.js — Worker thread pool for canvas rendering
// Manages a pool of imageWorker.js threads and distributes rendering tasks.
// Usage:
//   const { renderImage } = require('./imagePool');
//   const buffer = await renderImage('welcome', { headline, username, ... });
//   const buffer = await renderImage('profile', { username, level, ... });
//   const buffer = await renderImage('gacha', cards);

const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');

// ---- Configuration ----
// Use 2 workers minimum, cap at (cpuCount - 1) so the main thread still has room.
const POOL_SIZE = Math.max(2, Math.min(4, os.cpus().length - 1));
const TASK_TIMEOUT_MS = 30_000; // 30s max per render (images can be slow if loading URLs)
const MAX_QUEUE = 50;           // reject tasks if queue grows too large

const WORKER_PATH = path.join(__dirname, 'imageWorker.js');

// ---- Pool state ----
let workers = [];        // { worker, busy, ready }
let taskQueue = [];      // { id, type, params, resolve, reject, timer, workerEntry }
let taskIdCounter = 0;
let pendingTasks = new Map(); // id → { resolve, reject, timer }
let poolReady = false;

// ---- Create a single worker ----
function createWorker(index) {
    const w = new Worker(WORKER_PATH, { env: process.env });
    const entry = { worker: w, busy: false, ready: false, index, stopping: false };

    w.on('message', (msg) => {
        if (msg.ready) {
            entry.ready = true;
            // Check if all workers are ready
            if (workers.every(e => e.ready)) {
                poolReady = true;
            }
            // Try to dequeue a pending task
            tryDequeue();
            return;
        }

        // Task result
        const { id, buffer, error } = msg;
        const pending = pendingTasks.get(id);
        if (!pending) {
            entry.busy = false;
            tryDequeue();
            return;
        }

        pendingTasks.delete(id);
        if (pending.timer) clearTimeout(pending.timer);
        entry.busy = false;

        if (error) {
            pending.reject(new Error(error));
        } else {
            // Reconstruct Buffer from transferred ArrayBuffer
            pending.resolve(Buffer.from(buffer));
        }

        // Process next queued task
        tryDequeue();
    });

    w.on('error', (err) => {
        console.error(`[ImagePool] Worker ${index} error:`, err.message);
        // Reject only tasks assigned to this worker. Queued tasks can still run on a replacement.
        for (const [id, pending] of pendingTasks) {
            if (pending.workerEntry === entry) {
                if (pending.timer) clearTimeout(pending.timer);
                pending.reject(new Error(`Worker crashed: ${err.message}`));
                pendingTasks.delete(id);
            }
        }
        replaceWorker(entry);
    });

    w.on('exit', (code) => {
        if (code !== 0 && !entry.stopping) {
            console.error(`[ImagePool] Worker ${index} exited with code ${code}`);
        }
    });

    return entry;
}

// ---- Initialize pool ----
function initPool() {
    if (workers.length > 0) return;
    for (let i = 0; i < POOL_SIZE; i++) {
        workers.push(createWorker(i));
    }
    console.log(`🖼️ Image worker pool: ${POOL_SIZE} threads ready`);
}

// ---- Find an idle worker ----
function getIdleWorker() {
    return workers.find(e => e.ready && !e.busy) || null;
}

function replaceWorker(entry) {
    entry.ready = false;
    entry.busy = false;
    entry.stopping = true;
    try { entry.worker.terminate(); } catch (_) {}
    workers[entry.index] = createWorker(entry.index);
    poolReady = false;
}

function dispatchTask(entry, task) {
    entry.busy = true;
    task.workerEntry = entry;
    task.timer = setTimeout(() => {
        if (!pendingTasks.has(task.id)) return;
        pendingTasks.delete(task.id);
        taskQueue = taskQueue.filter(t => t.id !== task.id);
        task.reject(new Error(`Image render timed out after ${TASK_TIMEOUT_MS / 1000}s`));
        if (task.workerEntry === entry) replaceWorker(entry);
        tryDequeue();
    }, TASK_TIMEOUT_MS);

    try {
        entry.worker.postMessage({ id: task.id, type: task.type, params: task.params });
    } catch (e) {
        clearTimeout(task.timer);
        pendingTasks.delete(task.id);
        entry.busy = false;
        task.reject(e);
        tryDequeue();
    }
}

// ---- Try to dequeue and process a task ----
function tryDequeue() {
    while (taskQueue.length > 0) {
        const idle = getIdleWorker();
        if (!idle) break;

        const task = taskQueue.shift();
        dispatchTask(idle, task);
    }
}

// ---- Public API ----
/**
 * Render an image using the worker pool.
 * @param {string} type - 'welcome' | 'welcomeGlitch' | 'welcomeRpg' | 'profile' | 'gacha' | 'gallery'
 * @param {Object|Array} params - Parameters to pass to the renderer function
 * @returns {Promise<Buffer>} PNG image buffer
 */
function renderImage(type, params) {
    // Auto-init on first call
    if (workers.length === 0) initPool();

    return new Promise((resolve, reject) => {
        if (taskQueue.length >= MAX_QUEUE) {
            return reject(new Error('Image render queue full — try again later'));
        }

        const id = ++taskIdCounter;

        const task = { id, type, params, resolve, reject, timer: null, workerEntry: null };
        pendingTasks.set(id, task);

        // Try to assign directly to an idle worker
        const idle = getIdleWorker();
        if (idle) {
            dispatchTask(idle, task);
        } else {
            // Queue it
            taskQueue.push(task);
        }
    });
}

/**
 * Gracefully shutdown all workers.
 */
async function shutdownPool() {
    for (const entry of workers) {
        entry.stopping = true;
        try { await entry.worker.terminate(); } catch (_) {}
    }
    workers = [];
    taskQueue = [];
    pendingTasks.clear();
    poolReady = false;
}

/**
 * Get pool stats for monitoring.
 */
function getPoolStats() {
    return {
        poolSize: workers.length,
        busyWorkers: workers.filter(e => e.busy).length,
        queueLength: taskQueue.length,
        pendingTasks: pendingTasks.size,
    };
}

module.exports = { renderImage, shutdownPool, getPoolStats, initPool };
