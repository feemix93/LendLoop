import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Idempotent: the same (loan, day) write-back from an n8n retry never creates a second row.
export const record = internalMutation({
  args: { loanId: v.id("loans"), date: v.string(), status: v.union(v.literal("sent"), v.literal("failed")), channel: v.string() },
  handler: async (ctx, a) => {
    const key = `${a.loanId}:${a.date}`;
    const existing = await ctx.db.query("reminders").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (existing) return { duplicate: true };
    await ctx.db.insert("reminders", { loanId: a.loanId, key, status: a.status, channel: a.channel, at: Date.now() });
    return { duplicate: false };
  },
});
