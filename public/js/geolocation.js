// used on register forms to auto-fill lat/lng hidden inputs
window.addEventListener('load', () => {
  const latEl = document.getElementById('lat');
  const lngEl = document.getElementById('lng');
  if (!latEl || !lngEl) return;
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      latEl.value = pos.coords.latitude;
      lngEl.value = pos.coords.longitude;
    }, (err) => {
      console.log('Geolocation error', err);
    }, { enableHighAccuracy: true, timeout: 10000 });
  }
});
