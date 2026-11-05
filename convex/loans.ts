import { internalQuery, mutation, query, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireAdmin, requireUser } from "./lib/auth";
import { isDate, today } from "./lib/validate";
import { Doc } from "./_generated/dataModel";

async function enrich(ctx: QueryCtx, loans: Doc<"loans">[]) {
  return Promise.all(
    loans.map(async (l) => {
      const [tool, owner, borrower] = await Promise.all([ctx.db.get(l.toolId), ctx.db.get(l.ownerId), ctx.db.get(l.borrowerId)]);
      return { ...l, toolName: tool?.name ?? "(removed)", ownerName: owner?.name ?? "?", borrowerName: borrower?.name ?? "?" };
    })
  );
}

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    return enrich(ctx, await ctx.db.query("loans").withIndex("by_borrower", (q) => q.eq("borrowerId", me._id)).collect());
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    return enrich(ctx, await ctx.db.query("loans").withIndex("by_owner", (q) => q.eq("ownerId", me._id)).collect());
  },
});

export const all = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return enrich(ctx, await ctx.db.query("loans").collect());
  },
});

async function assertNoOverlap(ctx: QueryCtx, toolId: Doc<"tools">["_id"], start: string, end: string) {
  const loans = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", toolId)).collect();
  if (loans.some((l) => l.status === "approved" && start <= l.endDate && end >= l.startDate)) {
    throw new Error("Tool is already booked for those dates");
  }
}

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, a) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(a.toolId);
    if (!tool) throw new Error("Tool not found");
    if (tool.ownerId === me._id) throw new Error("You cannot borrow your own tool");
    if (!isDate(a.startDate) || !isDate(a.endDate) || a.startDate > a.endDate || a.endDate < today()) throw new Error("Invalid dates");
    await assertNoOverlap(ctx, tool._id, a.startDate, a.endDate);
    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id, ownerId: tool.ownerId, borrowerId: me._id,
      startDate: a.startDate, endDate: a.endDate, status: "requested",
    });
    await ctx.scheduler.runAfter(0, internal.notify.send, { loanId, event: "created", attempt: 0 });
    return loanId;
  },
});

// Only the tool's owner can approve or decline
export const decide = mutation({
  args: { loanId: v.id("loans"), approve: v.boolean() },
  handler: async (ctx, a) => {
    const me = await requireUser(ctx);
    const loan = await ctx.db.get(a.loanId);
    if (!loan || loan.ownerId !== me._id) throw new Error("Forbidden");
    if (loan.status !== "requested") throw new Error("Request already handled");
    if (a.approve) {
      await assertNoOverlap(ctx, loan.toolId, loan.startDate, loan.endDate);
      await ctx.db.patch(loan._id, { status: "approved" });
      await ctx.db.patch(loan.toolId, { status: "on_loan" });
    } else {
      await ctx.db.patch(loan._id, { status: "declined" });
    }
    await ctx.scheduler.runAfter(0, internal.notify.send, { loanId: loan._id, event: a.approve ? "approved" : "declined", attempt: 0 });
  },
});

// Owner (or admin) marks the loan as returned
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, a) => {
    const me = await requireUser(ctx);
    const loan = await ctx.db.get(a.loanId);
    if (!loan || (loan.ownerId !== me._id && me.role !== "admin")) throw new Error("Forbidden");
    if (loan.status !== "approved") throw new Error("Loan is not active");
    await ctx.db.patch(loan._id, { status: "returned" });
    await ctx.db.patch(loan.toolId, { status: "available" });
    await ctx.scheduler.runAfter(0, internal.notify.send, { loanId: loan._id, event: "returned", attempt: 0 });
  },
});

// ---- internal: used by notify action and HTTP endpoints (never exposed to clients) ----

// Data minimization: only what the workflow needs to notify ONE recipient
export const notifyPayload = internalQuery({
  args: { loanId: v.id("loans"), event: v.string() },
  handler: async (ctx, a) => {
    const loan = await ctx.db.get(a.loanId);
    if (!loan) return null;
    const [tool, owner, borrower] = await Promise.all([ctx.db.get(loan.toolId), ctx.db.get(loan.ownerId), ctx.db.get(loan.borrowerId)]);
    const recipient = a.event === "created" ? owner : borrower;
    if (!tool || !recipient) return null;
    return {
      eventId: `${loan._id}:${a.event}`,
      event: a.event,
      toolName: tool.name,
      startDate: loan.startDate,
      endDate: loan.endDate,
      recipient: { name: recipient.name, email: recipient.email },
    };
  },
});

export const overdue = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, a) => {
    const active = await ctx.db.query("loans").withIndex("by_status", (q) => q.eq("status", "approved")).collect();
    const rows = [];
    for (const l of active.filter((x) => x.endDate < a.today)) {
      const [tool, borrower] = await Promise.all([ctx.db.get(l.toolId), ctx.db.get(l.borrowerId)]);
      if (!tool || !borrower) continue;
      const days = Math.floor((Date.parse(a.today) - Date.parse(l.endDate)) / 86400000);
      rows.push({ loanId: l._id, toolName: tool.name, endDate: l.endDate, daysOverdue: days, borrower: { name: borrower.name, email: borrower.email } });
    }
    return rows;
  },
});
