import { supabase } from '../lib/supabase'

const loadPdfJs = () => new Promise((res, rej) => {
  if (window.pdfjsLib) { res(window.pdfjsLib); return; }
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  s.onload = () => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    res(window.pdfjsLib);
  };
  s.onerror = () => rej(new Error("Failed to load PDF.js"));
  document.head.appendChild(s);
});

export const pdfToBase64 = async file => {
  const lib    = await loadPdfJs();
  const pdf    = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page   = await pdf.getPage(1);
  const vp     = page.getViewport({ scale: 1 });
  const canvas = document.createElement("canvas");
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  return { b64: canvas.toDataURL("image/jpeg", 0.75).split(",")[1], mediaType: "image/jpeg" };
};

export const fileToBase64 = f => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload  = () => res({ b64: r.result.split(",")[1], mediaType: f.type || "image/jpeg" });
  r.onerror = rej;
  r.readAsDataURL(f);
});

export const extractInvoice = async (b64, mediaType, suppliers) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session — please sign in again');
  const res = await fetch("/api/extract", {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      b64,
      mediaType,
      supplierNames: suppliers.map(s => s.name).join(", "),
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
};
