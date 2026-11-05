"use client";
import { UserButton, useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const CATEGORIES = [
  "power tools",
  "hand tools",
  "garden",
  "kitchen",
  "camping",
  "other",
];
type Tab = "browse" | "mine" | "requests" | "incoming" | "admin";

async function run(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    alert(e instanceof Error ? e.message : "Something went wrong");
  }
}

export default function Dashboard() {
  const store = useMutation(api.users.store);
  const me = useQuery(api.users.me);
  const { isLoaded, isSignedIn } = useAuth();
  const [tab, setTab] = useState<Tab>("browse");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      void store();
    }
  }, [isLoaded, isSignedIn, store]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const tabs: [Tab, string][] = [
    ["browse", "Browse"],
    ["mine", "My listings"],
    ["requests", "My requests"],
    ["incoming", "Incoming requests"],
  ];
  if (me?.role === "admin") tabs.push(["admin", "Admin"]);

  return (
    <main>
      <div className="row">
        <h1>
          <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
            LendLoop
          </Link>
        </h1>
        <UserButton />
      </div>
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
      <div className="tabs">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>
      {!me ? (
        <p className="muted">Setting up your account…</p>
      ) : (
        <>
          {tab === "browse" && (
            <Browse
              isAdmin={me.role === "admin"}
              myId={me._id}
              onNotice={setToast}
            />
          )}
          {tab === "mine" && <Mine onNotice={setToast} />}
          {tab === "requests" && (
            <LoanList source="requests" onNotice={setToast} />
          )}
          {tab === "incoming" && (
            <LoanList source="incoming" onNotice={setToast} />
          )}
          {tab === "admin" && <Admin onNotice={setToast} />}
        </>
      )}
    </main>
  );
}

