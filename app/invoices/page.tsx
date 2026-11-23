"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session-gate";
import { selectedArtistId } from "@/packages/studio/artist-selection";
import { invoiceEmail } from "@/packages/invoices/action-input";
import UiIcon from "@/components/ui-icon";
import "../checkout/checkout.css";
import "./invoices.css";
import { CatalogPicker } from "./catalog-picker";
import { CustomerPicker, type InvoiceClient } from "./customer-picker";
import {
  invoiceStatusLabel,
  invoiceDeliveryLabel,
} from "@/packages/invoices/status";
import {
  isInvoiceOverdue,
  getOverdueSinceDate,
} from "@/packages/invoices/overdue";
type Line = { name: string; quantity: number; unitCents: number };
type Invoice = {
  id: string;
  artistId: string;
  clientName: string;
  clientEmail: string;
  clientId: string | null;
  smsStatus: string;
  emailStatus: string;
  lines: Line[];
  totalCents: number;
  status: string;
  stripeInvoiceId: string | null;
  hostedUrl: string | null;
  note: string;
  dueDays: number;
  createdAt: string;
  issuingAt: string | null;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value / 100,
  );
async function read(response: Response) {
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Unable to load invoices.");
  return data;
}
export default function Invoices() {
  const user = useSession();
  const [artists, setArtists] = useState<
      Array<{ id: string; displayName: string }>
    >([]),
    [artistId, setArtistId] = useState(""),
    [rows, setRows] = useState<Array<{ invoice: Invoice; artistName: string }>>(
      [],
    ),
    [selected, setSelected] = useState<Invoice | null>(null),
    [creating, setCreating] = useState(false),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [clients, setClients] = useState<InvoiceClient[]>([]),
    [clientId, setClientId] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false),
    [clientsLoading, setClientsLoading] = useState(false),
    [clientsError, setClientsError] = useState("");
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [customerPhone, setCustomerPhone] = useState(""),
    [note, setNote] = useState(""),
    [dueDays, setDueDays] = useState(1),
    [lines, setLines] = useState([{ name: "", quantity: 1, price: "" }]),
    [requestId, setRequestId] = useState("");
  const [issueEmail, setIssueEmail] = useState("");
  const actionRunning = useRef(false);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const [shareLink, setShareLink] = useState<{invoiceId:string;hostedUrl:string;url:string}|null>(null);
  const shareUrl = shareLink && shareLink.invoiceId === selected?.id && shareLink.hostedUrl === selected?.hostedUrl ? shareLink.url : "";
  const [shareError, setShareError] = useState("");
  useEffect(() => {
    if (!selected?.id) return;
    const frame = requestAnimationFrame(() => {
      reviewHeadingRef.current?.focus({ preventScroll: true });
      reviewHeadingRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected?.id]);
  useEffect(() => {
    setShareLink(null);
    setShareError("");
    if (!selected?.hostedUrl) return;
    const controller = new AbortController();
    fetch(`/api/invoices/share?invoiceId=${encodeURIComponent(selected.id)}`, { cache: "no-store", signal: controller.signal })
      .then(read)
      .then(data => { if (!controller.signal.aborted) setShareLink({invoiceId:selected.id,hostedUrl:selected.hostedUrl!,url:data.shareUrl}); })
      .catch(() => { if (!controller.signal.aborted) setShareError("Unable to prepare the branded link. Reopen this invoice to retry."); });
    return () => controller.abort();
  }, [selected?.id, selected?.hostedUrl]);

  const [smsDetails, setSmsDetails] = useState<{
      phone: string | null;
      consent: boolean;
      eligible: boolean;
      reason: string;
      delivery: string | null;
    } | null>(null),
    [smsLoading, setSmsLoading] = useState(false),
    [smsError, setSmsError] = useState(""),
    [phoneOpen, setPhoneOpen] = useState(false),
    [phoneInput, setPhoneInput] = useState(""),
    [smsVersion, setSmsVersion] = useState(0),
    [smsSendFeedback, setSmsSendFeedback] = useState<{
      invoiceId: string;
      type: "error" | "success";
      message: string;
    } | null>(null),
    [copyFeedback, setCopyFeedback] = useState<{
      invoiceId: string;
      message: string;
    } | null>(null);
  const [emailFeedback, setEmailFeedback] = useState<{
      invoiceId: string;
      type: "error" | "success";
      message: string;
    } | null>(null),
    [emailSending, setEmailSending] = useState(false),
    [emailForm, setEmailForm] = useState({ open: false, address: "", confirmed: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuActionResult, setMenuActionResult] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setIssueEmail("");
  }, [selected?.id]);
  useEffect(() => {
    setMenuOpen(false);
    setMenuActionResult(null);
  }, [selected?.id]);
  useEffect(() => {
    setSmsDetails(null);
    setSmsError("");
    setPhoneOpen(false);
    setPhoneInput("");
    if (
      !selected?.id ||
      !selected.clientId ||
      (selected.status !== "OPEN" && selected.smsStatus === "NOT_SENT")
    )
      return;
    const controller = new AbortController();
    setSmsLoading(true);
    fetch(`/api/invoices/details?invoiceId=${selected.id}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(read)
      .then((data) => {
        if (!controller.signal.aborted) setSmsDetails(data);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSmsError(
            "Unable to check phone and SMS consent. Reopen this invoice to retry.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSmsLoading(false);
      });
    return () => controller.abort();
  }, [
    selected?.id,
    selected?.clientId,
    selected?.status,
    selected?.smsStatus,
    smsVersion,
  ]);
  async function savePhone(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await fetch("/api/invoices/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: selected.id, phone: phoneInput }),
      }).then(read);
      setSmsDetails((current) => ({
        phone: data.phone,
        consent: data.consent,
        eligible: data.eligible,
        reason: data.reason,
        delivery: current?.delivery || null,
      }));
      setPhoneOpen(false);
      setMessage("Phone number saved. No message was sent.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to save phone number.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copyPaymentLink(invoiceId: string, url: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopyFeedback({ invoiceId, message: "Link copied" });
      setTimeout(() => setCopyFeedback(current => current?.invoiceId === invoiceId && current.message === "Link copied" ? null : current), 2000);
    } catch {
      setCopyFeedback({ invoiceId, message: "Unable to copy. Select and copy the link above." });
    }
  }
  async function load() {
    const data = await fetch(`/api/invoices?page=${page}`, {
      cache: "no-store",
    }).then(read);
    setRows(data.rows);
    setMore(data.hasMore);
  }
  useEffect(() => {
    if (!user) return;
    fetch(`/api/ai/settings?organizationId=${user.organization_id}`)
      .then(read)
      .then((data) => {
        setArtists(data.artists);
        setArtistId(selectedArtistId(data.artists, data.defaultArtistId));
      })
      .catch((error) => setError(error.message));
  }, [user]);
  useEffect(() => {
    setLoading(true);
    void load()
      .catch((error) => setError(error.message))
      .finally(() => setLoading(false));
  }, [page]);
  useEffect(() => {
    const invoiceId = new URLSearchParams(window.location.search).get("invoiceId");
    if (!invoiceId) return;
    const controller = new AbortController();
    fetch(`/api/invoices?invoiceId=${encodeURIComponent(invoiceId)}`, { cache: "no-store", signal: controller.signal })
      .then(read)
      .then(data => { if (!controller.signal.aborted) setSelected(data.invoice); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load invoice."); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    setClientId("");
    setName("");
    setEmail("");
    setCustomerPhone("");
    setClients([]);
    setClientsError("");
    if (!artistId) {
      setClientsLoading(false);
      return;
    }
    setClientsLoading(true);
    const controller = new AbortController();
    fetch(`/api/invoices/clients?artistId=${artistId}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(read)
      .then((data) => {
        if (!controller.signal.aborted) setClients(data.clients);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setClientsError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setClientsLoading(false);
      });
    return () => controller.abort();
  }, [artistId]);
  const total = lines.reduce(
    (sum, line) =>
      sum + line.quantity * Math.round(Number(line.price || 0) * 100),
    0,
  );
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!name.trim())
        throw Error("Add a customer before saving the invoice.");
      if (lines.some((line) => !/^\d+(\.\d{1,2})?$/.test(line.price)))
        throw Error("Enter each price with up to two decimals.");
      const data = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE",
          artistId,
          requestId,
          ...(clientId ? { clientId } : { newClient: { ...(customerPhone.trim() ? { phone: customerPhone.trim() } : {}) } }),
          clientName: name,
          clientEmail: email,
          note,
          dueDays,
          lines: lines.map((line) => ({
            name: line.name,
            quantity: line.quantity,
            unitCents: Math.round(Number(line.price) * 100),
          })),
        }),
      }).then(read);
      setCreating(false);
      setSelected(data.invoice);
      setMessage(
        "Draft saved. Review it before creating a payment link or sending an SMS.",
      );
      await load();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to save draft.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(action: "ISSUE" | "SYNC" | "SEND_SMS" | "SEND_EMAIL" | "VOID") {
    if (!selected || actionRunning.current) return;
    if (action === "ISSUE" && !selected.clientEmail && !selected.stripeInvoiceId && issueEmail.trim()) {
      if (!invoiceEmail.safeParse(issueEmail).success) {
        setError('Enter a valid customer email address.');
        return;
      }
    }
    actionRunning.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    if (action === "SEND_SMS") setSmsSendFeedback(null);
    if (action === "SEND_EMAIL") setEmailFeedback(null);
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          invoiceId: selected.id,
          ...(action === "ISSUE" &&
          !selected.clientEmail &&
          !selected.stripeInvoiceId && issueEmail.trim()
            ? { customerEmail: issueEmail.trim() }
            : {}),
          ...(action === "SEND_EMAIL" && emailForm.address
            ? { recipientEmail: emailForm.address.trim() }
            : {}),
        }),
      });
      const data = await response.json();
      if (data.invoice) setSelected(data.invoice);
      if (!response.ok) throw Error(data.error || "Unable to update invoice.");
      if (action === "SEND_SMS") {
        setSmsSendFeedback({
          invoiceId: selected.id,
          type: "success",
          message: data.message || "Invoice sent by SMS.",
        });
        if (sendButtonRef.current) {
          setTimeout(() => {
            if (
              sendButtonRef.current &&
              sendButtonRef.current.getBoundingClientRect().bottom >
                window.innerHeight
            ) {
              sendButtonRef.current.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }
          }, 0);
        }
      } else if (action === "SEND_EMAIL") {
        setEmailFeedback({
          invoiceId: selected.id,
          type: "success",
          message: data.message || "Invoice sent by email.",
        });
        setEmailForm({ open: false, address: "", confirmed: false });
      } else {
        setMessage(
          data.message ||
            (action === "ISSUE"
              ? "Payment link ready. No SMS has been sent."
              : action === "VOID" ? "Invoice cancelled. The payment link no longer accepts payments." : "Invoice status refreshed."),
        );
      }
      await load();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Unable to update invoice.";
      if (action === "SEND_SMS") {
        setSmsSendFeedback({
          invoiceId: selected.id,
          type: "error",
          message: msg,
        });
        if (sendButtonRef.current) {
          setTimeout(() => {
            if (
              sendButtonRef.current &&
              sendButtonRef.current.getBoundingClientRect().bottom >
                window.innerHeight
            ) {
              sendButtonRef.current.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }
          }, 0);
        }
      } else if (action === "SEND_EMAIL") {
        setEmailFeedback({
          invoiceId: selected.id,
          type: "error",
          message: msg,
        });
      } else {
        setError(msg);
      }
    } finally {
      if (action === "SEND_SMS") setSmsVersion(current => current + 1);
      actionRunning.current = false;
      setBusy(false);
    }
  }
  async function sendReminder() {
    if (!selected) return;
    setMenuActionResult(null);
    setBusy(true);
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SEND_SMS",
          invoiceId: selected.id,
        }),
      });
      const data = await response.json();
      if (data.invoice) setSelected(data.invoice);
      if (!response.ok) throw Error(data.error || "Unable to send reminder.");
      setMenuActionResult({
        type: "success",
        message: data.message || "Reminder sent.",
      });
    } catch (error) {
      setMenuActionResult({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to send reminder.",
      });
    } finally {
      setBusy(false);
    }
  }
  async function downloadPdf() {
    if (!selected) return;
    window.open(
      `/api/invoices/preview?invoiceId=${encodeURIComponent(selected.id)}`,
      "_blank"
    );
  }
  async function shareInvoice() {
    if (!selected || !shareUrl) return;
    setMenuActionResult(null);
    // Try to use native share if available
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invoice for ${selected.clientName}`,
          text: `Please review and pay this invoice`,
          url: shareUrl,
        });
        setMenuActionResult({
          type: "success",
          message: "Shared successfully.",
        });
      } catch (error) {
        // User cancelled or share failed
        if (error instanceof Error && error.name !== "AbortError") {
          setMenuActionResult({
            type: "error",
            message: "Unable to share.",
          });
        }
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        setMenuActionResult({
          type: "success",
          message: "Payment link copied.",
        });
      } catch (error) {
        setMenuActionResult({
          type: "error",
          message: "Unable to copy link.",
        });
      }
    }
  }
  return (
    <main
      className={`checkout-page invoice-page ${creating ? "invoice-editing" : ""}`}
    >
      <a href="/more">← More</a>
      <header>
        <div>
          <h1>Invoices</h1>
          <p>
            Create a draft, review it, then share a secure payment link or send
            it by SMS.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() => {
            setCreating(true);
            setSelected(null);
            setClientId("");
            setName("");
            setEmail("");
            setCustomerPhone("");
            setNote("");
            setLines([{ name: "", quantity: 1, price: "" }]);
            setRequestId(crypto.randomUUID());
            setError("");
            setMessage("");
          }}
        >
          + New invoice
        </button>
      </header>
      {error && (
        <p role="alert" className="checkout-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="checkout-receipt">
          {message}
        </p>
      )}
      {creating && (
        <form className="invoice-builder" onSubmit={create}>
          <header className="invoice-toolbar">
            <button
              type="button"
              disabled={busy}
              aria-label="Close invoice"
              onClick={() => setCreating(false)}
            >
              ✕
            </button>
            <h2>Create invoice</h2>
            <button
              type="submit"
              disabled={busy || !artistId || !name.trim() || total <= 0}
            >
              {busy ? "Saving…" : "Save as draft"}
            </button>
          </header>
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, minWidth: 0 }}
          >
            <label>
              Artist
              <select
                required
                value={artistId}
                onChange={(event) => setArtistId(event.target.value)}
              >
                <option value="">Choose an artist</option>
                {artists.map((artist) => (
                  <option key={artist.id} value={artist.id}>
                    {artist.displayName}
                  </option>
                ))}
              </select>
            </label>
            <section className="invoice-section">
              <h2>Customer information</h2>
              {name ? (
                <>
                  <button
                    type="button"
                    className="invoice-customer-action"
                    disabled={busy}
                    onClick={() => setCustomerOpen(true)}
                  >
                    Change customer
                  </button>
                  <div className="invoice-customer-info">
                    <div>
                      <strong>{name}</strong>
                      <div className="invoice-customer-details">
                        {email || "No email"}{customerPhone ? ` · ${customerPhone}` : ""} ·{" "}
                        {clientId ? "Existing client" : "New customer"}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="invoice-customer-trigger"
                  disabled={!artistId || busy}
                  onClick={() => setCustomerOpen(true)}
                >
                  Select customer
                </button>
              )}
              {!artistId && <p>Choose an artist to select a customer.</p>}
            </section>
            <section className="invoice-section">
              <h2>Line items</h2>
              {artistId && (
                <CatalogPicker
                  key={artistId}
                  artistId={artistId}
                  disabled={lines.length >= 40}
                  capacity={
                    40 -
                    lines.filter((l) => l.name || l.price || l.quantity !== 1)
                      .length
                  }
                  onPick={(entries) => {
                    const added = entries.map((entry) => ({
                      name: entry.name,
                      quantity: 1,
                      price:
                        entry.priceCents === null
                          ? ""
                          : (entry.priceCents / 100).toFixed(2),
                    }));
                    setLines((current) => {
                      const next = [...current];
                      for (const line of added) {
                        const blank = next.findIndex(
                          (item) =>
                            !item.name && !item.price && item.quantity === 1,
                        );
                        if (blank >= 0) next[blank] = line;
                        else if (next.length < 40) next.push(line);
                      }
                      return next;
                    });
                  }}
                />
              )}
              {lines.map((line, index) => (
                <details className="invoice-line" key={index} open>
                  <summary>
                    <span>
                      {line.name || "New line item"}
                      <small>
                        {line.quantity} ×{" "}
                        {money(Math.round(Number(line.price || 0) * 100))}
                      </small>
                    </span>
                    <strong>
                      {money(
                        line.quantity *
                          Math.round(Number(line.price || 0) * 100),
                      )}
                    </strong>
                  </summary>
                  <label>
                    Item or service
                    <input
                      required
                      maxLength={160}
                      value={line.name}
                      onChange={(event) =>
                        setLines(
                          lines.map((item, i) =>
                            i === index
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <label>
                      Quantity
                      <input
                        required
                        type="number"
                        min={1}
                        max={99}
                        value={line.quantity}
                        onChange={(event) =>
                          setLines(
                            lines.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    quantity: Number(event.target.value),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Unit price (USD)
                      <input
                        required
                        inputMode="decimal"
                        value={line.price}
                        onChange={(event) =>
                          setLines(
                            lines.map((item, i) =>
                              i === index
                                ? { ...item, price: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setLines(lines.filter((_, i) => i !== index))
                      }
                    >
                      Remove line
                    </button>
                  )}
                </details>
              ))}
              <button
                type="button"
                disabled={lines.length >= 40}
                onClick={() =>
                  setLines([...lines, { name: "", quantity: 1, price: "" }])
                }
              >
                + Add Custom
              </button>
            </section>
            <section className="invoice-section">
              <h2>Payment terms</h2>
              <label>
                Due
                <select
                  value={dueDays}
                  onChange={(event) => setDueDays(Number(event.target.value))}
                >
                  {[1, 7, 14, 30, 60, 90].map((days) => (
                    <option key={days} value={days}>
                      {days === 1
                        ? "Within 24 hours of issue"
                        : `Within ${days} days of issue`}
                    </option>
                  ))}
                </select>
              </label>
              <div className="invoice-info-row">
                <span>Payment frequency</span>
                <strong>One time</strong>
              </div>
              <div className="invoice-info-row">
                <span>Delivery</span>
                <strong>Share link or SMS after review</strong>
              </div>
            </section>
            <section className="invoice-section">
              <h2>Payment options</h2>
              <div className="invoice-info-row">
                <span>Accepted payment method</span>
                <strong>Credit or debit card</strong>
              </div>
              <label>
                Note to client
                <textarea
                  maxLength={1000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  style={{
                    width: "100%",
                    minHeight: 80,
                    boxSizing: "border-box",
                  }}
                />
              </label>
              <h3>Total {money(total)}</h3>
              <p>
                Enter final prices in USD. Automatic tax, tips, and appointment
                deposits are not applied to invoices.
              </p>
            </section>
            <div className="checkout-charge-bar">
              <button
                className="checkout-primary"
                disabled={
                  !artistId || !name.trim() || total <= 0 || total > 100_000_000
                }
              >
                {busy ? "Saving…" : `Continue · ${money(total)}`}
              </button>
              <small>Saves a draft for review before issuing or sending.</small>
            </div>
          </fieldset>
        </form>
      )}
      {selected && (
        <section className="checkout-cart">
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 ref={reviewHeadingRef} tabIndex={-1} className="invoice-review-heading" style={{ flex: 1, margin: 0 }}>Invoice review</h2>
            <div className="invoice-menu-container">
              <button
                className="invoice-menu-button"
                onClick={() => setMenuOpen(!menuOpen)}
                disabled={busy}
                title="Invoice actions"
              >
                ···
              </button>
              {menuOpen && selected && (
                <div className="invoice-menu">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      void sendReminder();
                    }}
                    disabled={
                      selected.status !== "OPEN" || selected.smsStatus === "SENT"
                    }
                  >
                    Send reminder
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      void shareInvoice();
                    }}
                    disabled={!shareUrl || selected.status === "VOID"}
                  >
                    Share
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      if (window.confirm("Cancel this invoice? Its payment link will stop accepting payments.")) void action("VOID");
                    }}
                    disabled={busy || selected.status !== "OPEN" || !selected.stripeInvoiceId}
                  >
                    Cancel invoice
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      void downloadPdf();
                    }}
                  >
                    Download PDF
                  </button>
                </div>
              )}
            </div>
            <button disabled={busy} onClick={() => setSelected(null)}>
              Close
            </button>
          </header>
          {menuActionResult && (
            <div
              className={`invoice-menu-result ${menuActionResult.type}`}
              role={menuActionResult.type === "error" ? "alert" : "status"}
            >
              {menuActionResult.message}
            </div>
          )}
          <p>
            <strong>
              {invoiceStatusLabel(selected.status, selected.smsStatus)}
            </strong>{" "}
            · {selected.clientName}
            <br />
            {selected.clientEmail}
          </p>
          {isInvoiceOverdue({
            status: selected.status,
            issuingAt: selected.issuingAt ? new Date(selected.issuingAt) : null,
            createdAt: new Date(selected.createdAt),
            dueDays: selected.dueDays,
          }) && (
            <div className="invoice-overdue-label">
              Overdue since{" "}
              {getOverdueSinceDate({
                status: selected.status,
                issuingAt: selected.issuingAt ? new Date(selected.issuingAt) : null,
                createdAt: new Date(selected.createdAt),
                dueDays: selected.dueDays,
              })?.toLocaleDateString()}
            </div>
          )}
          {selected.lines.map((line, index) => (
            <p key={index}>
              {line.quantity} × {line.name} —{" "}
              {money(line.quantity * line.unitCents)}
            </p>
          ))}
          <h2
            style={
              isInvoiceOverdue({
                status: selected.status,
                issuingAt: selected.issuingAt ? new Date(selected.issuingAt) : null,
                createdAt: new Date(selected.createdAt),
                dueDays: selected.dueDays,
              })
                ? { color: "#dc2626" }
                : {}
            }
          >
            {money(selected.totalCents)}
          </h2>
          <p>
            Due within{" "}
            {selected.dueDays === 1 ? "24 hours" : `${selected.dueDays} days`}{" "}
            of issue.
          </p>
          {selected.note && <p>{selected.note}</p>}
          <p>
            <a
              href={`/api/invoices/preview?invoiceId=${encodeURIComponent(selected.id)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Preview PDF
            </a>
          </p>
          {(["DRAFT", "ISSUING"].includes(selected.status) ||
            (selected.status === "OPEN" && !selected.hostedUrl)) && (
            <>
              <p>
                Creating the link issues this invoice through the studio’s
                Stripe account. It does not charge the client or send a message.
              </p>
              {!selected.clientEmail && !selected.stripeInvoiceId && (
                <label>
                  Customer email (optional)
                  <input
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={issueEmail}
                    onChange={(event) => setIssueEmail(event.target.value)}
                    placeholder="name@example.com"
                  />
                  <small>
                    Leave blank to create a shareable payment link. Creating the
                    link does not send an email or charge the client.
                  </small>
                </label>
              )}
              <button
                className="checkout-primary"
                disabled={busy}
                onClick={() => void action("ISSUE")}
              >
                {busy
                  ? "Working…"
                  : selected.status !== "DRAFT" || error
                    ? "Retry creating payment link"
                    : "Create payment link"}
              </button>
            </>
          )}
          {selected.status !== "VOID" && selected.hostedUrl &&
            /^https:\/\/(?:invoice|pay)\.stripe\.com\//.test(
              selected.hostedUrl,
            ) && (
              <>
                <h3>Payment link ready</h3>
                <div className="invoice-link-row">
                  <label>
                    Client payment link
                    <input
                      readOnly
                      value={shareUrl}
                      placeholder="Preparing branded link…"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </label>
                  <button
                    className="invoice-copy-button"
                    disabled={busy || !shareUrl}
                    onClick={() => void copyPaymentLink(selected.id, shareUrl)}
                    aria-label="Copy payment link"
                    title="Copy payment link"
                  >
                    <UiIcon name="copy" />
                  </button>
                </div>
                {shareError && <p role="alert" className="checkout-error">{shareError}</p>}
                {copyFeedback?.invoiceId === selected.id && (
                  <p
                    className={
                      copyFeedback.message.includes("Unable")
                        ? "checkout-error"
                        : "checkout-receipt"
                    }
                    role={
                      copyFeedback.message.includes("Unable")
                        ? "alert"
                        : "status"
                    }
                  >
                    {copyFeedback.message}
                  </p>
                )}
                <a href={selected.hostedUrl} target="_blank" rel="noreferrer">
                  Open invoice
                </a>
              </>
            )}
          {(selected.status === "OPEN" ||
            selected.smsStatus !== "NOT_SENT") && (
            <>
              <p>
                SMS status:{" "}
                {invoiceDeliveryLabel(
                  selected.smsStatus,
                  smsDetails?.delivery || null,
                )}
              </p>
              {selected.clientId && (
                <button
                  type="button"
                  disabled={smsLoading || busy}
                  onClick={() => setSmsVersion((current) => current + 1)}
                >
                  Refresh SMS status
                </button>
              )}
              {smsLoading && (
                <p role="status">Checking client phone and consent…</p>
              )}
              {smsError && <p role="alert">{smsError}</p>}
              {selected.status === "OPEN" && (
                <>
                  {!selected.clientId && <p>Create an invoice for an existing client with SMS consent to send by SMS. You can still copy this payment link.</p>}
                  {selected.clientId && smsDetails && (
                    <>
                      <p>
                        Client phone: {smsDetails.phone || "Not on file"}.
                        {smsDetails.reason && ` ${smsDetails.reason}`}
                      </p>
                      {!smsDetails.phone && !phoneOpen && (
                        <button type="button" onClick={() => setPhoneOpen(true)}>Add phone number</button>
                      )}
                      {phoneOpen && (
                        <form onSubmit={savePhone}>
                          <label>
                            Client phone number
                            <input
                              type="tel"
                              autoComplete="tel"
                              value={phoneInput}
                              onChange={(event) =>
                                setPhoneInput(event.target.value)
                              }
                              required
                            />
                          </label>
                          <button disabled={busy}>Save phone number</button>
                        </form>
                      )}
                    </>
                  )}
                  <button
                    ref={sendButtonRef}
                    disabled={
                      busy ||
                      !selected.clientId ||
                      selected.smsStatus !== "NOT_SENT" ||
                      smsLoading ||
                      !smsDetails ||
                      !smsDetails.eligible
                    }
                    onClick={() => {
                      void action("SEND_SMS");
                    }}
                  >
                    Send invoice by SMS
                  </button>
                  {smsSendFeedback?.invoiceId === selected.id && (
                    <p
                      className={
                        smsSendFeedback.type === "error"
                          ? "checkout-error"
                          : "checkout-receipt"
                      }
                      role={smsSendFeedback.type === "error" ? "alert" : "status"}
                    >
                      {smsSendFeedback.message}
                    </p>
                  )}
                  <button
                    disabled={
                      busy || 
                      emailSending ||
                      !selected.stripeInvoiceId ||
                      selected.emailStatus === "SENT"
                    }
                    onClick={() => {
                      if (!emailForm.address && !selected.clientEmail) {
                        setEmailForm({ ...emailForm, open: true });
                      } else {
                        setEmailForm({ ...emailForm, address: selected.clientEmail, confirmed: true });
                        void action("SEND_EMAIL");
                      }
                    }}
                  >
                    Send invoice by email
                  </button>
                  {emailForm.open && !emailForm.confirmed && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        setEmailForm({ ...emailForm, confirmed: true });
                        void action("SEND_EMAIL");
                      }}
                    >
                      <label>
                        Recipient email
                        <input
                          type="email"
                          value={emailForm.address}
                          onChange={(e) =>
                            setEmailForm({ ...emailForm, address: e.target.value })
                          }
                          required
                        />
                      </label>
                      <button disabled={busy || emailSending}>Send</button>
                      <button
                        type="button"
                        disabled={busy || emailSending}
                        onClick={() =>
                          setEmailForm({ open: false, address: "", confirmed: false })
                        }
                      >
                        Cancel
                      </button>
                    </form>
                  )}
                  {emailFeedback?.invoiceId === selected.id && (
                    <p
                      className={
                        emailFeedback.type === "error"
                          ? "checkout-error"
                          : "checkout-receipt"
                      }
                      role={emailFeedback.type === "error" ? "alert" : "status"}
                    >
                      {emailFeedback.message}
                    </p>
                  )}
                  {!selected.clientId && (
                    <p>
                      This invoice has no linked client. Copy and share the link
                      instead.
                    </p>
                  )}
                </>
              )}
            </>
          )}
          {selected.status !== "DRAFT" && (
            <button disabled={busy} onClick={() => void action("SYNC")}>
              Refresh payment status
            </button>
          )}
        </section>
      )}
      {!creating && (
        <section className="checkout-cart">
          <h2>Current invoices</h2>
          {loading ? (
            <p role="status">Loading invoices…</p>
          ) : !rows.length ? (
            <p>No invoices yet.</p>
          ) : (
            rows.map(({ invoice, artistName }) => (
              <button
                className="checkout-method"
                key={invoice.id}
                disabled={busy}
                onClick={() => {
                  setSelected(invoice);
                  setCreating(false);
                  setMessage("");
                }}
              >
                <span>
                  <strong>{invoice.clientName}</strong>
                  <small
                    style={{ display: "block", marginTop: 6, fontWeight: 400 }}
                  >
                    {artistName} ·{" "}
                    {invoiceStatusLabel(invoice.status, invoice.smsStatus)}
                    <br />
                    {new Date(invoice.createdAt).toLocaleDateString()}
                  </small>
                </span>
                <span style={{ textAlign: "right" }}>
                  <strong>{money(invoice.totalCents)}</strong>
                  {isInvoiceOverdue({
                    status: invoice.status,
                    issuingAt: invoice.issuingAt ? new Date(invoice.issuingAt) : null,
                    createdAt: new Date(invoice.createdAt),
                    dueDays: invoice.dueDays,
                  }) && (
                    <small
                      style={{
                        display: "block",
                        marginTop: 6,
                        fontWeight: 400,
                        color: "#dc2626",
                      }}
                    >
                      Overdue
                    </small>
                  )}
                </span>
              </button>
            ))
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <button
              disabled={loading || !page || busy}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button
              disabled={loading || !more || busy}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}
      {customerOpen && (
        <CustomerPicker
          clients={clients}
          loading={clientsLoading}
          error={clientsError}
          value={{ clientId, name, email, phone: customerPhone }}
          onSave={(value) => {
            setClientId(value.clientId);
            setName(value.name);
            setEmail(value.email);
            setCustomerPhone(value.phone);
            setCustomerOpen(false);
          }}
          onClose={() => setCustomerOpen(false)}
        />
      )}
    </main>
  );
}
