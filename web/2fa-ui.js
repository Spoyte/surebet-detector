/**
 * Two-Factor Authentication UI Component
 * Adds 2FA setup and verification UI to the dashboard
 */

class TwoFactorAuthUI {
  constructor() {
    this.apiBase = '/api/2fa';
    this.userId = null;
    this.sessionId = null;
    this.init();
  }

  init() {
    // Add 2FA button to settings modal
    this.add2FASection();
    
    // Check for existing session
    this.sessionId = localStorage.getItem('sessionId');
    this.userId = localStorage.getItem('userId');
  }

  add2FASection() {
    // Find settings form
    const settingsForm = document.querySelector('.settings-form');
    if (!settingsForm) return;

    // Create 2FA section
    const section = document.createElement('div');
    section.className = 'settings-section';
    section.id = '2fa-section';
    section.innerHTML = `
      <h3>🔐 Two-Factor Authentication</h3>
      <div id="2fa-status">
        <p>Checking 2FA status...</p>
      </div>
      <div id="2fa-actions" style="margin-top: 1rem;"></div>
    `;

    settingsForm.appendChild(section);

    // Load 2FA status
    this.load2FAStatus();
  }

  async load2FAStatus() {
    if (!this.userId) {
      this.updateStatus('not-configured');
      return;
    }

    try {
      const response = await fetch(`${this.apiBase}/status/${this.userId}`);
      const status = await response.json();
      this.updateStatus(status.enabled ? 'enabled' : 'disabled', status);
    } catch (error) {
      console.error('Failed to load 2FA status:', error);
      this.updateStatus('error');
    }
  }

  updateStatus(state, data = {}) {
    const statusEl = document.getElementById('2fa-status');
    const actionsEl = document.getElementById('2fa-actions');

    switch (state) {
      case 'enabled':
        statusEl.innerHTML = `
          <div class="2fa-enabled-badge">
            <span class="badge-icon">✅</span>
            <span>2FA is enabled</span>
          </div>
          <p class="2fa-info">
            Your account is protected with two-factor authentication.
            <br>
            Backup codes remaining: <strong>${data.remainingBackupCodes || 0}</strong>
          </p>
        `;
        actionsEl.innerHTML = `
          <button class="btn btn-secondary" onclick="twoFactorUI.showDisableModal()">
            Disable 2FA
          </button>
          <button class="btn btn-secondary" onclick="twoFactorUI.showBackupCodesModal()">
            View Backup Codes
          </button>
        `;
        break;

      case 'disabled':
        statusEl.innerHTML = `
          <div class="2fa-disabled-badge">
            <span class="badge-icon">⚠️</span>
            <span>2FA is not enabled</span>
          </div>
          <p class="2fa-info">
            Enable two-factor authentication for additional security.
          </p>
        `;
        actionsEl.innerHTML = `
          <button class="btn btn-primary" onclick="twoFactorUI.showSetupModal()">
            Enable 2FA
          </button>
        `;
        break;

      case 'setup':
        // Setup in progress - handled by modal
        break;

      case 'not-configured':
        statusEl.innerHTML = `
          <p class="2fa-info">
            Please log in to configure two-factor authentication.
          </p>
        `;
        actionsEl.innerHTML = '';
        break;

      case 'error':
        statusEl.innerHTML = `
          <p class="2fa-error">Failed to load 2FA status. Please try again.</p>
        `;
        break;
    }
  }