function Browse({
  isAdmin,
  myId,
  onNotice,
}: {
  isAdmin: boolean;
  myId: Id<"users">;
  onNotice: (msg: string) => void;
}) {
  const [category, setCategory] = useState("");
  const tools = useQuery(api.tools.list, { category: category || undefined });
  const request = useMutation(api.loans.request);
  const remove = useMutation(api.tools.remove);
  const [dates, setDates] = useState<Record<string, { s: string; e: string }>>(
    {},
  );

  return (
    <>
      <select value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {tools?.map((t) => {
        const d = dates[t._id] ?? { s: "", e: "" };
        return (
          <div className="card" key={t._id}>
            <div className="row">
              <strong>{t.name}</strong>
              <span className="badge">
                {t.status === "available" ? "available" : "on loan"}
              </span>
            </div>
            <div className="muted">
              {t.category} · {t.condition} · by {t.ownerName}
              {t.ownerTrusted ? " ✓ Trusted Lender" : ""}
            </div>
            <div>{t.description}</div>
            <div className="row" style={{ marginTop: 8 }}>
              {t.ownerId !== myId && (
                <span>
                  <input
                    type="date"
                    value={d.s}
                    onChange={(e) =>
                      setDates({
                        ...dates,
                        [t._id]: { ...d, s: e.target.value },
                      })
                    }
                  />{" "}
                  <input
                    type="date"
                    value={d.e}
                    onChange={(e) =>
                      setDates({
                        ...dates,
                        [t._id]: { ...d, e: e.target.value },
                      })
                    }
                  />{" "}
                  <button
                    className="primary"
                    onClick={() =>
                      run(async () => {
                        await request({
                          toolId: t._id,
                          startDate: d.s,
                          endDate: d.e,
                        });
                        onNotice("Borrow request sent successfully.");
                      })
                    }
                  >
                    Request
                  </button>
                </span>
              )}
              {isAdmin && (
                <button
                  onClick={() =>
                    run(async () => {
                      await remove({ toolId: t._id });
                      onNotice("Listing removed.");
                    })
                  }
                >
                  Remove (admin)
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Mine({ onNotice }: { onNotice: (msg: string) => void }) {
  const tools = useQuery(api.tools.mine);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const d = new FormData(f);
    await run(async () => {
      await create({
        name: String(d.get("name")),
        category: String(d.get("category")),
        condition: String(d.get("condition")),
        description: String(d.get("description")),
      });
      onNotice("Tool listing created.");
    });
    f.reset();
  }

  return (
    <>
      <form className="grid" onSubmit={submit}>
        <input name="name" placeholder="Tool name" required maxLength={80} />
        <select name="category">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          name="condition"
          placeholder="Condition (e.g. good)"
          required
          maxLength={40}
        />
        <textarea
          name="description"
          placeholder="Short description"
          required
          maxLength={300}
        />
        <button className="primary">List tool</button>
      </form>

      {tools?.map((t) => (
        <div className="card" key={t._id}>
          {editingId === t._id ? (
            <EditToolForm
              tool={t}
              onCancel={() => setEditingId(null)}
              onSave={async (payload) => {
                await run(async () => {
                  await update({ toolId: t._id, ...payload });
                  onNotice("Tool listing updated.");
                });
                setEditingId(null);
              }}
            />
          ) : (
            <div className="row">
              <span>
                {t.name}{" "}
                <span className="muted">
                  · {t.category} · {t.status}
                </span>
              </span>
              <span>
                <button onClick={() => setEditingId(t._id)}>Edit</button>{" "}
                <button
                  onClick={() =>
                    run(async () => {
                      await remove({ toolId: t._id });
                      onNotice("Tool listing deleted.");
                    })
                  }
                >
                  Delete
                </button>
              </span>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function EditToolForm({
  tool,
  onCancel,
  onSave,
}: {
  tool: {
    _id: string;
    name: string;
    category: string;
    condition: string;
    description: string;
  };
  onCancel: () => void;
  onSave: (payload: {
    name: string;
    category: string;
    condition: string;
    description: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(tool.name);
  const [category, setCategory] = useState(tool.category);
  const [condition, setCondition] = useState(tool.condition);
  const [description, setDescription] = useState(tool.description);

  return (
    <div className="grid">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
      />
      <select value={category} onChange={(e) => setCategory(e.target.value)}>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input
        value={condition}
        onChange={(e) => setCondition(e.target.value)}
        maxLength={40}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={300}
      />
      <div className="row">
        <button
          className="primary"
          onClick={() => onSave({ name, category, condition, description })}
        >
          Save
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function LoanList({
  source,
  onNotice,
}: {
  source: "requests" | "incoming";
  onNotice: (msg: string) => void;
}) {
  const mine = useQuery(api.loans.myRequests);
  const incoming = useQuery(api.loans.incoming);
  const decide = useMutation(api.loans.decide);
  const markReturned = useMutation(api.loans.markReturned);
  const loans = source === "requests" ? mine : incoming;
  return (
    <>
      {loans?.length === 0 && <p className="muted">Nothing here yet.</p>}
      {loans?.map((l) => (
        <div className="card" key={l._id}>
          <div className="row">
            <strong>{l.toolName}</strong>
            <span className="badge">{l.status}</span>
          </div>
          <div className="muted">
            {l.startDate} → {l.endDate} ·{" "}
            {source === "requests"
              ? `from ${l.ownerName}`
              : `by ${l.borrowerName}`}
          </div>
          {source === "incoming" && l.status === "requested" && (
            <div style={{ marginTop: 8 }}>
              <button
                className="primary"
                onClick={() =>
                  run(async () => {
                    await decide({ loanId: l._id, approve: true });
                    onNotice("Borrow request approved.");
                  })
                }
              >
                Approve
              </button>{" "}
              <button
                onClick={() =>
                  run(async () => {
                    await decide({ loanId: l._id, approve: false });
                    onNotice("Borrow request declined.");
                  })
                }
              >
                Decline
              </button>
            </div>
          )}
          {source === "incoming" && l.status === "approved" && (
            <button
              style={{ marginTop: 8 }}
              onClick={() =>
                run(async () => {
                  await markReturned({ loanId: l._id });
                  onNotice("Loan marked as returned.");
                })
              }
            >
              Mark returned
            </button>
          )}
        </div>
      ))}
    </>
  );
}

function Admin({ onNotice }: { onNotice: (msg: string) => void }) {
  const loans = useQuery(api.loans.all);
  const setTrusted = useMutation(api.users.setTrusted);
  return (
    <>
      <h2>All loans</h2>
      {loans?.map((l) => (
        <div className="card row" key={l._id}>
          <span>
            {l.toolName}{" "}
            <span className="muted">
              · {l.ownerName} → {l.borrowerName} · {l.status}
            </span>
          </span>
          <span>
            <button
              onClick={() =>
                run(async () => {
                  await setTrusted({ userId: l.ownerId, trusted: true });
                  onNotice("Lender marked as trusted.");
                })
              }
            >
              Mark lender Trusted
            </button>{" "}
            <button
              onClick={() =>
                run(async () => {
                  await setTrusted({ userId: l.ownerId, trusted: false });
                  onNotice("Lender trust removed.");
                })
              }
            >
              Untrust
            </button>
          </span>
        </div>
      ))}
    </>
  );
}
