/** 在运行中的应用里精确定位 profilesDelete 行为 */
const http = require("http");
function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: "localhost", port: 9222, path }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}
async function main() {
  const targets = await getJSON("/json");
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const call = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => (await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

  // 监听主进程 console（renderer console 不含主进程，但 IPC 错误会以 rejection 出现）
  const out = await ev(`
    (async () => {
      try {
        const p = await window.nutrition.profilesSave({ name: '定位删除' });
        const before = (await window.nutrition.profilesList()).map(x => x.name);
        const del = await window.nutrition.profilesDelete(p.id);
        const after = (await window.nutrition.profilesList()).map(x => x.name);
        return { id: p.id, before, del: JSON.stringify(del), after };
      } catch (e) { return { exception: e.message }; }
    })()
  `);
  console.log(JSON.stringify(out, null, 2));
  ws.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
