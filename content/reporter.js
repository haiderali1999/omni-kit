// OmniKit bug reporter: runs in the page's MAIN world from document_start and
// quietly buffers JS errors, console.error calls, and failed network requests
// so a bug report can include them after the fact.
(() => {
  if (window.__okReporter) return;
  window.__okReporter = true;

  const errors = (window.__okErrors = []);
  const nets = (window.__okNetErrors = []);
  const push = (arr, item) => {
    arr.push(item);
    if (arr.length > 50) arr.shift();
  };
  const str = (v) => {
    if (typeof v === "string") return v;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  };

  window.addEventListener("error", (e) => {
    push(errors, {
      t: Date.now(),
      msg: (e.message || "Script error").slice(0, 500),
      src: e.filename ? `${e.filename}:${e.lineno}` : ""
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    push(errors, { t: Date.now(), msg: ("Unhandled rejection: " + str(e.reason)).slice(0, 500), src: "" });
  });

  const origError = console.error;
  console.error = function (...args) {
    push(errors, { t: Date.now(), msg: args.map(str).join(" ").slice(0, 500), src: "console.error" });
    return origError.apply(this, args);
  };

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const input = args[0];
    const url = String(typeof input === "string" ? input : (input && input.url) || "").slice(0, 300);
    const method = ((args[1] && args[1].method) || (input && input.method) || "GET").toUpperCase();
    return origFetch.apply(this, args).then(
      (res) => {
        if (!res.ok) push(nets, { t: Date.now(), method, status: res.status, url });
        return res;
      },
      (err) => {
        push(nets, { t: Date.now(), method, status: "network error", url });
        throw err;
      }
    );
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__okReq = { method: String(method).toUpperCase(), url: String(url).slice(0, 300) };
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("loadend", () => {
      if (this.__okReq && (this.status === 0 || this.status >= 400)) {
        push(nets, {
          t: Date.now(),
          method: this.__okReq.method,
          status: this.status || "network error",
          url: this.__okReq.url
        });
      }
    });
    return origSend.apply(this, args);
  };
})();
