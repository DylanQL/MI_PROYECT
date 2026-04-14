const state = {
  email: '',
  cooldownSeconds: 0,
  timerId: null,
  canSendCode: true,
  allowedDomain: window.__REGISTER_DATA__?.allowedDomain || 'scania.com'
};

const registerEmailForm = document.getElementById('registerEmailForm');
const registerActions = document.getElementById('registerActions');
const verifyCodeForm = document.getElementById('verifyCodeForm');
const registerEmail = document.getElementById('registerEmail');
const sendCodeBtn = document.getElementById('sendCodeBtn');
const haveCodeBtn = document.getElementById('haveCodeBtn');
const cooldownInfo = document.getElementById('cooldownInfo');
const verificationCode = document.getElementById('verificationCode');
const registerMessage = document.getElementById('registerMessage');

function showMessage(message, type = 'success') {
  registerMessage.innerHTML = `<div class="alert ${type === 'error' ? 'error' : 'success'}">${message}</div>`;
}

async function request(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'No se pudo completar la solicitud.');
  }

  return data;
}

function updateSendButtonState() {
  sendCodeBtn.disabled = !state.canSendCode || state.cooldownSeconds > 0;

  if (state.cooldownSeconds > 0) {
    sendCodeBtn.innerHTML = `<i class="bi bi-hourglass-split"></i> Reenviar en ${state.cooldownSeconds}s`;
    cooldownInfo.textContent = `Podras volver a enviar codigo en ${state.cooldownSeconds} segundos.`;
  } else {
    sendCodeBtn.innerHTML = '<i class="bi bi-send"></i> Enviar codigo';
    cooldownInfo.textContent = '';
  }
}

function startCooldown(seconds) {
  if (state.timerId) {
    clearInterval(state.timerId);
  }

  state.cooldownSeconds = Math.max(0, Number(seconds) || 0);
  updateSendButtonState();

  if (state.cooldownSeconds === 0) return;

  state.timerId = setInterval(() => {
    state.cooldownSeconds -= 1;
    if (state.cooldownSeconds <= 0) {
      clearInterval(state.timerId);
      state.timerId = null;
      state.cooldownSeconds = 0;
    }
    updateSendButtonState();
  }, 1000);
}

async function loadStatus() {
  const data = await request('/register/status', { email: state.email });

  state.canSendCode = data.canSendCode;
  startCooldown(data.cooldownRemainingSeconds || 0);

  registerActions.classList.remove('hidden');
}

registerEmailForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = registerEmail.value.trim().toLowerCase();
  if (!email.endsWith(`@${state.allowedDomain}`)) {
    showMessage(`Solo puedes registrarte con dominio @${state.allowedDomain}.`, 'error');
    return;
  }

  state.email = email;

  try {
    await loadStatus();
    showMessage('Correo validado. Puedes enviar codigo o verificar si ya tienes uno.');
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

sendCodeBtn.addEventListener('click', async () => {
  if (!state.email) {
    showMessage('Primero ingresa tu correo y pulsa Siguiente.', 'error');
    return;
  }

  try {
    const data = await request('/register/send-code', { email: state.email });
    verifyCodeForm.classList.remove('hidden');
    showMessage(`${data.message} Expira en 5 minutos.`);
    startCooldown(data.cooldownRemainingSeconds || 60);
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

haveCodeBtn.addEventListener('click', () => {
  if (!state.email) {
    showMessage('Primero ingresa tu correo y pulsa Siguiente.', 'error');
    return;
  }

  verifyCodeForm.classList.remove('hidden');
  verificationCode.focus();
});

verifyCodeForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!state.email) {
    showMessage('Primero ingresa el correo.', 'error');
    return;
  }

  const code = verificationCode.value.trim();

  try {
    const data = await request('/register/verify-code', {
      email: state.email,
      code
    });

    showMessage(data.message);
    verificationCode.value = '';
  } catch (error) {
    showMessage(error.message, 'error');
  }
});
