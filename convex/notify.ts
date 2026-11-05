import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { sign } from "./lib/hmac";

// Sends a signed webhook to n8n. Retries with exponential backoff; final failure is logged (never silent).
export const send = internalAction({
  args: { loanId: v.id("loans"), event: v.string(), attempt: v.number() },
  handler: async (ctx, a) => {
    const url = process.env.N8N_WEBHOOK_URL;
    const secret = process.env.WEBHOOK_SECRET;
    if (!url || !secret) throw new Error("N8N_WEBHOOK_URL / WEBHOOK_SECRET not configured");

    const payload = await ctx.runQuery(internal.loans.notifyPayload, { loanId: a.loanId, event: a.event });
    if (!payload) return;

    const body = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000).toString();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lendloop-timestamp": ts,
          "x-lendloop-signature": await sign(secret, ts, body),
        },
        body,
      });
      if (!res.ok) throw new Error(`n8n responded ${res.status}`);
      await ctx.runMutation(internal.notify.log, { loanId: a.loanId, event: a.event, status: "sent", attempts: a.attempt + 1 });
    } catch (err) {
      if (a.attempt < 4) {
        await ctx.scheduler.runAfter(2 ** a.attempt * 30_000, internal.notify.send, { ...a, attempt: a.attempt + 1 });
      } else {
        await ctx.runMutation(internal.notify.log, { loanId: a.loanId, event: a.event, status: "failed", attempts: a.attempt + 1 });
        console.error("Webhook delivery failed permanently", a.loanId, a.event, String(err));
      }
    }
  },
});

export const log = internalMutation({
  args: { loanId: v.id("loans"), event: v.string(), status: v.union(v.literal("sent"), v.literal("failed")), attempts: v.number() },
  handler: async (ctx, a) => {
    await ctx.db.insert("automationEvents", { ...a, at: Date.now() });
  },
});
