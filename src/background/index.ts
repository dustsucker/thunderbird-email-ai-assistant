/**
 * Background Module Entry Point
 *
 * Exports all background services and handlers.
 *
 * @module background
 */

export { setupDIContainer, startupLogger } from './DIContainer';
export { ContextMenuHandler } from './ContextMenuHandler';
export { ToolbarHandler } from './ToolbarHandler';
export { InstallHandler } from './InstallHandler';
export { BackgroundScript } from './BackgroundScript';
