/* ── Alarm Modal ── */
// ── Alarm Modal ────────────────────────────────────────────────────────────
function openAlarmModal(ev) {
  document.getElementById('alarmEventId').value = ev.id;
  document.getElementById('alarmEventTitle').value = ev.title;
  document.getElementById('alarmEventTime').value = fmtDateTime(new Date(ev.start_time));
  document.getElementById('alarmLeadTime').value = '5';
  const whEl = document.getElementById('alarmWebhookURL');
  if (whEl) whEl.value = '';
  openModal('alarmModal');
}

document.getElementById('btnSaveAlarm').addEventListener('click', async () => {
  const eventId     = parseInt(document.getElementById('alarmEventId').value, 10);
  const leadTime    = parseInt(document.getElementById('alarmLeadTime').value, 10);
  const soundEl     = document.getElementById('alarmSound');
  const sound       = soundEl ? soundEl.value : 'klaxon';
  const webhookEl   = document.getElementById('alarmWebhookURL');
  const webhook_url = webhookEl ? webhookEl.value.trim() : '';
  const res = await apiPost('/api/alarms', {event_id: eventId, lead_time: leadTime, sound, webhook_url});
  if (res.ok) {
    const created = await res.clone().json().catch(() => null);
    if (created && created.id) pushUndo('create_alarm', { id: created.id });
    closeModal('alarmModal');
    await fetchAlarms(); renderSidebar();
    showNotification('success', t('notif_alarm_set'));
  } else { const err = await res.json(); showError(err.error); }
});

async function deleteAlarm(id) {
  const alarmToDelete = (state.alarms||[]).find(a => a.id === parseInt(id, 10));
  const res = await apiDel(`/api/alarms/${id}`);
  if (res.ok) {
    if (alarmToDelete) pushUndo('delete_alarm', { ...alarmToDelete });
    await fetchAlarms(); renderSidebar(); showNotification('success', t('notif_alarm_removed'));
  }
}