  async showSetupModal() {
    const modal = this.createModal('Setup Two-Factor Authentication');
    modal.content.innerHTML = `
      <div class="2fa-setup-step" id="setup-step-1">
        <p>Setting up 2FA for your account...⏳</p>
      </div>
      <div class="2fa-setup-step" id="setup-step-2" style="display: none;">
        <p>1. Scan this QR code with your authenticator app:</p>
        <div class="qr-code-container">
          <img id="setup-qr-code" src="" alt="2FA QR Code" style="max-width: 200px;">
        </div>
        <p>2. Or enter this secret manually:</p>
        <code id="setup-secret" class="secret-code"></code>
        <div class="form-group" style="margin-top: 1.5rem;">
          <label>Enter 6-digit code from your app:</label>
          <input type="text" id="verify-token" maxlength="6" placeholder="000000"
                 style="font-size: 1.5rem; letter-spacing: 0.5rem; text-align: center;">
        </div>
        <div id="backup-codes-section" style="display: none; margin-top: 1.5rem;">
          <h4>🔑 Backup Codes</h4>
          <p class="warning">Save these codes in a secure location! They can be used if you lose access to your authenticator app.</p>
          <div id="backup-codes-list" class="backup-codes"></div>
          <button class="btn btn-primary" onclick="twoFactorUI.copyBackupCodes()">Copy Codes</button>
        </div>
      </div>
    `;

    modal.footer.innerHTML = `
      <button class="btn btn-secondary" onclick="twoFactorUI.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="verify-btn" onclick="twoFactorUI.verifyAndEnable()" disabled>
        Verify & Enable
      </button>
    `;

    this.openModal(modal);

    // Start setup
    try {
      const response = await fetch(`${this.apiBase}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          username: localStorage.getItem('username') || 'user',
        }),
      });

      const data = await response.json();
      if (data.success) {
        this.setupData = data;
        document.getElementById('setup-step-1').style.display = 'none';
        document.getElementById('setup-step-2').style.display = 'block';
        document.getElementById('setup-qr-code').src = data.qrCode;
        document.getElementById('setup-secret').textContent = data.secret;
        document.getElementById('verify-btn').disabled = false;

        // Enable input
        const input = document.getElementById('verify-token');
        input.addEventListener('input', (e) => {
          e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
        });
      }
    } catch (error) {
      console.error('Setup failed:', error);
      document.getElementById('setup-step-1').innerHTML = `
        <p class="error">Failed to set up 2FA. Please try again.</p>
      `;
    }
  }

  async verifyAndEnable() {
    const token = document.getElementById('verify-token').value;
    if (token.length !== 6) {
      alert('Please enter a 6-digit code');
      return;
    }

    try {
      const response = await fetch(`${this.apiBase}/verify-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          token,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Show backup codes
        document.getElementById('backup-codes-section').style.display = 'block';
        const codesList = document.getElementById('backup-codes-list');
        codesList.innerHTML = this.setupData.backupCodes
          .map((code) => `<div class="backup-code">${code}</div>`)
          .join('');

        // Update button
        document.getElementById('verify-btn').textContent = 'Done';
        document.getElementById('verify-btn').onclick = () => {
          this.closeModal();
          this.load2FAStatus();
        };

        // Hide cancel button
        const cancelBtn = document.querySelector('.modal-footer .btn-secondary');
        if (cancelBtn) cancelBtn.style.display = 'none';
      } else {
        alert('Invalid code. Please try again.');
      }
    } catch (error) {
      console.error('Verification failed:', error);
      alert('Verification failed. Please try again.');
    }
  }

  copyBackupCodes() {
    const codes = this.setupData?.backupCodes?.join('\n') || '';
    navigator.clipboard.writeText(codes).then(() => {
      alert('Backup codes copied to clipboard!');
    });
  }

  showDisableModal() {
    const modal = this.createModal('Disable Two-Factor Authentication');
    modal.content.innerHTML = `
      <div class="warning-box">
        <strong>⚠️ Warning</strong>
        <p>Disabling 2FA will make your account less secure. You will need to enter your current 2FA code to proceed.</p>
      </div>
      <div class="form-group" style="margin-top: 1.5rem;">
        <label>Enter 6-digit code from your authenticator app:</label>
        <input type="text" id="disable-token" maxlength="6" placeholder="000000"
               style="font-size: 1.5rem; letter-spacing: 0.5rem; text-align: center;">
      </div>
    `;

    modal.footer.innerHTML = `
      <button class="btn btn-secondary" onclick="twoFactorUI.closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="twoFactorUI.disable2FA()">Disable 2FA</button>
    `;

    this.openModal(modal);

    // Auto-focus input
    setTimeout(() => document.getElementById('disable-token')?.focus(), 100);
  }

