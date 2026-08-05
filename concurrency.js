// Ejecuta `worker` sobre cada elemento de `items`, con como máximo `limit` llamadas
// en vuelo a la vez. Se usa tanto para escanear archivos como para mover fotos a la
// papelera/restaurarlas: son operaciones de disco (I/O), así que hacer varias en
// paralelo aprovecha mucho mejor el sistema que una por una, sin bloquear el hilo
// principal de Node (que sigue libre para responder otras peticiones mientras tanto).
async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let index = 0;
    const workerCount = Math.max(1, Math.min(limit, items.length));
    const runners = new Array(workerCount).fill(0).map(async () => {
        while (index < items.length) {
            const current = index++;
            try {
                results[current] = { ok: true, value: await worker(items[current], current) };
            } catch (e) {
                results[current] = { ok: false, error: e };
            }
        }
    });
    await Promise.all(runners);
    return results;
}

module.exports = { mapWithConcurrency };
