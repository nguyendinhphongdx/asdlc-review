import type { StorageCheckDto, StorageDto, ConnectionStatusDto, ConnectionTestDto, FrameworkInfoDto, HealthDto, ProviderInfoDto, SaveGitlabConnectionInput, SettingsDto, WebhookSecretDto } from "@mrd/contracts";
import { request } from "../../kernel/http.js";
export const getSettings = () => request<SettingsDto>("/api/settings");
export const saveSettings = (s: Partial<SettingsDto>) => request<SettingsDto>("/api/settings", { method: "PUT", json: s });
export const getProviders = () => request<ProviderInfoDto[]>("/api/providers");
export const getFrameworks = () => request<FrameworkInfoDto[]>("/api/frameworks");
export const getHealth = () => request<HealthDto>("/api/health");

export const getConnection = () => request<ConnectionStatusDto>("/api/connection");
export const saveGitlabConnection = (i: SaveGitlabConnectionInput) => request<ConnectionStatusDto>("/api/connection/gitlab", { method: "PUT", json: i });
export const deleteGitlabConnection = () => request<void>("/api/connection/gitlab", { method: "DELETE" });
export const testConnection = () => request<ConnectionTestDto>("/api/connection/test", { method: "POST", json: {} });
export const getWebhookSecret = () => request<WebhookSecretDto>("/api/connection/webhook-secret");
export const regenerateWebhookSecret = () => request<WebhookSecretDto>("/api/connection/webhook-secret/regenerate", { method: "POST", json: {} });
export const getStorage = () => request<StorageDto>("/api/storage");
export const checkStorage = (path: string) => request<StorageCheckDto>("/api/storage/check", { method: "POST", json: { path } });
