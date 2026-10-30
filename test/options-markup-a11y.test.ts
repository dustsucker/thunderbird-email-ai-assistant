/**
 * Guards the options page markup contract:
 * tab/panel wiring, label targets, key toggles and inline validation rules.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const html = readFileSync(path.resolve(__dirname, '../options.html'), 'utf-8');

describe('options.html', () => {
  beforeEach(() => {
    // options.ts fragt IDs/Klassen ab; der Test prueft nur das Markup.
    document.body.innerHTML = '';
  });

  it('verbindet jede Tab-Schaltflaeche mit genau einem Panel', () => {
    const container = document.createElement('div');
    container.innerHTML = html;
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const panels = container.querySelectorAll<HTMLElement>('[role="tabpanel"]');

    expect(tabs.length).toBe(4);
    expect(tabs.length).toBe(panels.length);

    tabs.forEach((tab) => {
      expect(tab.getAttribute('aria-selected')).toMatch(/^(true|false)$/);
      expect(container.querySelector(`#${tab.getAttribute('aria-controls')}`)).not.toBeNull();
      expect(container.querySelector(`#${tab.id}`)).not.toBeNull();
    });

    panels.forEach((panel) => {
      const labelledBy = panel.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(container.querySelector(`#${labelledBy}`)).not.toBeNull();
    });
  });

  it('beschriftet den Konfidenz-Slider und teilt den Hilfetext', () => {
    const container = document.createElement('div');
    container.innerHTML = html;

    const slider = container.querySelector<HTMLInputElement>('#min-confidence-threshold-slider');
    const number = container.querySelector<HTMLInputElement>('#min-confidence-threshold');
    const help = container.querySelector<HTMLElement>('#min-confidence-help');

    expect(slider).not.toBeNull();
    expect(container.querySelector('label[for="min-confidence-threshold-slider"]')).not.toBeNull();
    expect(help).not.toBeNull();
    expect(slider?.getAttribute('aria-describedby')).toBe('min-confidence-help');
    expect(number?.getAttribute('aria-describedby')).toBe('min-confidence-help');
    expect(number?.getAttribute('aria-label')).toBeTruthy();
  });

  it('gibt jedem Passwortfeld einen Show/Hide-Toggle', () => {
    const container = document.createElement('div');
    container.innerHTML = html;

    const passwordFields = container.querySelectorAll<HTMLInputElement>(
      '#provider-options-form input[type="password"]'
    );
    const toggles = container.querySelectorAll<HTMLButtonElement>('.key-toggle');

    expect(passwordFields.length).toBe(8);
    expect(toggles.length).toBe(passwordFields.length);

    toggles.forEach((toggle) => {
      const field = container.querySelector<HTMLInputElement>(
        `#${toggle.getAttribute('aria-controls')}`
      );
      expect(field?.type).toBe('password');
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
    });
  });

  it('hat einen Verbindungstest je Provider-Panel und keine nativen Pflichtfelder', () => {
    const container = document.createElement('div');
    container.innerHTML = html;

    const form = container.querySelector<HTMLFormElement>('#provider-options-form');
    expect(form?.hasAttribute('novalidate')).toBe(true);

    const panels = container.querySelectorAll<HTMLElement>('.provider-settings');
    expect(panels.length).toBe(9);

    panels.forEach((panel) => {
      expect(panel.querySelector('.test-connection')).not.toBeNull();
      expect(panel.querySelector('.connection-result')?.getAttribute('role')).toBe('status');
      expect(panel.querySelectorAll('[required], [pattern]').length).toBe(0);
    });

    expect(container.querySelectorAll('#provider-options-form [data-validate]').length).toBe(12);
  });

  it('kündigt Statusmeldungen per aria-live an', () => {
    const container = document.createElement('div');
    container.innerHTML = html;

    ['provider-status-message', 'queue-status-message', 'cache-status-message'].forEach((id) => {
      expect(container.querySelector(`#${id}`)?.getAttribute('aria-live')).toBe('polite');
    });
  });
});
