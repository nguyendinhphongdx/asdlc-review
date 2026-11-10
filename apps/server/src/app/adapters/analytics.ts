import type { MemberDirectory, Params, RunFactsSource } from "../../modules/analytics/index.js";
import type { IdentityApi } from "../../modules/identity/index.js";
import type { ReviewsApi } from "../../modules/reviews/index.js";
import type { SettingsApi } from "../../modules/settings/index.js";

/** Nối port của `analytics` với API của các module khác. Đây là nơi duy nhất biết cả hai phía. */
export const runFactsAdapter = (reviews: ReviewsApi): RunFactsSource => ({ facts: (range) => reviews.facts(range) });

export const memberDirectoryAdapter = (identity: IdentityApi): MemberDirectory => ({
  async list() {
    return (await identity.list()).map((m) => ({ id: m.id, name: m.displayName, usernames: m.identities.map((i) => i.username), active: m.active }));
  },
});

export const paramsAdapter = (settings: SettingsApi): Params => ({ passScore: () => settings.get("passScore") });
