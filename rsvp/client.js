(function (root) {
  'use strict';
  var storageKey = 'jacob-sejin-pending-rsvp';
  var pendingId;
  function replyId() {
    if (pendingId) return pendingId;
    try { pendingId = root.sessionStorage.getItem(storageKey); } catch (_) {}
    if (!pendingId || !/^[a-f0-9-]{32,80}$/i.test(pendingId)) {
      var bytes = new Uint8Array(16);
      root.crypto.getRandomValues(bytes);
      pendingId = Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      try { root.sessionStorage.setItem(storageKey, pendingId); } catch (_) {}
    }
    return pendingId;
  }
  async function submit(url, data) {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) {
      throw new Error('The RSVP connection is not configured yet. Please contact Jacob or Sejin.');
    }
    var id = replyId();
    data.set('replyId', id);
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 30000);
    try {
      // URLSearchParams sends a simple form POST without a CORS preflight.
      // Read the receipt: a sent request alone is not proof of a saved RSVP.
      var response = await root.fetch(url, { method: 'POST', body: data, signal: controller.signal, credentials: 'omit', redirect: 'follow' });
      if (!response.ok) throw new Error('The RSVP service is unavailable. Please try again.');
      var receipt = await response.json();
      if (!receipt || receipt.ok !== true || receipt.replyId !== id) {
        throw new Error(receipt && receipt.error || 'We could not confirm your reply was saved. Please try again.');
      }
      try { root.sessionStorage.removeItem(storageKey); } catch (_) {}
      pendingId = undefined;
      return receipt;
    } finally { clearTimeout(timeout); }
  }
  root.RSVPClient = { submit: submit };
})(typeof window !== 'undefined' ? window : globalThis);
