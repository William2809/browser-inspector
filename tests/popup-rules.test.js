// Popup rules tests

import { jest } from '@jest/globals';
import {
  showAddRuleForm,
  hideAddRuleForm,
  clearRuleForm,
  saveRule,
  removeRule,
  renderRules
} from '../src/popup/popup-rules.js';

describe('popup-rules', () => {
  let elements;

  beforeEach(() => {
    document.body.innerHTML = '';
    chrome.runtime.sendMessage.mockClear();

    elements = {
      addRuleForm: document.createElement('div'),
      addRuleBtn: document.createElement('button'),
      ruleName: document.createElement('input'),
      ruleUrl: document.createElement('input'),
      ruleExtractFrom: document.createElement('select'),
      ruleKey: document.createElement('input'),
      rulesList: document.createElement('div'),
      toast: document.createElement('div')
    };
    elements.ruleExtractFrom.innerHTML = '<option value="header">header</option>';
    elements.ruleExtractFrom.value = 'header';
    elements.toast.innerHTML = '<span class="toast-message"></span>';
  });

  it('should show and hide add rule form', () => {
    showAddRuleForm(elements);
    expect(elements.addRuleForm.classList.contains('active')).toBe(true);
    expect(elements.addRuleBtn.style.display).toBe('none');

    hideAddRuleForm(elements);
    expect(elements.addRuleForm.classList.contains('active')).toBe(false);
    expect(elements.addRuleBtn.style.display).toBe('');
  });

  it('should clear rule form inputs', () => {
    elements.ruleName.value = 'name';
    elements.ruleUrl.value = 'url';
    elements.ruleExtractFrom.value = 'cookie';
    elements.ruleKey.value = 'key';

    clearRuleForm(elements);
    expect(elements.ruleName.value).toBe('');
    expect(elements.ruleUrl.value).toBe('');
    expect(elements.ruleExtractFrom.value).toBe('header');
    expect(elements.ruleKey.value).toBe('');
  });

  it('should reject invalid rule submission', async () => {
    elements.ruleName.value = '';
    elements.ruleKey.value = '';

    const result = await saveRule(elements);
    expect(result).toBe(false);
    expect(elements.toast.querySelector('.toast-message').textContent).toBe('Please fill required fields');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('should save valid rule and call onSuccess', async () => {
    const onSuccess = jest.fn();
    elements.ruleName.value = 'My Rule';
    elements.ruleUrl.value = 'https://api.example.com/*';
    elements.ruleExtractFrom.value = 'header';
    elements.ruleKey.value = 'Authorization';

    const result = await saveRule(elements, onSuccess);
    expect(result).toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_CUSTOM_RULE' }));
    expect(onSuccess).toHaveBeenCalled();
  });

  it('should save valid rule without onSuccess handler', async () => {
    elements.ruleName.value = 'My Rule';
    elements.ruleUrl.value = '';
    elements.ruleExtractFrom.value = 'header';
    elements.ruleKey.value = 'Authorization';

    const result = await saveRule(elements);
    expect(result).toBe(true);
  });

  it('should remove rule and call onSuccess', async () => {
    const onSuccess = jest.fn();
    await removeRule(elements, 'RuleA', onSuccess);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'REMOVE_CUSTOM_RULE', name: 'RuleA' });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('should remove rule without onSuccess handler', async () => {
    await removeRule(elements, 'RuleB');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'REMOVE_CUSTOM_RULE', name: 'RuleB' });
  });

  it('should render custom rules and attach delete handlers', () => {
    const onDelete = jest.fn();
    renderRules(elements, {
      rules: [
        { name: 'rule-1', displayName: 'Rule One', extractFrom: 'header', extractKey: 'X-Key' }
      ]
    }, onDelete);

    const deleteBtn = elements.rulesList.querySelector('.rule-delete');
    expect(deleteBtn).toBeTruthy();

    deleteBtn.dispatchEvent(new MouseEvent('click'));
    expect(onDelete).toHaveBeenCalledWith('rule-1');
  });

  it('should render built-in rules when no custom rules exist', () => {
    renderRules(elements, {}, () => {});
    expect(elements.rulesList.textContent).toContain('Auth Token Handler');
  });

  it('should fall back to rule name when displayName is missing', () => {
    renderRules(elements, {
      rules: [{ name: 'rule-2', extractFrom: 'cookie', extractKey: 'session' }]
    }, () => {});

    expect(elements.rulesList.textContent).toContain('rule-2');
  });
});
