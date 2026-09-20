import { handleApi } from "./api.js";

export default {
  async fetch(request, env, ctx) {
    const api = await handleApi(request, env, ctx);
    if (api) return api;
    return env.ASSETS.fetch(request);
  },
};
