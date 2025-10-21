const socket = io();

// helper to join per-role personal room
function joinPersonalRoom(role, id) {
  if (!role || !id) return;
  socket.emit('joinRoom', { room: `${role}-${id}` });
}

// convenience attach to window so EJS templates can call
window.HealthSockets = { socket, joinPersonalRoom };

// notifications handlers
socket.on('newRequest', (d) => {
  alert('New consultation request received');
});
socket.on('newPrescription', (d) => {
  alert('New prescription received');
});
socket.on('prescribed', (d) => {
  console.log('prescribed', d);
});
socket.on('prescriptionAccepted', (d) => {
  alert('Your prescription was accepted by a pharmacy');
});
