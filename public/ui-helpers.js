// ============================================================
// Utilidades compartidas: toasts, confirmación, llamadas a la API
// y formato. Se carga antes que app.js/lightbox.js/face-scanner.js
// /video-scanner.js, que dependen de estas funciones globales.
// ============================================================

// --- Toasts (reemplaza alert() nativo, que es bloqueante y poco "app-like") ---
const Toast = (() => {
    let container = null;
    function ensureContainer() {
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    function iconFor(type) {
        if (type === 'success') return '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
        if (type === 'error') return '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm5 13.6-1.4 1.4L12 13.4 8.4 17 7 15.6 10.6 12 7 8.4 8.4 7 12 10.6 15.6 7 17 8.4 13.4 12z"/></svg>';
        return '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/></svg>';
    }

    function show(message, type, duration, actionLabel, actionFn) {
        const c = ensureContainer();
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;

        const icon = document.createElement('span');
        icon.className = 'toast-icon';
        icon.innerHTML = iconFor(type);

        const msg = document.createElement('span');
        msg.className = 'toast-message';
        msg.textContent = message;

        el.appendChild(icon);
        el.appendChild(msg);

        let done = false;
        const remove = () => {
            if (done) return;
            done = true;
            el.classList.remove('toast-visible');
            setTimeout(() => el.remove(), 250);
        };

        if (actionLabel && actionFn) {
            const btn = document.createElement('button');
            btn.className = 'toast-action-btn';
            btn.textContent = actionLabel;
            btn.addEventListener('click', () => { clearTimeout(timer); actionFn(); remove(); });
            el.appendChild(btn);
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close-btn';
        closeBtn.setAttribute('aria-label', 'Cerrar aviso');
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => { clearTimeout(timer); remove(); });
        el.appendChild(closeBtn);

        c.appendChild(el);
        requestAnimationFrame(() => el.classList.add('toast-visible'));
        const timer = setTimeout(remove, duration || 3500);
        return { remove };
    }

    return {
        success: (msg, duration) => show(msg, 'success', duration),
        error: (msg, duration) => show(msg, 'error', duration || 5000),
        info: (msg, duration) => show(msg, 'info', duration),
        action: (msg, actionLabel, actionFn, duration) => show(msg, 'info', duration || 6000, actionLabel, actionFn)
    };
})();
window.Toast = Toast;

// --- Modal de confirmación (reemplaza confirm() nativo) ---
function confirmDialog(opts) {
    const { title, message, confirmLabel, cancelLabel, danger } = typeof opts === 'string' ? { message: opts } : (opts || {});
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-box" role="alertdialog" aria-modal="true">
                <h3 class="confirm-title"></h3>
                <p class="confirm-message"></p>
                <div class="confirm-actions">
                    <button class="confirm-btn confirm-cancel"></button>
                    <button class="confirm-btn confirm-ok"></button>
                </div>
            </div>`;
        overlay.querySelector('.confirm-title').textContent = title || '¿Estás seguro?';
        overlay.querySelector('.confirm-message').textContent = message || '';
        overlay.querySelector('.confirm-cancel').textContent = cancelLabel || 'Cancelar';
        const okBtn = overlay.querySelector('.confirm-ok');
        okBtn.textContent = confirmLabel || 'Confirmar';
        if (danger) okBtn.classList.add('confirm-danger');

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('confirm-visible'));

        function close(result) {
            overlay.classList.remove('confirm-visible');
            document.removeEventListener('keydown', onKey);
            setTimeout(() => overlay.remove(), 200);
            resolve(result);
        }
        function onKey(e) {
            if (e.key === 'Escape') close(false);
            else if (e.key === 'Enter') close(true);
        }
        document.addEventListener('keydown', onKey);
        overlay.querySelector('.confirm-cancel').addEventListener('click', () => close(false));
        okBtn.addEventListener('click', () => close(true));
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(false); });
        okBtn.focus();
    });
}
window.confirmDialog = confirmDialog;

// --- Prompt simple (para renombrar álbumes, crear álbum nuevo, etc.) ---
function promptDialog(opts) {
    const { title, placeholder, initialValue, confirmLabel } = opts || {};
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-box" role="dialog" aria-modal="true">
                <h3 class="confirm-title"></h3>
                <input type="text" class="prompt-input" autocomplete="off">
                <div class="confirm-actions">
                    <button class="confirm-btn confirm-cancel">Cancelar</button>
                    <button class="confirm-btn confirm-ok"></button>
                </div>
            </div>`;
        overlay.querySelector('.confirm-title').textContent = title || '';
        const input = overlay.querySelector('.prompt-input');
        input.placeholder = placeholder || '';
        input.value = initialValue || '';
        overlay.querySelector('.confirm-ok').textContent = confirmLabel || 'Guardar';

        document.body.appendChild(overlay);
        requestAnimationFrame(() => { overlay.classList.add('confirm-visible'); input.focus(); input.select(); });

        function close(result) {
            overlay.classList.remove('confirm-visible');
            document.removeEventListener('keydown', onKey);
            setTimeout(() => overlay.remove(), 200);
            resolve(result);
        }
        function onKey(e) {
            if (e.key === 'Escape') close(null);
            else if (e.key === 'Enter') close(input.value.trim());
        }
        document.addEventListener('keydown', onKey);
        overlay.querySelector('.confirm-cancel').addEventListener('click', () => close(null));
        overlay.querySelector('.confirm-ok').addEventListener('click', () => close(input.value.trim()));
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
    });
}
window.promptDialog = promptDialog;

