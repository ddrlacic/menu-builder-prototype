'use strict';

  /* ---------- init ---------- */

  useDataset(START_DATASET);
  load();
  render();
  setInterval(() => {
    const sub = $('#pos-head .panel-sub');
    if (sub) sub.textContent = posSubText();
  }, 30000);
