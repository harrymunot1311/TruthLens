const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const input = $("#claimInput");
const verifyBtn = $("#verifyBtn");
const result = $("#result");
const loading = $("#loading");
const fileInput = $("#fileInput");
const uploadArea = $("#uploadArea");
const textInputArea = $("#textInputArea");
let inputType = "message";
let selectedFile = null;
let apiConfigured = false;
let healthReady = false;
const healthPromise = fetch("/api/health").then(r => r.json()).then(data => { apiConfigured = Boolean(data.searchConfigured && data.aiConfigured); healthReady = true; }).catch(() => { apiConfigured = false; healthReady = true; });

const tabConfig = {
  message: { label: "THE MESSAGE OR CLAIM", placeholder: "Paste the message, claim, or headline you want to check...", hint: "Tip: include the exact wording you saw and where it came from." },
  link: { label: "THE WEBSITE LINK", placeholder: "Paste the article, post, or webpage URL...", hint: "Tip: use the original webpage URL rather than a screenshot." }
};

$$(".tab").forEach(tab => tab.addEventListener("click", () => {
  $$(".tab").forEach(x => { x.classList.remove("active"); x.setAttribute("aria-selected", "false"); });
  tab.classList.add("active"); tab.setAttribute("aria-selected", "true");
  inputType = tab.dataset.type;
  const isFile = inputType === "image" || inputType === "file";
  textInputArea.classList.toggle("hidden", isFile);
  uploadArea.classList.toggle("hidden", !isFile);
  selectedFile = null;
  fileInfoReset();
  if (isFile) {
    const imageMode = inputType === "image";
    $("#uploadTitle").textContent = imageMode ? "Drop your image here or browse files" : "Drop your video or document here";
    $("#uploadDescription").textContent = imageMode ? "PNG, JPG, WEBP supported" : "PDF, DOC, DOCX, TXT, MP4, MOV supported";
    fileInput.accept = imageMode ? "image/png,image/jpeg,image/webp" : ".pdf,.doc,.docx,.txt,.mp4,.mov,.webm";
    $("#inputHint").textContent = "Demo mode can show file details, but does not inspect the file contents.";
  } else {
    input.placeholder = tabConfig[inputType].placeholder;
    $("#inputLabel").textContent = tabConfig[inputType].label;
    $("#inputHint").textContent = tabConfig[inputType].hint;
  }
}));

