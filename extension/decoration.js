(function (root) {
  "use strict";
  const core = typeof module !== "undefined" && module.exports ? require("./core.js") : root.ClusterfudgeCore;

  class PageDecoration {
    constructor(document) {
      this.document = document;
      this.title = new core.TitleState();
      this.cluster = null;
      this.pending = false;
      this.observer = new document.defaultView.MutationObserver(() => this.schedule());
    }

    setCluster(cluster) {
      this.cluster = cluster;
      this.refresh();
    }

    schedule() {
      if (this.pending) return;
      this.pending = true;
      queueMicrotask(() => {
        this.pending = false;
        this.refresh();
      });
    }

    refresh() {
      this.observer.disconnect();
      const document = this.document;
      const title = this.title.apply(document.title, this.cluster?.name || null);
      if (document.title !== title) document.title = title;
      if (this.cluster && document.head) {
        this.observer.observe(document.head, {
          subtree: true, childList: true, characterData: true
        });
        this.observer.observe(document.documentElement, { childList: true });
      }
    }

    stop() {
      this.setCluster(null);
      this.observer.disconnect();
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { PageDecoration };
  else root.ClusterfudgeDecoration = { PageDecoration };
})(globalThis);