// ---------- CONTACT FORM SUBMIT ----------
document.getElementById('contactForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const note = document.getElementById('formNote');
  note.textContent = '⏳ Sending...';

  try {
    const formData = new FormData(e.target); // вклучува и фајлот автоматски
    const res = await fetch('/api/contact', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (data.ok) {
      note.textContent = '✅ Successfully sent!';
      e.target.reset();
    } else {
      note.textContent = '❌ Failed to send';
    }
  } catch (err) {
    console.error('Form send error', err);
    note.textContent = '⚠️ Error sending form';
  }
});
