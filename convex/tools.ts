import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";
import { checkCategory, clean } from "./lib/validate";

// Public: only currently available tools are shown, with name + category + status only.
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("tools").collect();
    return tools
      .filter((t) => t.status === "available")
      .map((t) => ({
        _id: t._id,
        name: t.name,
        category: t.category,
        status: t.status,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const list = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, a) => {
    await requireUser(ctx);
    const tools = await ctx.db.query("tools").collect();
    const rows = [];
    for (const t of tools) {
      if (a.category && t.category !== a.category) continue;
      const owner = await ctx.db.get(t.ownerId);
      rows.push({
        ...t,
        ownerName: owner?.name ?? "Unknown",
        ownerTrusted: owner?.trusted ?? false,
      });
    }
    return rows;
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    return ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", me._id))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
  },
  handler: async (ctx, a) => {
    const me = await requireUser(ctx);
    return ctx.db.insert("tools", {
      ownerId: me._id,
      name: clean(a.name, 80, "name"),
      category: checkCategory(a.category),
      condition: clean(a.condition, 40, "condition"),
      description: clean(a.description, 300, "description"),
      status: "available",
    });
  },
});

// Only the owner can edit (admins moderate by removing, not editing)
export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
  },
  handler: async (ctx, a) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(a.toolId);
    if (!tool || tool.ownerId !== me._id) throw new Error("Forbidden");
    await ctx.db.patch(a.toolId, {
      name: clean(a.name, 80, "name"),
      category: checkCategory(a.category),
      condition: clean(a.condition, 40, "condition"),
      description: clean(a.description, 300, "description"),
    });
  },
});

// Owner can delete own listing; admin can remove any listing
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, a) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(a.toolId);
    if (!tool) return;
    if (tool.ownerId !== me._id && me.role !== "admin")
      throw new Error("Forbidden");
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", a.toolId))
      .collect();
    if (loans.some((l) => l.status === "approved"))
      throw new Error("Tool is currently on loan");
    for (const l of loans)
      if (l.status === "requested") await ctx.db.delete(l._id);
    await ctx.db.delete(a.toolId);
  },
});