$("#browseBtn").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => setSelectedFile(fileInput.files[0]));
["dragenter", "dragover"].forEach(eventName => uploadArea.addEventListener(eventName, e => { e.preventDefault(); uploadArea.classList.add("dragover"); }));
["dragleave", "drop"].forEach(eventName => uploadArea.addEventListener(eventName, e => { e.preventDefault(); uploadArea.classList.remove("dragover"); }));
uploadArea.addEventListener("drop", e => { const file = e.dataTransfer.files[0]; if (file) setSelectedFile(file); });
function setSelectedFile(file) {
  if (!file) return;
  selectedFile = file;
  $("#fileInfo").textContent = `Selected: ${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  $("#fileInfo").classList.remove("hidden");
}
function fileInfoReset() { $("#fileInfo").textContent = ""; $("#fileInfo").classList.add("hidden"); fileInput.value = ""; }

verifyBtn.addEventListener("click", verify);
input.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") verify(); });

async function verify() {
  const value = input.value.trim();
  if ((inputType === "message" || inputType === "link") && !value) { input.focus(); return; }
  if ((inputType === "image" || inputType === "file") && !selectedFile) { fileInput.click(); return; }
  loading.classList.remove("hidden"); result.classList.add("hidden"); verifyBtn.disabled = true; verifyBtn.innerHTML = "CHECKING…";
  try {
    let data;
    if (inputType === "image" || inputType === "file") {
      data = localReview(value, selectedFile);
    } else {
      if (!healthReady) await healthPromise;
      if (!apiConfigured) {
        data = localReview(value, selectedFile);
      } else {
      const response = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: value, type: inputType }) });
      data = await response.json();
      if (!response.ok) throw new Error(data.error || "Verification failed.");
      }
    }
    renderResult(data);
  } catch (error) {
    result.innerHTML = `<div class="result-grid"><div><div class="verdict unclear">Unable to complete check</div><div class="confidence">PLEASE TRY AGAIN</div></div><div><p class="explanation">${escapeHtml(error.message)}</p><p class="explanation">You can still use TruthLens in local demo mode without API keys.</p></div></div>`;
    result.classList.remove("hidden");
  } finally {
    loading.classList.add("hidden"); verifyBtn.disabled = false; verifyBtn.innerHTML = 'CHECK NOW <span>→</span>';
  }
}

function localReview(value, file) {
  const isFile = Boolean(file);
  const isImage = inputType === "image";
  const text = value || "the selected item";
  const checks = [
    ["Find the original source", "Who first published this information? Can you locate the original post, report, or document?"],
    ["Check the date and context", "Is the information current? Could an old image, quote, or event be presented as new?"],
    ["Compare independent sources", "Look for confirmation from more than one credible and independent source."],
    ["Look for missing details", "Check names, places, numbers, image captions, and what may have been left out."]
  ];
  return {
    mode: "offline",
    verdict: "Manual review needed",
    confidence: null,
    explanation: isFile
      ? `Your ${isImage ? "image" : "file"} “${file.name}” is selected. This no-key demo can confirm the file was added, but it does not analyse its contents or search for matching sources. Use the checklist below to review it carefully.`
      : `Your ${inputType === "link" ? "link" : "claim"} has been received in this browser. Without a connected search or analysis service, TruthLens cannot confirm whether it is true or false. Use these steps to examine “${text.slice(0, 180)}${text.length > 180 ? "…" : ""}”.`,
    evidence: checks.map(([label, detail]) => ({ label, text: detail })),
    sources: [],
    inputType
  };
}

function renderResult(data) {
  const offline = data.mode === "offline";
  const verdict = data.verdict || "Insufficient evidence";
  const cls = verdict.toLowerCase().includes("true") && !verdict.toLowerCase().includes("false") ? "true" : verdict.toLowerCase().includes("false") ? "false" : verdict.toLowerCase().includes("partly") ? "partly" : "unclear";
  const sources = (data.sources || []).map(s => `<div class="source"><a href="${escapeAttr(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title || s.url)}</a><p>${escapeHtml(s.snippet || "No snippet available.")}</p></div>`).join("");
  const evidence = (data.evidence || []).map(e => `<div class="source"><a>${escapeHtml(e.label || "Review point")}</a><p>${escapeHtml(e.text || "")}</p></div>`).join("");
  result.innerHTML = `<div class="result-grid"><div><div class="verdict ${cls}">${escapeHtml(verdict)}</div><div class="confidence">${offline ? "LOCAL DEMO · NO FACTUAL VERDICT" : `CONFIDENCE · ${Number(data.confidence || 0)}%`}</div></div><div><p class="explanation">${escapeHtml(data.explanation || "")}</p>${evidence ? `<div class="source-list"><div class="eyebrow">${offline ? "YOUR REVIEW CHECKLIST" : "EVIDENCE NOTES"}</div>${evidence}</div>` : ""}${sources ? `<div class="source-list"><div class="eyebrow">SOURCES CHECKED</div>${sources}</div>` : ""}</div></div>`;
  result.classList.remove("hidden"); result.scrollIntoView({ behavior: "smooth", block: "center" });
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }

const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add("visible"); }), { threshold: 0.12 });
$$(".reveal").forEach(el => observer.observe(el));
document.addEventListener("mousemove", e => { const glow = $(".cursor-glow"); glow.style.left = `${e.clientX}px`; glow.style.top = `${e.clientY}px`; });

const menuBtn = $("#menuBtn");
menuBtn.addEventListener("click", () => { const nav = $("#mainNav"); const open = nav.classList.toggle("open"); menuBtn.setAttribute("aria-expanded", String(open)); menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu"); });
$$(".nav-link").forEach(link => link.addEventListener("click", () => { $("#mainNav").classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }));
const sections = ["home", "verify", "how", "about"].map(id => document.getElementById(id));
const navObserver = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { $$(".nav-link").forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`)); } }), { rootMargin: "-30% 0px -60% 0px" });
sections.forEach(section => navObserver.observe(section));