// --- Diálogo para seleccionar fecha/hora ---
function datePickerDialog(opts) {
    const { title, message, initialDate } = opts || {};
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        let defaultVal = '';
        if (initialDate) {
            const d = new Date(initialDate);
            if (!isNaN(d.getTime())) {
                const tzoffset = (new Date()).getTimezoneOffset() * 60000;
                defaultVal = (new Date(d.getTime() - tzoffset)).toISOString().slice(0, 16);
            }
        }
        overlay.innerHTML = `
            <div class="confirm-box" role="dialog" aria-modal="true">
                <h3 class="confirm-title"></h3>
                <p class="confirm-message" style="margin-bottom:12px;font-size:14px;color:var(--text-secondary);"></p>
                <input type="datetime-local" class="prompt-input date-picker-dialog-input" style="width:100%;padding:8px 12px;margin-bottom:16px;border:1px solid var(--border-color,#dadce0);border-radius:8px;font-family:inherit;font-size:14px;">
                <div class="confirm-actions">
                    <button class="confirm-btn confirm-cancel">Cancelar</button>
                    <button class="confirm-btn confirm-ok">Guardar</button>
                </div>
            </div>`;
        overlay.querySelector('.confirm-title').textContent = title || (window.t ? t('dialog_change_date_title') : 'Cambiar fecha');
        overlay.querySelector('.confirm-message').textContent = message || (window.t ? t('dialog_change_date_prompt') : 'Selecciona la nueva fecha:');
        const input = overlay.querySelector('.date-picker-dialog-input');
        if (defaultVal) input.value = defaultVal;
        overlay.querySelector('.confirm-cancel').textContent = window.t ? t('dialog_cancel') : 'Cancelar';

        document.body.appendChild(overlay);
        requestAnimationFrame(() => { overlay.classList.add('confirm-visible'); input.focus(); });

        function close(result) {
            overlay.classList.remove('confirm-visible');
            document.removeEventListener('keydown', onKey);
            setTimeout(() => overlay.remove(), 200);
            resolve(result);
        }
        function onKey(e) {
            if (e.key === 'Escape') close(null);
            else if (e.key === 'Enter') {
                if (input.value) close(new Date(input.value).toISOString());
                else close(null);
            }
        }
        document.addEventListener('keydown', onKey);
        overlay.querySelector('.confirm-cancel').addEventListener('click', () => close(null));
        overlay.querySelector('.confirm-ok').addEventListener('click', () => {
            if (input.value) close(new Date(input.value).toISOString());
            else close(null);
        });
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
    });
}
window.datePickerDialog = datePickerDialog;

// --- Helper de API: fetch + JSON + manejo de errores consistente ---
const API = {
    async get(url) {
        const res = await fetch(url);
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Error ${res.status}`);
        }
        return res.json();
    },
    async post(url, body) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Error ${res.status}`);
        }
        return res.json();
    },
    async put(url, body) {
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Error ${res.status}`);
        }
        return res.json();
    },
    async del(url, body) {
        const res = await fetch(url, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Error ${res.status}`);
        }
        return res.json();
    }
};
window.API = API;

// --- Formato ---
function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0, val = bytes;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return `${val.toFixed(i === 0 ? 0 : (val >= 10 ? 1 : 2))} ${units[i]}`;
}
window.formatBytes = formatBytes;

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0:00';
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}
window.formatDuration = formatDuration;

function formatDateLong(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(window.localeTag ? window.localeTag() : 'es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
window.formatDateLong = formatDateLong;

function formatDateShort(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(window.localeTag ? window.localeTag() : 'es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
}
window.formatDateShort = formatDateShort;

function formatTime(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(window.localeTag ? window.localeTag() : 'es-ES', { hour: '2-digit', minute: '2-digit' });
}
window.formatTime = formatTime;

function formatMonthYear(date) {
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const formatted = d.toLocaleDateString(window.localeTag ? window.localeTag() : 'es-ES', { month: 'short', year: 'numeric' });
    // Capitalizamos la primera letra: español/inglés dan meses en minúscula
    // ("jul 2024" → "Jul 2024"), que es justo el estilo que buscamos para la burbuja
    // de la barra lateral. En hebreo no hay mayúsculas, así que es inocuo.
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
window.formatMonthYear = formatMonthYear;

function formatShutterSpeed(exposureTime) {
    if (!exposureTime) return null;
    if (exposureTime >= 1) return `${exposureTime}s`;
    return `1/${Math.round(1 / exposureTime)}s`;
}
window.formatShutterSpeed = formatShutterSpeed;

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}
window.escapeHtml = escapeHtml;

function debounce(fn, wait) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}
window.debounce = debounce;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
window.sleep = sleep;
