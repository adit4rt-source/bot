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
let taskQueue = [];      // { id, type, params, resolve, reject, timer }
let taskIdCounter = 0;
let pendingTasks = new Map(); // id → { resolve, reject, timer }
let poolReady = false;

// ---- Create a single worker ----
function createWorker(index) {
    const w = new Worker(WORKER_PATH);
    const entry = { worker: w, busy: false, ready: false, index };

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
        if (!pending) return;

        pendingTasks.delete(id);
        clearTimeout(pending.timer);
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
        // Reject all pending tasks for this worker
        for (const [id, pending] of pendingTasks) {
            clearTimeout(pending.timer);
            pending.reject(new Error(`Worker crashed: ${err.message}`));
            pendingTasks.delete(id);
        }
        // Replace the dead worker
        entry.ready = false;
        entry.busy = false;
        try { w.terminate(); } catch (_) {}
        const replacement = createWorker(index);
        workers[index] = replacement;
    });

    w.on('exit', (code) => {
        if (code !== 0) {
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

// ---- Try to dequeue and process a task ----
function tryDequeue() {
    while (taskQueue.length > 0) {
        const idle = getIdleWorker();
        if (!idle) break;

        const task = taskQueue.shift();
        idle.busy = true;
        idle.worker.postMessage({ id: task.id, type: task.type, params: task.params });
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

        // Timeout guard
        const timer = setTimeout(() => {
            pendingTasks.delete(id);
            // Remove from queue if still waiting
            taskQueue = taskQueue.filter(t => t.id !== id);
            reject(new Error(`Image render timed out after ${TASK_TIMEOUT_MS / 1000}s`));
        }, TASK_TIMEOUT_MS);

        pendingTasks.set(id, { resolve, reject, timer });

        // Try to assign directly to an idle worker
        const idle = getIdleWorker();
        if (idle) {
            idle.busy = true;
            idle.worker.postMessage({ id, type, params });
        } else {
            // Queue it
            taskQueue.push({ id, type, params });
        }
    });
}

/**
 * Gracefully shutdown all workers.
 */
async function shutdownPool() {
    for (const entry of workers) {
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
