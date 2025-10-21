// Client side: geolocation + socket.io chat helpers
document.addEventListener('DOMContentLoaded', () => {
  // connect socket
  const socket = io();

  // expose to window for console/debug
  window.socket = socket;

  // capture geolocation (if forms have lat/lng hidden inputs)
  const geoForms = document.querySelectorAll('.capture-geo');
  if (geoForms.length) {
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      geoForms.forEach(form => {
        let latInput = form.querySelector('[name=lat]');
        let lngInput = form.querySelector('[name=lng]');
        if (latInput) latInput.value = lat;
        if (lngInput) lngInput.value = lng;
      });
    }, err => {
      console.warn('geo error', err);
    });
  }

  // join consultation room if exists
  const consultationId = document.querySelector('#consultationId')?.value;
  if (consultationId) {
    socket.emit('joinConsultation', { consultationId });
  }

  // handle sending messages
  const msgForm = document.querySelector('#msgForm');
  if (msgForm) {
    msgForm.addEventListener('submit', e => {
      e.preventDefault();
      const text = msgForm.querySelector('[name=text]').value;
      socket.emit('message', { consultationId, text });
      msgForm.querySelector('[name=text]').value = '';
    });
  }

  // receive messages
  socket.on('message', msg => {
    const list = document.querySelector('#messages');
    if (!list) return;
    const li = document.createElement('li');
    li.textContent = `[${msg.senderRole}] ${msg.text}`;
    list.appendChild(li);
  });

  // pharmacies: join their pharmacy room if data-pharmacy-id on body
  const pharmEl = document.querySelector('body[data-pharmacy-id]');
  if (pharmEl) {
    const pharmId = pharmEl.getAttribute('data-pharmacy-id');
    socket.emit('joinPharmacy', { pharmacyId: pharmId });
  }

  // notifications for new prescription
  socket.on('newPrescription', data => {
    alert('New prescription: ' + JSON.stringify(data.items));
  });

  socket.on('prescribed', data => {
    alert('Your doctor sent a prescription. ID: ' + data.prescriptionId);
  });

  socket.on('prescriptionAccepted', data => {
    alert('Prescription accepted. ID: ' + data.prescriptionId);
  });
});

