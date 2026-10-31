(function () {
  var MIN_SCALE = 0.1;
  var MAX_SCALE = 8;
  var ZOOM_STEP = 1.25;
  var IDLE_DELAY = 2000;

  var params = new URLSearchParams(window.location.search);
  var src = params.get('src');
  var isVideo = params.get('type') === 'video';
  var stage = document.getElementById('stage');
  var zoomLabel = document.getElementById('zoom');

  var labels = document.documentElement.lang.indexOf('ru') === 0 || navigator.language.indexOf('ru') === 0
    ? {
      error: 'Медиа больше недоступно', zoomIn: 'Увеличить', zoomOut: 'Уменьшить', fit: 'По размеру окна',
    }
    : undefined;
  if (labels) {
    document.getElementById('error').textContent = labels.error;
    [['zoom-in', labels.zoomIn], ['zoom-out', labels.zoomOut], ['fit', labels.fit]].forEach(function (entry) {
      var button = document.getElementById(entry[0]);
      button.setAttribute('aria-label', entry[1]);
      button.title = entry[1] + button.title.slice(button.title.indexOf(' ('));
    });
  }

  function closeWindow() {
    var internals = window.__TAURI_INTERNALS__;
    if (internals) {
      internals.invoke('plugin:window|close', { label: internals.metadata.currentWindow.label });
    } else {
      window.close();
    }
  }

  function showError() {
    document.body.classList.add('has-error');
  }

  function isAllowedSource(url) {
    try {
      var parsed = new URL(url, window.location.href);
      var origin = parsed.protocol === 'blob:' ? new URL(parsed.pathname).origin : parsed.origin;
      return origin === window.location.origin;
    } catch (err) {
      return false;
    }
  }

  if (!src || !isAllowedSource(src)) {
    showError();
    return;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeWindow();
  });

  if (isVideo) {
    document.body.classList.add('is-video');
    stage.classList.add('is-video');
    var video = document.createElement('video');
    video.className = 'media';
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.src = src;
    video.addEventListener('loadeddata', function () { video.classList.add('is-ready'); });
    video.addEventListener('error', showError);
    stage.appendChild(video);
    return;
  }

  var image = document.createElement('img');
  image.className = 'media';
  image.alt = '';
  image.draggable = false;
  stage.appendChild(image);

  var scale = 1;
  var x = 0;
  var y = 0;
  var fitScale = 1;

  function apply() {
    image.style.transform = 'translate(' + x + 'px, ' + y + 'px) scale(' + scale + ')';
    zoomLabel.textContent = Math.round((scale / fitScale) * 100) + '%';
  }

  function fit() {
    var width = image.naturalWidth;
    var height = image.naturalHeight;
    if (!width || !height) return;
    fitScale = Math.min(1, window.innerWidth / width, window.innerHeight / height);
    scale = fitScale;
    x = (window.innerWidth - width * scale) / 2;
    y = (window.innerHeight - height * scale) / 2;
    apply();
  }

  function zoomAt(nextScale, pointX, pointY) {
    var clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    x = pointX - ((pointX - x) * clamped) / scale;
    y = pointY - ((pointY - y) * clamped) / scale;
    scale = clamped;
    apply();
  }

  function zoomCenter(factor) {
    zoomAt(scale * factor, window.innerWidth / 2, window.innerHeight / 2);
  }

  image.style.position = 'absolute';
  image.style.left = '0';
  image.style.top = '0';
  image.style.maxWidth = 'none';
  image.style.maxHeight = 'none';
  image.addEventListener('load', function () {
    fit();
    image.classList.add('is-ready');
  });
  image.addEventListener('error', showError);
  image.src = src;

  window.addEventListener('resize', fit);

  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoomAt(scale * Math.pow(ZOOM_STEP, -e.deltaY / 100), e.clientX, e.clientY);
  }, { passive: false });

  stage.addEventListener('dblclick', function (e) {
    if (Math.abs(scale - fitScale) > 0.001) {
      fit();
    } else {
      zoomAt(fitScale * 2, e.clientX, e.clientY);
    }
  });

  var pan;
  stage.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    pan = { startX: e.clientX - x, startY: e.clientY - y };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('is-panning');
  });
  stage.addEventListener('pointermove', function (e) {
    if (!pan) return;
    x = e.clientX - pan.startX;
    y = e.clientY - pan.startY;
    apply();
  });
  function endPan() {
    pan = undefined;
    stage.classList.remove('is-panning');
  }
  stage.addEventListener('pointerup', endPan);
  stage.addEventListener('pointercancel', endPan);

  document.getElementById('zoom-in').addEventListener('click', function () { zoomCenter(ZOOM_STEP); });
  document.getElementById('zoom-out').addEventListener('click', function () { zoomCenter(1 / ZOOM_STEP); });
  document.getElementById('fit').addEventListener('click', fit);

  document.addEventListener('keydown', function (e) {
    if (e.key === '+' || e.key === '=') zoomCenter(ZOOM_STEP);
    if (e.key === '-') zoomCenter(1 / ZOOM_STEP);
    if (e.key === '0') fit();
  });

  var idleTimeout;
  function wake() {
    document.body.classList.remove('is-idle');
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(function () { document.body.classList.add('is-idle'); }, IDLE_DELAY);
  }
  document.addEventListener('pointermove', wake);
  wake();
}());
