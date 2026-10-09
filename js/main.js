'use strict';

  /* ---------- init ---------- */

  $('#shortcuts-btn').insertAdjacentHTML('afterbegin', icon('keyboard', 15));
  useDataset(START_DATASET);
  load();
  render();
  setInterval(() => {
    const sub = $('#pos-head .panel-sub');
    if (sub) sub.textContent = posSubText();
  }, 30000);