  async disable2FA() {
    const token = document.getElementById('disable-token').value;
    if (token.length !== 6) {
      alert('Please enter a 6-digit code');
      return;
    }

    try {
      const response = await fetch(`${this.apiBase}/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          token,
        }),
      });

      const data = await response.json();
      if (data.success) {
        this.closeModal();
        this.load2FAStatus();
        alert('2FA has been disabled.');
      } else {
        alert('Invalid code. Please try again.');
      }
    } catch (error) {
      console.error('Disable failed:', error);
      alert('Failed to disable 2FA. Please try again.');
    }
  }

  showBackupCodesModal() {
    const modal = this.createModal('Regenerate Backup Codes');
    modal.content.innerHTML = `
      <p>Generate new backup codes? This will invalidate your existing codes.</p>
      <div class="form-group" style="margin-top: 1.5rem;">
        <label>Enter 6-digit code from your authenticator app:</label>
        <input type="text" id="regenerate-token" maxlength="6" placeholder="000000"
               style="font-size: 1.5rem; letter-spacing: 0.5rem; text-align: center;">
      </div>
      <div id="new-backup-codes" style="display: none; margin-top: 1.5rem;"></div>
    `;

    modal.footer.innerHTML = `
      <button class="btn btn-secondary" onclick="twoFactorUI.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="regenerate-btn" onclick="twoFactorUI.regenerateBackupCodes()">
        Generate New Codes
      </button>
    `;

    this.openModal(modal);
  }

  async regenerateBackupCodes() {
    const token = document.getElementById('regenerate-token').value;
    if (token.length !== 6) {
      alert('Please enter a 6-digit code');
      return;
    }

    try {
      const response = await fetch(`${this.apiBase}/backup-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          token,
        }),
      });

      const data = await response.json();
      if (data.success) {
        const codesDiv = document.getElementById('new-backup-codes');
        codesDiv.style.display = 'block';
        codesDiv.innerHTML = `
          <h4>🔑 Your New Backup Codes</h4>
          <p class="warning">Save these in a secure location!</p>
          <div class="backup-codes">
            ${data.backupCodes.map((code) => `<div class="backup-code">${code}</div>`).join('')}
          </div>
          <button class="btn btn-secondary" onclick="twoFactorUI.copyNewBackupCodes()">Copy Codes</button>
        `;

        document.getElementById('regenerate-btn').textContent = 'Done';
        document.getElementById('regenerate-btn').onclick = () => {
          this.closeModal();
          this.load2FAStatus();
        };
      } else {
        alert('Invalid code. Please try again.');
      }
    } catch (error) {
      console.error('Failed to regenerate codes:', error);
      alert('Failed to regenerate backup codes. Please try again.');
    }
  }

  copyNewBackupCodes() {
    const codes = Array.from(document.querySelectorAll('.backup-code'))
      .map((el) => el.textContent)
      .join('\n');
    navigator.clipboard.writeText(codes).then(() => {
      alert('Backup codes copied to clipboard!');
    });
  }

  // Modal helpers
  createModal(title) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => {
      if (e.target === overlay) this.closeModal();
    };

    const modal = document.createElement('div');
    modal.className = 'modal-dialog';
    modal.innerHTML = `
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="btn-icon" onclick="twoFactorUI.closeModal()">✕</button>
      </div>
      <div class="modal-body"></div>
      <div class="modal-footer"></div>
    `;

    overlay.appendChild(modal);

    return {
      overlay,
      content: modal.querySelector('.modal-body'),
      footer: modal.querySelector('.modal-footer'),
    };
  }

  openModal(modal) {
    this.closeModal();
    document.body.appendChild(modal.overlay);
    document.body.style.overflow = 'hidden';
  }

  closeModal() {
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) {
      overlay.remove();
      document.body.style.overflow = '';
    }
  }

  // 2FA verification prompt (for login)
  async promptFor2FA(sessionId) {
    return new Promise((resolve) => {
      const modal = this.createModal('Two-Factor Authentication');
      modal.content.innerHTML = `
        <p>Please enter the 6-digit code from your authenticator app:</p>
        <div class="form-group" style="margin-top: 1.5rem;">
          <input type="text" id="2fa-login-token" maxlength="6" placeholder="000000"
                 style="font-size: 2rem; letter-spacing: 0.5rem; text-align: center; width: 100%;"
                 autocomplete="one-time-code">
        </div>
        <p style="margin-top: 1rem; font-size: 0.875rem; color: var(--text-muted);">
          Or use a <a href="#" onclick="twoFactorUI.showBackupCodeInput(); return false;">backup code</a>
        </p>
        <div id="backup-code-input" style="display: none; margin-top: 1rem;">
          <input type="text" id="2fa-backup-code" placeholder="XXXX-XXXX"
                 style="font-size: 1.25rem; text-align: center; width: 100%; text-transform: uppercase;">
        </div>
      `;

      modal.footer.innerHTML = `
        <button class="btn btn-primary" onclick="twoFactorUI.submit2FA('${sessionId}')">Verify</button>
      `;

      this.openModal(modal);

      // Auto-focus input
      setTimeout(() => document.getElementById('2fa-login-token')?.focus(), 100);

      // Store resolve function for later
      this.pending2FAResolve = resolve;
    });
  }

  showBackupCodeInput() {
    document.getElementById('backup-code-input').style.display = 'block';
  }

  async submit2FA(sessionId) {
    const token = document.getElementById('2fa-login-token').value;
    const backupCode = document.getElementById('2fa-backup-code')?.value;

    try {
      const response = await fetch(`${this.apiBase}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          token: token || undefined,
          backupCode: backupCode || undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        this.closeModal();
        if (this.pending2FAResolve) {
          this.pending2FAResolve({ success: true });
          this.pending2FAResolve = null;
        }
      } else {
        alert(data.error || 'Invalid code. Please try again.');
      }
    } catch (error) {
      console.error('2FA verification failed:', error);
      alert('Verification failed. Please try again.');
    }
  }
}

// Initialize
twoFactorUI = new TwoFactorAuthUI();
