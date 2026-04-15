const state = {
  email: String(window.__REGISTER_CODE_DATA__?.email || '').trim().toLowerCase(),
  cooldownSeconds: 0,
  timerId: null,
  canSendCode: true,
  isSending: false
};

const sendCodeBtn = document.getElementById('sendCodeBtn');
const verifyCodeForm = document.getElementById('verifyCodeForm');
const verificationCode = document.getElementById('verificationCode');
const registerMessage = document.getElementById('registerMessage');
const registerStatus = document.getElementById('registerStatus');
const otpInputs = Array.from(document.querySelectorAll('.otp-input'));

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
    const error = new Error(data.message || 'No se pudo completar la solicitud.');
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function updateSendButtonState() {
  sendCodeBtn.disabled = state.isSending || !state.canSendCode || state.cooldownSeconds > 0;

  if (state.isSending) {
    sendCodeBtn.textContent = 'Enviando...';
    return;
  }

  if (state.cooldownSeconds > 0) {
    sendCodeBtn.textContent = `Reenviar en ${state.cooldownSeconds}s`;
  } else {
    sendCodeBtn.textContent = 'Reenviar';
  }
}

function bindOtpInputs() {
  otpInputs.forEach((input, index) => {
    input.addEventListener('input', (event) => {
      const cleanValue = String(event.target.value || '').replace(/\D/g, '').slice(0, 1);
      event.target.value = cleanValue;

      if (cleanValue && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !input.value && index > 0) {
        otpInputs[index - 1].focus();
      }
    });

    input.addEventListener('paste', (event) => {
      const pasted = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      if (!pasted) return;

      event.preventDefault();
      pasted.split('').forEach((digit, offset) => {
        if (otpInputs[offset]) otpInputs[offset].value = digit;
      });

      const nextIndex = Math.min(pasted.length, otpInputs.length - 1);
      otpInputs[nextIndex].focus();
    });
  });
}

function readOtpCode() {
  return otpInputs.map((input) => input.value.trim()).join('');
}

function startCooldown(seconds) {
  if (state.timerId) clearInterval(state.timerId);

  state.cooldownSeconds = Math.max(0, Number(seconds) || 0);
  state.canSendCode = state.cooldownSeconds === 0;
  updateSendButtonState();

  if (state.cooldownSeconds === 0) return;

  state.timerId = setInterval(() => {
    state.cooldownSeconds -= 1;
    if (state.cooldownSeconds <= 0) {
      clearInterval(state.timerId);
      state.timerId = null;
      state.cooldownSeconds = 0;
      state.canSendCode = true;
    }
    updateSendButtonState();
  }, 1000);
}

async function loadStatus() {
  const data = await request('/register/status', { email: state.email });
  state.canSendCode = Boolean(data.canSendCode);
  startCooldown(data.cooldownRemainingSeconds || 0);
}

async function sendCode() {
  if (state.isSending || state.cooldownSeconds > 0 || !state.email) return;

  try {
    state.isSending = true;
    updateSendButtonState();

    const data = await request('/register/send-code', { email: state.email });
    registerMessage.innerHTML = '';
    registerStatus.textContent = 'Codigo enviado. Revisa tu bandeja de entrada.';
    otpInputs[0]?.focus();
    state.isSending = false;
    state.canSendCode = false;
    startCooldown(data.cooldownRemainingSeconds || 60);
  } catch (error) {
    state.isSending = false;
    if (error?.payload?.cooldownRemainingSeconds) {
      startCooldown(error.payload.cooldownRemainingSeconds);
    }
    showMessage(error.message, 'error');
  }
}

sendCodeBtn.addEventListener('click', async () => {
  await sendCode();
});

verifyCodeForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const code = readOtpCode();
  if (code.length !== 6) {
    showMessage('Ingresa los 6 digitos del codigo.', 'error');
    return;
  }

  verificationCode.value = code;

  try {
    const data = await request('/register/verify-code', {
      email: state.email,
      code: verificationCode.value.trim()
    });

    showMessage(data.message);
    registerStatus.textContent = 'Codigo validado correctamente.';
    verificationCode.value = '';
    otpInputs.forEach((input) => {
      input.value = '';
    });
    otpInputs[0]?.focus();
  } catch (error) {
    registerStatus.textContent = '';
    showMessage(error.message, 'error');
  }
});

bindOtpInputs();

async function initVerificationFlow() {
  try {
    await loadStatus();

    if (state.cooldownSeconds > 0) {
      registerStatus.textContent = `Ya enviamos un codigo. Podras reenviar en ${state.cooldownSeconds}s.`;
      return;
    }

    await sendCode();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

initVerificationFlow();
