import type { FrameworkInfoDto, HealthDto, ProviderInfoDto, SettingsDto } from "@mrd/contracts";
import { request } from "../../kernel/http.js";
export const getSettings = () => request<SettingsDto>("/api/settings");
export const saveSettings = (s: Partial<SettingsDto>) => request<SettingsDto>("/api/settings", { method: "PUT", json: s });
export const getProviders = () => request<ProviderInfoDto[]>("/api/providers");
export const getFrameworks = () => request<FrameworkInfoDto[]>("/api/frameworks");
export const getHealth = () => request<HealthDto>("/api/health");
