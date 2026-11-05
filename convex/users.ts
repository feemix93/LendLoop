import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUser, requireAdmin } from "./lib/auth";

// Called once after sign-in. Role is decided server-side only (ADMIN_EMAILS); clients can never set it.
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const existing = await getUser(ctx);
    if (existing) return existing._id;

    const email = (identity.email ?? "").toLowerCase();
    const admins = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name ?? email.split("@")[0] ?? "Neighbor",
      email,
      role: email && admins.includes(email) ? "admin" : "user",
      trusted: false,
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const u = await getUser(ctx);
    return u && { _id: u._id, name: u.name, role: u.role, trusted: u.trusted };
  },
});

export const setTrusted = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    await ctx.db.patch(a.userId, { trusted: a.trusted });
  },
});
