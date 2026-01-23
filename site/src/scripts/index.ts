import { consumeAuthResponse, getToken, login } from '../lib/auth';

const connectButton = document.querySelector('[data-action="connect"]');

if (connectButton) {
  connectButton.addEventListener('click', () => {
    try {
      login();
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Missing client ID.');
    }
  });
}

consumeAuthResponse()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Authorization failed.');
  })
  .finally(() => {
    const token = getToken();
    if (token && connectButton) {
      const baseUrl = document.body.dataset.baseUrl || '';
      connectButton.innerHTML = `
        <img src="${baseUrl}/anilist-logo.svg" alt="" class="h-5 w-5" />
        <span>Connected ✓</span>
      `;
      connectButton.classList.add('btn-connected');
      connectButton.setAttribute('disabled', 'true');
    }
  });
