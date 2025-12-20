import "./index.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState } from "react";
import type { InboundEmail, OutboundEmail } from "@hamzasaleemorg/convex-inbound";

function App() {
  const inboundEmails = (useQuery(api.example.listEmails, {}) ?? []) as InboundEmail[];
  const sentEmails = (useQuery(api.example.listSentEmails, {}) ?? []) as OutboundEmail[];
  const sendEmail = useMutation(api.example.sendTestEmail);
  const replyToEmail = useMutation(api.example.replyToEmail);
  const [activeTab, setActiveTab] = useState<"inbox" | "sent" | "setup">("inbox");
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  // Compose/Reply State
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [isSending, setIsSending] = useState(false);

  const selectedInbound = inboundEmails.find((e: InboundEmail) => e._id === selectedEmailId);
  const selectedSent = sentEmails.find((e: OutboundEmail) => e._id === selectedEmailId);
  const selectedEmail = activeTab === "inbox" ? selectedInbound : selectedSent;

  // ... (keeping handleSend and handleReply the same)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    try {
      await sendEmail({ to, subject, text: body });
      setIsComposeOpen(false);
      setTo("");
      setSubject("");
      setBody("");
      alert("Email queued for sending!");
    } catch (err: any) {
      alert("Error sending: " + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleReply = async () => {
    if (!selectedEmailId || !replyBody) return;
    setIsSending(true);
    try {
      await replyToEmail({ emailId: selectedEmailId, text: replyBody });
      setReplyBody("");
      alert("Reply sent!");
    } catch (err: any) {
      alert("Error replying: " + err.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="main-container" style={{
      width: "100%",
      height: "100%",
      display: "flex",
      maxWidth: "1400px",
      margin: "0 auto",
      overflow: "hidden"
    }}>
      {/* Sidebar */}
      <div className="sidebar" style={{
        width: "240px",
        padding: "20px",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }}>
        <div style={{ padding: "10px 0 20px 0" }}>
          <h2 style={{ margin: 0, fontSize: "1.2rem", color: "var(--primary)" }}>Inbound.new</h2>
        </div>

        <button onClick={() => setIsComposeOpen(true)} style={{ marginBottom: "20px" }}>
          + Compose
        </button>

        <div
          onClick={() => setActiveTab("inbox")}
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            cursor: "pointer",
            background: activeTab === "inbox" ? "rgba(99, 102, 241, 0.1)" : "transparent",
            color: activeTab === "inbox" ? "var(--primary)" : "var(--text-muted)",
            fontWeight: activeTab === "inbox" ? "600" : "400",
            display: "flex", alignItems: "center", gap: "10px"
          }}>
          <span>📥</span> Inbox
        </div>
        <div
          onClick={() => setActiveTab("sent")}
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            cursor: "pointer",
            background: activeTab === "sent" ? "rgba(99, 102, 241, 0.1)" : "transparent",
            color: activeTab === "sent" ? "var(--primary)" : "var(--text-muted)",
            fontWeight: activeTab === "sent" ? "600" : "400",
            display: "flex", alignItems: "center", gap: "10px"
          }}>
          <span>📤</span> Sent
        </div>
        <div
          onClick={() => setActiveTab("setup")}
          style={{
            marginTop: "auto",
            padding: "12px 16px",
            borderRadius: "8px",
            cursor: "pointer",
            background: activeTab === "setup" ? "rgba(99, 102, 241, 0.1)" : "transparent",
            color: activeTab === "setup" ? "var(--primary)" : "var(--text-muted)",
            fontWeight: activeTab === "setup" ? "600" : "400",
            display: "flex", alignItems: "center", gap: "10px"
          }}>
          <span>⚙️</span> Setup
        </div>
      </div>

      {activeTab === "setup" ? (
        <div style={{ flex: 1, padding: "60px", backgroundColor: "var(--bg-surface)" }}>
          <h1 style={{ marginBottom: "30px" }}>Configure Inbound.new</h1>
          <div style={{ maxWidth: "600px", display: "flex", flexDirection: "column", gap: "30px" }}>
            <section className="glass" style={{ padding: "30px", borderRadius: "16px" }}>
              <h3 style={{ marginTop: 0 }}>1. Set API Key</h3>
              <p style={{ color: "var(--text-muted)" }}>
                Add your <b>INBOUND_API_KEY</b> to your Convex environment variables in the dashboard.
              </p>
            </section>

            <section className="glass" style={{ padding: "30px", borderRadius: "16px" }}>
              <h3 style={{ marginTop: 0 }}>2. Create Webhook in Inbound.new</h3>
              <ol style={{ color: "var(--text-muted)", paddingLeft: "20px", lineHeight: "1.8" }}>
                <li>Go to <a href="https://inbound.new/dashboard/endpoints" target="_blank" rel="noopener" style={{ color: "var(--primary)" }}>inbound.new/dashboard/endpoints</a></li>
                <li>Click "Create Endpoint" → Choose "Webhook"</li>
                <li>Set URL to your Convex site URL + <code>/api/inbound/webhook</code></li>
                <li>Copy the <b>Verification Token</b> from the endpoint config</li>
              </ol>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "15px" }}>
                Your webhook URL format: <code>https://[deployment].convex.site/api/inbound/webhook</code>
              </p>
            </section>

            <section className="glass" style={{ padding: "30px", borderRadius: "16px" }}>
              <h3 style={{ marginTop: 0 }}>3. Set Webhook Secret</h3>
              <p style={{ color: "var(--text-muted)" }}>
                Set the verification token as an environment variable:
              </p>
              <code style={{
                display: "block",
                marginTop: "10px",
                padding: "12px",
                backgroundColor: "rgba(0,0,0,0.3)",
                borderRadius: "6px",
                fontSize: "0.85rem"
              }}>
                npx convex env set INBOUND_WEBHOOK_SECRET your-token-here
              </code>
            </section>
          </div>
        </div>
      ) : (
        <>
          {/* Email List */}
          <div className="list-panel" style={{
            width: "400px",
            borderRight: "1px solid var(--border)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column"
          }}>
            <div style={{ padding: "20px", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ margin: 0 }}>{activeTab === "inbox" ? "Received" : "Sent"}</h3>
            </div>

            {activeTab === "inbox" && inboundEmails.map((email: InboundEmail) => (
              <div
                key={email._id}
                onClick={() => setSelectedEmailId(email._id)}
                style={{
                  padding: "20px",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  background: selectedEmailId === email._id ? "rgba(255,255,255,0.03)" : "transparent",
                  transition: "background 0.2s"
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontWeight: "600", fontSize: "0.9rem", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {email.from}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {new Date(email.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontWeight: "500", fontSize: "0.85rem", marginBottom: "4px", color: "white" }}>
                  {email.subject}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {email.text?.substring(0, 100)}
                </div>
              </div>
            ))}

            {activeTab === "sent" && sentEmails.map((email: OutboundEmail) => (
              <div
                key={email._id}
                onClick={() => setSelectedEmailId(email._id)}
                style={{
                  padding: "20px",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  background: selectedEmailId === email._id ? "rgba(255,255,255,0.03)" : "transparent",
                  transition: "background 0.2s"
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontWeight: "600", fontSize: "0.9rem", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    To: {Array.isArray(email.to) ? email.to[0] : email.to}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {new Date(email._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontWeight: "500", fontSize: "0.85rem", marginBottom: "4px", color: "white" }}>
                  {email.subject}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" }}>
                    {email.text?.substring(0, 50)}
                  </div>
                  <span style={{
                    fontSize: "0.65rem",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    backgroundColor: email.status === "failed" ? "rgba(239, 68, 68, 0.1)" : "rgba(16, 185, 129, 0.1)",
                    color: email.status === "failed" ? "#f87171" : "#34d399",
                    border: `1px solid ${email.status === "failed" ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)"}`
                  }}>
                    {email.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}

            {activeTab === "inbox" && inboundEmails.length === 0 && (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                No emails received yet.
              </div>
            )}
            {activeTab === "sent" && sentEmails.length === 0 && (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                No emails sent yet.
              </div>
            )}
          </div>

          {/* Detail View */}
          <div className="detail-panel" style={{ flex: 1, backgroundColor: "var(--bg-surface)", overflowY: "auto" }}>
            {selectedEmail ? (
              <div style={{ padding: "40px", paddingBottom: "100px" }}>
                <h1 style={{ margin: "0 0 20px 0", fontSize: "1.8rem" }}>{selectedEmail.subject}</h1>
                <div style={{ display: "flex", gap: "12px", marginBottom: "30px", alignItems: "center" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>
                    {selectedEmail.from[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: "600" }}>
                      {activeTab === "inbox" ? selectedEmail.from : `To: ${Array.isArray(selectedEmail.to) ? selectedEmail.to.join(", ") : selectedEmail.to}`}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {activeTab === "inbox" ? "to me" : `from ${selectedEmail.from}`}
                    </div>
                  </div>
                </div>

                <div style={{
                  backgroundColor: "rgba(255,255,255,0.02)",
                  padding: "24px",
                  borderRadius: "12px",
                  lineHeight: "1.6",
                  whiteSpace: "pre-wrap",
                  marginBottom: "40px"
                }}>
                  {selectedEmail.html ? (
                    <div dangerouslySetInnerHTML={{ __html: selectedEmail.html }} />
                  ) : (
                    selectedEmail.text
                  )}
                </div>

                {activeTab === "inbox" && (
                  <div className="reply-section glass" style={{ padding: "20px", borderRadius: "12px" }}>
                    <textarea
                      placeholder="Type your reply here..."
                      value={replyBody}
                      onChange={e => setReplyBody(e.target.value)}
                      style={{ minHeight: "120px", marginBottom: "15px" }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button onClick={handleReply} disabled={isSending}>
                        {isSending ? "Sending Reply..." : "Reply"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                Select an email to view details
              </div>
            )}
          </div>
        </>
      )}

      {/* Compose Modal */}
      {isComposeOpen && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.8)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000
        }}>
          <form className="glass" onSubmit={handleSend} style={{
            width: "500px",
            padding: "30px",
            borderRadius: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "15px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <h2 style={{ margin: 0 }}>New Message</h2>
              <button type="button" onClick={() => setIsComposeOpen(false)} style={{ background: "transparent", border: "none", fontSize: "1.5rem", padding: 0 }}>×</button>
            </div>
            <input
              placeholder="To"
              value={to}
              onChange={e => setTo(e.target.value)}
              required
            />
            <input
              placeholder="Subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              required
            />
            <textarea
              placeholder="Write your email..."
              value={body}
              onChange={e => setBody(e.target.value)}
              style={{ minHeight: "200px" }}
              required
            />
            <button disabled={isSending} type="submit">
              {isSending ? "Sending..." : "Send Now"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
