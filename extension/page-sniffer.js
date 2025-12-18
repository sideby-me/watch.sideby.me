(function () {
  if (window.__sidebyPageSnifferInjected) return;
  window.__sidebyPageSnifferInjected = true;

  const SNIFFER_EVENT = 'sideby:sniffer';
  const mediaSourceToUrl = new WeakMap();
  const sourceBufferToMediaSource = new WeakMap();
  const sourceBufferToUrl = new WeakMap();
  let lastRecordedVideoRequest = { url: '', time: 0 };

  function dispatch(detail) {
    try {
      window.dispatchEvent(new CustomEvent(SNIFFER_EVENT, { detail }));
    } catch (err) {
      console.warn('Sideby.me sniffer: dispatch failed', err);
    }
  }

  function isLikelyVideoRequest(url, contentType) {
    if (typeof url !== 'string') return false;
    const lower = url.toLowerCase();

    const hasVideoExtension = /\.(m3u8|mp4|webm|m4v|ts)(\?|$)/i.test(lower);
    const isVideoContentType =
      typeof contentType === 'string' &&
      (/^video\//i.test(contentType) || /application\/(vnd\.apple\.mpegurl|x-mpegurl)/i.test(contentType));

    return hasVideoExtension || isVideoContentType;
  }

  function recordVideoRequest(url, contentType) {
    if (!isLikelyVideoRequest(url, contentType)) return;
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return;

    const time =
      typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
    lastRecordedVideoRequest = { url, time };
    dispatch({ type: 'network', url, contentType, time });
  }

  function patchFetch() {
    const originalFetch = window.fetch;
    if (typeof originalFetch !== 'function') return;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      try {
        const req = args[0];
        const reqUrl = typeof req === 'string' ? req : req?.url;
        const url = response?.url || reqUrl;
        const contentType = response?.headers?.get?.('content-type');
        recordVideoRequest(url, contentType);
      } catch (err) {
        console.warn('Sideby.me sniffer: fetch patch failed', err);
      }

      return response;
    };
  }

  function patchXHR() {
    const originalOpen = XMLHttpRequest?.prototype?.open;
    if (typeof originalOpen !== 'function') return;

    XMLHttpRequest.prototype.open = function (...args) {
      const url = args[1];

      this.addEventListener(
        'loadend',
        function () {
          try {
            const responseUrl = this.responseURL || url;
            const contentType = this.getResponseHeader ? this.getResponseHeader('content-type') : undefined;
            recordVideoRequest(responseUrl, contentType);
          } catch (err) {
            console.warn('Sideby.me sniffer: XHR patch failed', err);
          }
        },
        { once: true }
      );

      return originalOpen.apply(this, args);
    };
  }

  function patchMediaSource() {
    const originalCreateObjectURL = URL.createObjectURL?.bind(URL);
    const originalAddSourceBuffer = MediaSource?.prototype?.addSourceBuffer;
    const originalAppendBuffer = SourceBuffer?.prototype?.appendBuffer;

    if (typeof originalAddSourceBuffer === 'function') {
      MediaSource.prototype.addSourceBuffer = function (...args) {
        const sb = originalAddSourceBuffer.apply(this, args);
        try {
          sourceBufferToMediaSource.set(sb, this);
        } catch (err) {
          console.warn('Sideby.me sniffer: addSourceBuffer patch failed', err);
        }
        return sb;
      };
    }

    if (typeof originalAppendBuffer === 'function') {
      SourceBuffer.prototype.appendBuffer = function (...args) {
        try {
          const now =
            typeof performance !== 'undefined' && typeof performance.now === 'function'
              ? performance.now()
              : Date.now();
          const recencyMs = 5000;

          if (
            !sourceBufferToUrl.has(this) &&
            lastRecordedVideoRequest.url &&
            now - lastRecordedVideoRequest.time < recencyMs
          ) {
            sourceBufferToUrl.set(this, lastRecordedVideoRequest.url);
            const ms = sourceBufferToMediaSource.get(this);
            if (ms) {
              mediaSourceToUrl.set(ms, lastRecordedVideoRequest.url);
            }
          }
        } catch (err) {
          console.warn('Sideby.me sniffer: appendBuffer patch failed', err);
        }

        return originalAppendBuffer.apply(this, args);
      };
    }

    if (typeof originalCreateObjectURL === 'function') {
      URL.createObjectURL = function (target) {
        const url = originalCreateObjectURL(target);
        try {
          if (target instanceof MediaSource) {
            const sourceUrl = mediaSourceToUrl.get(target);
            if (sourceUrl) {
              dispatch({ type: 'blobMap', blobUrl: url, sourceUrl });
            }
          }
        } catch (err) {
          console.warn('Sideby.me sniffer: createObjectURL patch failed', err);
        }
        return url;
      };
    }
  }

  patchFetch();
  patchXHR();
  patchMediaSource();
})();
