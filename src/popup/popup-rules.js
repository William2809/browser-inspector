// Popup rules - custom rule management UI

import { sendMessage, showToast, escapeHtml } from './popup-utils.js';

// Show add rule form
export function showAddRuleForm(elements) {
  elements.addRuleForm.classList.add('active');
  elements.addRuleBtn.style.display = 'none';
}

// Hide add rule form
export function hideAddRuleForm(elements) {
  elements.addRuleForm.classList.remove('active');
  elements.addRuleBtn.style.display = '';
  clearRuleForm(elements);
}

// Clear rule form inputs
export function clearRuleForm(elements) {
  elements.ruleName.value = '';
  elements.ruleUrl.value = '';
  elements.ruleExtractFrom.value = 'header';
  elements.ruleKey.value = '';
}

// Save a new custom rule
export async function saveRule(elements, onSuccess) {
  const name = elements.ruleName.value.trim();
  const urlPattern = elements.ruleUrl.value.trim();
  const extractFrom = elements.ruleExtractFrom.value;
  const extractKey = elements.ruleKey.value.trim();

  if (!name || !extractKey) {
    showToast(elements, 'Please fill required fields');
    return false;
  }

  const rule = {
    name,
    displayName: name,
    urlPattern,
    extractFrom,
    extractKey
  };

  await sendMessage({ type: 'ADD_CUSTOM_RULE', rule });
  hideAddRuleForm(elements);
  showToast(elements, 'Rule added');

  if (onSuccess) {
    await onSuccess();
  }

  return true;
}

// Remove a custom rule
export async function removeRule(elements, ruleName, onSuccess) {
  await sendMessage({ type: 'REMOVE_CUSTOM_RULE', name: ruleName });
  showToast(elements, 'Rule removed');

  if (onSuccess) {
    await onSuccess();
  }
}

// Render rules list
export function renderRules(elements, config, onDeleteRule) {
  const customRules = config.rules || [];

  const customRulesHTML = customRules.map(rule => `
    <div class="rule-item custom">
      <div class="rule-info">
        <span class="rule-name">${escapeHtml(rule.displayName || rule.name)}</span>
        <span class="rule-desc">${escapeHtml(rule.extractFrom)}: ${escapeHtml(rule.extractKey)}</span>
      </div>
      <button class="data-item-btn delete rule-delete" data-name="${escapeHtml(rule.name)}" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>
  `).join('');

  const builtInHTML = `
    <div class="rule-item builtin">
      <div class="rule-info">
        <span class="rule-name">Auth Token Handler</span>
        <span class="rule-desc">Authorization, X-Auth-Token, API keys</span>
      </div>
      <span class="rule-badge builtin">BUILT-IN</span>
    </div>
    <div class="rule-item builtin">
      <div class="rule-info">
        <span class="rule-name">Cookie Handler</span>
        <span class="rule-desc">Session cookies, auth cookies</span>
      </div>
      <span class="rule-badge builtin">BUILT-IN</span>
    </div>
    <div class="rule-item builtin">
      <div class="rule-info">
        <span class="rule-name">Query Param Handler</span>
        <span class="rule-desc">api_key, token, access_token in URLs</span>
      </div>
      <span class="rule-badge builtin">BUILT-IN</span>
    </div>
  `;

  elements.rulesList.innerHTML = builtInHTML + customRulesHTML;

  // Attach delete handlers
  elements.rulesList.querySelectorAll('.rule-delete').forEach(btn => {
    btn.addEventListener('click', () => onDeleteRule(btn.dataset.name));
  });
}
