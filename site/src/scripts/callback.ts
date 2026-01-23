import { consumeAuthResponse } from '../lib/auth';

const status = document.querySelector('[data-auth-status]');

consumeAuthResponse()
  .then((token) => {
    if (token) {
      window.location.replace('/rank');
    } else {
      window.location.replace('/');
    }
  })
  .catch((error) => {
    if (status) {
      status.textContent =
        error instanceof Error ? error.message : 'Authorization failed.';
    }
  });
